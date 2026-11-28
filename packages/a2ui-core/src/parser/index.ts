import { collectImplicitInits, resolveBoundProps } from '../store/dataModel.js';
import type { DataEntry, ImplicitWrite } from '../store/dataModel.js';
import { a2uiStore, getStore, init } from '../store/store.js';
import { treeBuild } from '../treebuilder/index.js';
import type { SurfaceTree } from '../treebuilder/index.js';
import { A2uiErrorType } from '../store/types.js';
import type { HydrateNode, HydrateNodeMap, Surface } from '../store/types.js';

export type { DataEntry };

/**
 * A2UI JSONL 协议解析器。
 * server→client 共四种消息：surfaceUpdate / beginRendering / dataModelUpdate / deleteSurface
 * 每条 JSONL 行恰好一个顶层 action key（schema additionalProperties: false）。
 */
export interface ParseResult {
  surfaces: Record<string, Surface>;
  /** 按 surface 分区的组件节点表 */
  hydrateNodes: HydrateNodeMap;
  /** 解析完成后组装出的组件树 */
  trees: SurfaceTree[];
  errorCount: number;
}

export interface ParseOptions {
  /** 是否在解析前 init() 重置 store，默认 true */
  reset?: boolean;
}

export type A2uiMessage =
  | SurfaceUpdateMessage
  | BeginRenderingMessage
  | DataModelUpdateMessage
  | DeleteSurfaceMessage;

export interface SurfaceUpdateMessage {
  surfaceUpdate: {
    surfaceId: string;
    components: Array<{
      id: string;
      weight?: number;
      component: Record<string, unknown>;
    }>;
  };
}

export interface BeginRenderingMessage {
  beginRendering: {
    surfaceId: string;
    root: string;
    catalogId?: string;
    styles?: Record<string, unknown>;
  };
}

export interface DataModelUpdateMessage {
  dataModelUpdate: {
    surfaceId: string;
    path?: string;
    contents: DataEntry[];
  };
}

export interface DeleteSurfaceMessage {
  deleteSurface: {
    surfaceId: string;
  };
}

/** 四种 server→client 消息的顶层 action key */
const ACTION_KEYS = [
  'surfaceUpdate',
  'beginRendering',
  'dataModelUpdate',
  'deleteSurface',
] as const;
type ActionKey = (typeof ACTION_KEYS)[number];

function detectAction(obj: Record<string, unknown>): ActionKey | null {
  for (const key of ACTION_KEYS) {
    if (key in obj) return key;
  }
  return null;
}

/**
 * beginRendering 早于 surfaceUpdate 到达时，暂存 surface→rootId 的映射，
 * 待对应节点加入后再回填 surface.rootNode。不写入 store，保持 Surface 纯三属性。
 */
const pendingRootBySurface = new Map<string, string>();

/**
 * 新节点加入后，把它挂到所属 surface 的 rootNode：
 * 1) 已指向该 componentId 的 rootNode 刷新引用（避免持有过期对象）；
 * 2) 曾在 beginRendering 声明但节点未到的 surface 回填引用。
 * 只在同一 surface 内匹配：componentId 的作用域是 surface，不同 surface 可以同名。
 */
function wireSurfaceRoots(
  surfaceId: string,
  componentId: string,
  freshNode: HydrateNode,
) {
  const state = getStore().getState();
  const surface = state.findSurface(surfaceId);
  if (!surface) return;

  if (surface.rootNode?.componentId === componentId) {
    state.updateSurface(surfaceId, { rootNode: freshNode });
    return;
  }
  if (
    surface.rootNode === null &&
    pendingRootBySurface.get(surfaceId) === componentId
  ) {
    state.updateSurface(surfaceId, { rootNode: freshNode });
    pendingRootBySurface.delete(surfaceId);
  }
}

/**
 * 协议中每个 component 形如 { Text: {...} }，键为组件类型名、值为组件属性。
 * 返回 [组件类型名, 属性]；无类型键时返回 [null, {}]。
 */
function getComponentEntry(
  component: Record<string, unknown>,
): [string | null, Record<string, unknown>] {
  const type = Object.keys(component)[0];
  if (!type) return [null, {}];
  const props = component[type];
  return [
    type,
    (props && typeof props === 'object' ? props : {}) as Record<string, unknown>,
  ];
}

/**
 * 容器组件的子节点引用：
 * - children.explicitList：Column 等多子组件容器；
 * - child：Card 等单子组件容器。
 * children.template 在 treeBuild 时按数据模型展开，不写入 children。
 */
function getChildIds(props: Record<string, unknown>): string[] {
  if (typeof props.child === 'string') return [props.child];
  const children = props.children;
  if (!children || typeof children !== 'object') return [];
  const explicitList = (children as Record<string, unknown>).explicitList;
  if (!Array.isArray(explicitList)) return [];
  return explicitList.filter((id): id is string => typeof id === 'string');
}

