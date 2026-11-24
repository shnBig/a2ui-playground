import { getStore } from '../store/store.js';
import type { HydrateNode } from '../store/types.js';

/** 组件树节点：由 HydrateNode 组装而来，记录父子关系 */
export interface ComponentTreeNode {
  componentId: string;
  /** 父节点 id，根节点为 null */
  parentId: string | null;
  /** 渲染产物（a2ui-react 下为 ReactElement） */
  vnode: unknown;
  children: ComponentTreeNode[];
}

/** 单个 surface 的组件树 */
export interface SurfaceTree {
  surfaceId: string;
  beginRender: boolean;
  root: ComponentTreeNode | null;
  /**
   * 已把子节点挂载到父节点上的可渲染根 vnode。
   * 注入 attachChildren 后可直接渲染；未注入或没有子节点时等于 root.vnode。
   */
  rootVnode: unknown | null;
}

/**
 * 从 store 当前状态组装组件树。
 * 调用时机：每次 parse A2UI JSONL 协议之后。
 *
 * 组装规则：
 * 1. 仅组装 beginRender=true 且有 rootNode 的 surface（beginRender 是渲染开关）；
 * 2. 根节点取 surface.rootNode，子节点来自 HydrateNode.children（协议 children.explicitList）；
 * 3. 子节点在同 surface 分区内查找（componentId 作用域是 surface），引用不存在的组件直接跳过；
 * 4. 用路径集合防环，重复 id 不再展开；
 * 5. 通过 attachChildren 把子 vnode 挂到父 vnode，得到可直接渲染的 rootVnode。
 */
export function treeBuild(): SurfaceTree[] {
  const state = getStore().getState();

  const buildNode = (
    node: HydrateNode,
    parentId: string | null,
    path: Set<string>,
  ): ComponentTreeNode => {
    const nextPath = new Set(path).add(node.componentId);
    const children: ComponentTreeNode[] = [];

    for (const childId of node.children) {
      if (nextPath.has(childId)) continue; // 防环
      const child = state.findHydrateNode(node.ownerSurfaceId, childId);
      if (!child) continue; // 引用不存在的组件
      children.push(buildNode(child, node.componentId, nextPath));
    }

    return {
      componentId: node.componentId,
      parentId,
      vnode: node._vnode,
      children,
    };
  };

  const attach = state.attachChildren;
  const toVnode = (node: ComponentTreeNode): unknown =>
    node.children.length > 0 && attach
      ? attach(node.vnode, node.children.map(toVnode))
      : node.vnode;

  return Object.values(state.surfaceMap).map((surface) => {
    const root =
      surface.beginRender && surface.rootNode
        ? buildNode(surface.rootNode, null, new Set())
        : null;
    return {
      surfaceId: surface.surfaceId,
      beginRender: surface.beginRender,
      root,
      rootVnode: root ? toVnode(root) : null,
    };
  });
}
