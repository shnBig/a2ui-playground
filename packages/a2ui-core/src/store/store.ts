import { createStore } from 'zustand/vanilla';
import type { StateCreator, StoreApi } from 'zustand/vanilla';
import {
  A2uiStoreState,
  AttachChildren,
  ComponentId,
  HydrateNode,
  HydrateNodeMap,
  RenderMap,
  Renderer,
  Surface,
  SurfaceId,
} from './types.js';

let errorSeq = 0;

function nextErrorId(): string {
  errorSeq += 1;
  return `error-${errorSeq}`;
}

/** init() 的配置项，TNode 由渲染层决定（a2ui-react 传入 ReactElement） */
export interface InitOptions<TNode = unknown> {
  /** 组件类型名 → 渲染器，用于把协议组件渲染成 _vnode */
  renderMap?: RenderMap<TNode>;
  /** 组装渲染树时把子节点挂到父 vnode 上的策略（React 下为 cloneElement） */
  attachChildren?: AttachChildren<TNode>;
}

/** 调用渲染器得到节点产物；未注册或抛错时返回 null */
function renderNode(
  node: HydrateNode,
  renderMap: RenderMap,
): unknown {
  if (!node.componentType) return null;
  const renderer = renderMap[node.componentType];
  if (!renderer) return null;
  try {
    return renderer(node.props, {
      componentId: node.componentId,
      surfaceId: node.ownerSurfaceId,
    });
  } catch {
    return null;
  }
}

/**
 * 渲染器表变化后，重算受影响类型节点的 _vnode，并同步指向这些节点的 surface.rootNode。
 * 只复制发生变化的分支，未命中的 surface / 节点保持原引用。
 */
function applyRendererChange(
  hydrateNodeMap: HydrateNodeMap,
  surfaceMap: Record<SurfaceId, Surface>,
  renderMap: RenderMap,
  componentType: string,
): {
  hydrateNodeMap: HydrateNodeMap;
  surfaceMap: Record<SurfaceId, Surface>;
} {
  let nodesChanged = false;
  const nextNodes: HydrateNodeMap = {};

  for (const [surfaceId, nodes] of Object.entries(hydrateNodeMap)) {
    let surfaceChanged = false;
    const nextSurfaceNodes: Record<ComponentId, HydrateNode> = {};
    for (const [componentId, node] of Object.entries(nodes)) {
      if (node.componentType === componentType) {
        nextSurfaceNodes[componentId] = { ...node, _vnode: renderNode(node, renderMap) };
        surfaceChanged = true;
      } else {
        nextSurfaceNodes[componentId] = node;
      }
    }
    nextNodes[surfaceId] = surfaceChanged ? nextSurfaceNodes : nodes;
    nodesChanged = nodesChanged || surfaceChanged;
  }

  if (!nodesChanged) {
    return { hydrateNodeMap, surfaceMap };
  }

  // surface.rootNode 存的是节点引用，节点重建后需要指向新对象
  let surfacesChanged = false;
  const nextSurfaces: Record<SurfaceId, Surface> = {};
  for (const [surfaceId, surface] of Object.entries(surfaceMap)) {
    const root = surface.rootNode;
    const fresh = root ? nextNodes[surfaceId]?.[root.componentId] : undefined;
    if (fresh && fresh !== root) {
      nextSurfaces[surfaceId] = { ...surface, rootNode: fresh };
      surfacesChanged = true;
    } else {
      nextSurfaces[surfaceId] = surface;
    }
  }

  return {
    hydrateNodeMap: nextNodes,
    surfaceMap: surfacesChanged ? nextSurfaces : surfaceMap,
  };
}

/**
 * store 的状态工厂，供 createStore 调用。
 * renderMap / attachChildren 由 init() 传入并作为 store 状态的一部分维护，reset() 不清空。
 */