function renderComponent(
  surfaceId: string,
  componentId: string,
  type: string,
  props: Record<string, unknown>,
): unknown {
  const state = getStore().getState();
  const renderer = state.findRenderer(type);
  if (!renderer) {
    state.addError({
      type: A2uiErrorType.COMPONENT_NOT_REGISTERED,
      content: `component type "${type}" is not registered in renderMap (componentId="${componentId}")`,
      surfaceId,
      componentId,
    });
    return null;
  }
  try {
    const model = state.dataModelMap[surfaceId];
    return renderer(resolveBoundProps(props, model), { componentId, surfaceId });
  } catch (e) {
    state.addError({
      type: A2uiErrorType.PARSE_ERROR,
      content: `render "${type}" failed: ${(e as Error).message}`,
      surfaceId,
      componentId,
    });
    return null;
  }
}

function handleSurfaceUpdate(msg: SurfaceUpdateMessage) {
  const state = getStore().getState();
  const { surfaceId, components } = msg.surfaceUpdate;

  if (!state.findSurface(surfaceId)) {
    state.addSurface({ surfaceId });
  }

  const previousIds = new Set(
    Object.keys(getStore().getState().hydrateNodeMap[surfaceId] ?? {}),
  );
  const parsed = components.map((comp) => {
    const [type, props] = getComponentEntry(comp.component);
    return { comp, type, props };
  });

  // 先把 path + literal 写入模型，本条消息里的组件再按模型渲染
  const writes: ImplicitWrite[] = [];
  for (const item of parsed) collectImplicitInits(item.props, writes);
  getStore().getState().applyImplicitInits(surfaceId, writes);

  const touched = new Set<string>();
  for (const { comp, type, props } of parsed) {
    touched.add(comp.id);
    let vnode: unknown = null;
    if (!type) {
      getStore().getState().addError({
        type: A2uiErrorType.COMPONENT_NOT_REGISTERED,
        content: `component "${comp.id}" has no component type key`,
        surfaceId,
        componentId: comp.id,
      });
    } else {
      vnode = renderComponent(surfaceId, comp.id, type, props);
    }

    const hydrateNode: HydrateNode = {
      componentId: comp.id,
      componentType: type,
      props,
      _vnode: vnode,
      ownerSurfaceId: surfaceId,
      // 只存该组件的协议片段，避免同一条 surfaceUpdate 的原文被每个节点重复保存
      protocol: JSON.stringify({ id: comp.id, component: comp.component }),
      children: getChildIds(props),
    };
    getStore().getState().addHydrateNode(hydrateNode);
    wireSurfaceRoots(surfaceId, comp.id, hydrateNode);
  }

  // 本条消息没覆盖到的旧节点，也要按新模型重渲染（隐式初始化可能改了它们绑定的值）
  const staleIds = [...previousIds].filter((id) => !touched.has(id));
  if (staleIds.length > 0) {
    getStore().getState().rerenderHydrateNodes(surfaceId, staleIds);
  }
}

function handleBeginRendering(_rawLine: string, msg: BeginRenderingMessage) {
  const state = getStore().getState();
  const { surfaceId, root } = msg.beginRendering;

  if (!state.findSurface(surfaceId)) {
    // 容错：beginRendering 早于 surfaceUpdate 时自动创建 surface
    state.addSurface({ surfaceId });
  }

  // rootNode 是指向该 surface 下节点的引用；节点尚未到达时记录 pending，等节点到达后回填
  const rootNode = getStore().getState().findHydrateNode(surfaceId, root);
  if (rootNode) {
    state.updateSurface(surfaceId, { beginRender: true, rootNode });
    pendingRootBySurface.delete(surfaceId);
  } else {
    state.updateSurface(surfaceId, { beginRender: true, rootNode: null });
    pendingRootBySurface.set(surfaceId, root);
  }
}

/**
 * dataModelUpdate 先写入中心 store，再按原始 props 重渲染该 surface。
 * 不创建 surface；模型可以早于组件到达。
 */
function handleDataModelUpdate(_rawLine: string, msg: DataModelUpdateMessage): void {
  const { surfaceId, path, contents } = msg.dataModelUpdate;
  if (!surfaceId || !Array.isArray(contents)) return;
  getStore().getState().applyDataModelUpdate(surfaceId, path, contents);
}

function handleDeleteSurface(_rawLine: string, msg: DeleteSurfaceMessage) {
  getStore().getState().removeSurface(msg.deleteSurface.surfaceId);
}

/** 每次解析会话开始前准备 store：按需 reset，并清空跨会话的 pending root */
function prepareStore(reset: boolean): void {
  if (reset) {
    // 只重置数据，保留 init() 注入的配置（如 renderMap）
    if (a2uiStore) a2uiStore.getState().reset();
    else init();
  } else if (!a2uiStore) {
    throw new Error('a2ui store is not initialized. Call init() first.');
  }
  // 每次解析会话清空 pending root，避免跨会话残留
  pendingRootBySurface.clear();
}

/** 处理一条完整的 JSONL 行：解析 JSON → 识别 action → 分发 */
function processLine(line: string): void {
  const state = getStore().getState();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch (e) {
    state.addError({
      type: A2uiErrorType.PARSE_ERROR,
      content: `invalid JSON line: ${(e as Error).message}`,
    });
    return;
  }

  const action = detectAction(obj);
  if (!action) {
    state.addError({
      type: A2uiErrorType.PARSE_ERROR,
      content: `unknown message type (no action key): ${line}`,
    });
    return;
  }

  try {
    switch (action) {
      case 'surfaceUpdate':
        handleSurfaceUpdate(obj as unknown as SurfaceUpdateMessage);
        break;
      case 'beginRendering':
        handleBeginRendering(line, obj as unknown as BeginRenderingMessage);
        break;
      case 'dataModelUpdate':
        handleDataModelUpdate(line, obj as unknown as DataModelUpdateMessage);
        break;
      case 'deleteSurface':
        handleDeleteSurface(line, obj as unknown as DeleteSurfaceMessage);
        break;
    }
  } catch (e) {
    state.addError({
      type: A2uiErrorType.PARSE_ERROR,
      content: `failed to handle ${action}: ${(e as Error).message}`,
    });
  }
}

/** 读取当前 store，组装为对外的解析结果（含组件树） */
function buildParseResult(): ParseResult {
  const state = getStore().getState();
  return {
    surfaces: { ...state.surfaceMap },
    hydrateNodes: state.hydrateNodeMap,
    // 解析结束后组装组件树
    trees: treeBuild(),
    errorCount: state.errors.length,
  };
}

/**
 * 解析 JSONL 文本（全量）。每行一条 server→client 消息，根据顶层 action key 分发处理。
 */
export function parseJsonl(jsonl: string, options?: ParseOptions): ParseResult {
  const { reset = true } = options ?? {};
  prepareStore(reset);

  for (const rawLine of jsonl.split('\n')) {
    const line = rawLine.trim();
    if (line) processLine(line); // 跳过空行
  }

  return buildParseResult();
}

/** 流式 JSONL 解析器 */
export interface JsonlStreamParser {
  /**
   * 喂入一个 chunk（可能只是半行 JSON）。
   * 内部先写入缓冲区，只有凑齐以换行符结尾的完整行才交给解析器；
   * 返回当前累计的解析结果，可在每次 push 后直接渲染。
   */
  push(chunk: string): ParseResult;
  /**
   * 结束流：把缓冲区中末尾没有换行符的最后一行补全为完整 JSONL 行后解析。
   * 之后缓冲区清空，重复调用不会重复解析。
   */
  flush(): ParseResult;
}

/**
 * 创建一个流式 JSONL 解析器，适配 server 端 chunk 逐个下发的真实场景。
 *
 * 使用方式：
 * ```ts
 * const stream = createJsonlStream();
 * onChunk((chunk) => {
 *   const result = stream.push(chunk); // 每次 push 后 store 已增量更新
 *   render(result.trees);
 * });
 * onEnd(() => stream.flush());
 * ```
 *
 * 缓冲与切行发生在解析之前：只有完整的 JSONL 行才会交给 processLine，
 * 半截 JSON 留在 buffer 中等待后续 chunk 补齐，避免误报解析错误。
 */
export function createJsonlStream(options?: ParseOptions): JsonlStreamParser {
  const { reset = true } = options ?? {};
  let buffer = '';
  let started = false;

  // 首次 push / flush 时才准备 store，保证"一个流只 reset 一次"
  const start = () => {
    if (started) return;
    started = true;
    prepareStore(reset);
  };

  /** 取出缓冲区中所有完整行，剩余不完整部分继续留在 buffer 里 */
  const drainCompleteLines = () => {
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) processLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  };

  return {
    push(chunk) {
      start();
      if (chunk) buffer += chunk;
      drainCompleteLines();
      return buildParseResult();
    },
    flush() {
      start();
      drainCompleteLines();
      // 末尾没有换行符的最后一行：补全为一条完整 JSONL 行后解析
      const tail = buffer.trim();
      buffer = '';
      if (tail) processLine(tail);
      return buildParseResult();
    },
  };
}

/**
 * 解析 JSONL 文件（Node 环境下的便捷入口）。
 * 使用非常量 specifier 的动态 import，避免：
 *   1) 浏览器端静态导入 node builtin 被 Vite externalize 而报错；
 *   2) TS/tsserver 静态解析 'node:fs' 模块类型（core 不把 node 放入生产 types）。
 * 浏览器端请直接使用 parseJsonl(jsonlString)。
 */
export async function parseJsonlFile(
  filePath: string,
  options?: ParseOptions,
): Promise<ParseResult> {
  const nodeFsSpec = 'node:fs';
  const { readFileSync } = await import(/* @vite-ignore */ nodeFsSpec);
  return parseJsonl(readFileSync(filePath, 'utf-8'), options);
}