const createA2uiStoreState = (
  initialRenderMap: RenderMap = {},
  initialAttachChildren: AttachChildren | null = null,
): StateCreator<A2uiStoreState> => (set, get) => ({
  surfaceMap: {},
  hydrateNodeMap: {},
  errors: [],
  renderMap: initialRenderMap,
  attachChildren: initialAttachChildren,

  addSurface: (surface) => {
    set((state) => ({
      surfaceMap: {
        ...state.surfaceMap,
        [surface.surfaceId]: {
          surfaceId: surface.surfaceId,
          beginRender: surface.beginRender ?? false,
          rootNode: surface.rootNode ?? null,
        },
      },
    }));
  },

  updateSurface: (surfaceId, patch) => {
    const current = get().surfaceMap[surfaceId];
    if (!current) {
      return;
    }
    set((state) => ({
      surfaceMap: {
        ...state.surfaceMap,
        [surfaceId]: { ...current, ...patch },
      },
    }));
  },

  /** 删除 surface 时级联清理其组件节点与错误记录 */
  removeSurface: (surfaceId) => {
    set((state) => {
      const surfaceMap = { ...state.surfaceMap };
      delete surfaceMap[surfaceId];

      const hydrateNodeMap: HydrateNodeMap = { ...state.hydrateNodeMap };
      delete hydrateNodeMap[surfaceId];

      return {
        surfaceMap,
        hydrateNodeMap,
        errors: state.errors.filter((error) => error.surfaceId !== surfaceId),
      };
    });
  },

  findSurface: (surfaceId) => get().surfaceMap[surfaceId],

  addHydrateNode: (node) => {
    set((state) => ({
      hydrateNodeMap: {
        ...state.hydrateNodeMap,
        [node.ownerSurfaceId]: {
          ...state.hydrateNodeMap[node.ownerSurfaceId],
          [node.componentId]: node,
        },
      },
    }));
  },

  updateHydrateNode: (surfaceId, componentId, patch) => {
    const current = get().hydrateNodeMap[surfaceId]?.[componentId];
    if (!current) {
      return;
    }
    set((state) => ({
      hydrateNodeMap: {
        ...state.hydrateNodeMap,
        [surfaceId]: {
          ...state.hydrateNodeMap[surfaceId],
          [componentId]: { ...current, ...patch },
        },
      },
    }));
  },

  removeHydrateNode: (surfaceId, componentId) => {
    set((state) => {
      const surfaceNodes = state.hydrateNodeMap[surfaceId];
      if (!surfaceNodes) {
        return state;
      }
      const nextNodes = { ...surfaceNodes };
      delete nextNodes[componentId];
      return {
        hydrateNodeMap: {
          ...state.hydrateNodeMap,
          [surfaceId]: nextNodes,
        },
        errors: state.errors.filter(
          (error) =>
            !(error.surfaceId === surfaceId && error.componentId === componentId),
        ),
      };
    });
  },

  findHydrateNode: (surfaceId, componentId) =>
    get().hydrateNodeMap[surfaceId]?.[componentId],

  /** 注册渲染器后，重算该类型已存在节点的 _vnode（解决"先解析、后注册"不渲染的问题） */
  addRenderer: (componentType, renderer) => {
    set((state) => {
      const renderMap: RenderMap = { ...state.renderMap, [componentType]: renderer };
      return { renderMap, ...applyRendererChange(state.hydrateNodeMap, state.surfaceMap as Record<SurfaceId, Surface>, renderMap, componentType) };
    });
  },

  removeRenderer: (componentType) => {
    set((state) => {
      const renderMap: RenderMap = { ...state.renderMap };
      delete renderMap[componentType];
      return { renderMap, ...applyRendererChange(state.hydrateNodeMap, state.surfaceMap as Record<SurfaceId, Surface>, renderMap, componentType) };
    });
  },

  findRenderer: (componentType) => get().renderMap[componentType],

  addError: (error) => {
    const errorId = error.errorId ?? nextErrorId();
    set((state) => ({
      errors: [...state.errors, { ...error, errorId }],
    }));
    return errorId;
  },

  removeError: (errorId) => {
    set((state) => ({
      errors: state.errors.filter((error) => error.errorId !== errorId),
    }));
  },

  findError: (errorId) => get().errors.find((error) => error.errorId === errorId),

  clearErrors: (surfaceId) => {
    set((state) => ({
      errors: surfaceId
        ? state.errors.filter((error) => error.surfaceId !== surfaceId)
        : [],
    }));
  },

  reset: () => {
    set({
      surfaceMap: {},
      hydrateNodeMap: {},
      errors: [],
    });
  },
});

/**
 * 当前 store 实例。由 init() 创建；未调用 init() 前为 null。
 * 通过 ESM 活绑定对外可见，新代码请优先使用 getStore()。
 */
export let a2uiStore: StoreApi<A2uiStoreState> | null = null;

/**
 * 初始化 a2ui store：调用 createStore 创建一个全新的 store 实例。
 * 每次调用都会生成新的 store（数据清空），并返回该实例。
 */
export function init<TNode = unknown>(options?: InitOptions<TNode>): StoreApi<A2uiStoreState> {
  a2uiStore = createStore<A2uiStoreState>()(
    createA2uiStoreState(
      (options?.renderMap ?? {}) as unknown as RenderMap,
      (options?.attachChildren ?? null) as unknown as AttachChildren | null,
    ),
  );
  return a2uiStore;
}

/**
 * 获取当前 store 实例。未 init 时抛出，避免消费方拿到 undefined。
 */
export function getStore(): StoreApi<A2uiStoreState> {
  if (!a2uiStore) {
    throw new Error('a2ui store is not initialized. Call init() first.');
  }
  return a2uiStore;
}

/**
 * 重置当前 store 到初始状态（不重建实例）。
 * 测试 / 应用重新开始时可调用；若需全新实例请使用 init()。
 */
export function initStore(): void {
  getStore().getState().reset();
}
