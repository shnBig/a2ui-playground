import {
  isDataModel,
  iterateCollection,
  lookupPath,
  resolveBoundProps,
} from '../store/dataModel.js';
import type { DataModel } from '../store/dataModel.js';
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

interface ChildTemplate {
  componentId: string;
  dataBinding: string;
}

/**
 * 从 store 当前状态组装组件树。
 * 调用时机：每次 parse A2UI JSONL 协议之后。
 *
 * 组装规则：
 * 1. 仅组装 beginRender=true 且有 rootNode 的 surface（beginRender 是渲染开关）；
 * 2. 根节点取 surface.rootNode，子节点来自 HydrateNode.children（协议 children.explicitList / child）；
 * 3. children.template 在组装时从数据模型展开，克隆节点不写入 hydrateNodeMap；
 * 4. 子节点在同 surface 分区内查找（componentId 作用域是 surface），引用不存在的组件直接跳过；
 * 5. 用路径集合防环，重复 id 不再展开；
 * 6. 通过 attachChildren 把子 vnode 挂到父 vnode，得到可直接渲染的 rootVnode。
 */
export function treeBuild(): SurfaceTree[] {
  const state = getStore().getState();

  const renderWithContext = (
    node: HydrateNode,
    context: DataModel,
    instanceId: string,
  ): unknown => {
    if (!node.componentType) return null;
    const renderer = state.findRenderer(node.componentType);
    if (!renderer) return null;
    try {
      const resolved = resolveBoundProps(
        node.props,
        state.dataModelMap[node.ownerSurfaceId],
        context,
      );
      return renderer(resolved, {
        componentId: instanceId,
        surfaceId: node.ownerSurfaceId,
      });
    } catch {
      return null;
    }
  };

  const buildFrom = (
    node: HydrateNode,
    parentId: string | null,
    path: Set<string>,
    context: DataModel | undefined,
    instanceId: string,
  ): ComponentTreeNode => {
    if (path.has(instanceId) || path.has(node.componentId)) {
      return { componentId: instanceId, parentId, vnode: null, children: [] };
    }
    const nextPath = new Set(path);
    nextPath.add(instanceId);
    nextPath.add(node.componentId);
    const children: ComponentTreeNode[] = [];
    const template = readTemplate(node.props);

    if (template) {
      const collection = lookupPath(
        state.dataModelMap[node.ownerSurfaceId],
        template.dataBinding,
        context,
      );
      const templateNode = state.findHydrateNode(node.ownerSurfaceId, template.componentId);
      if (templateNode && !nextPath.has(templateNode.componentId)) {
        for (const [key, item] of iterateCollection(collection)) {
          const childInstanceId = `${template.componentId}@${key}`;
          if (nextPath.has(childInstanceId)) continue;
          const itemContext = isDataModel(item) ? item : {};
          children.push(
            buildFrom(templateNode, instanceId, nextPath, itemContext, childInstanceId),
          );
        }
      }
    } else {
      for (const childId of node.children) {
        const childInstanceId = context ? `${instanceId}/${childId}` : childId;
        if (nextPath.has(childInstanceId) || nextPath.has(childId)) continue;
        const child = state.findHydrateNode(node.ownerSurfaceId, childId);
        if (!child) continue;
        children.push(buildFrom(child, instanceId, nextPath, context, childInstanceId));
      }
    }

    return {
      componentId: instanceId,
      parentId,
      vnode: context ? renderWithContext(node, context, instanceId) : node._vnode,
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
        ? buildFrom(surface.rootNode, null, new Set(), undefined, surface.rootNode.componentId)
        : null;
    return {
      surfaceId: surface.surfaceId,
      beginRender: surface.beginRender,
      root,
      rootVnode: root ? toVnode(root) : null,
    };
  });
}

function readTemplate(props: Record<string, unknown>): ChildTemplate | null {
  const children = props.children;
  if (!children || typeof children !== 'object' || Array.isArray(children)) return null;
  const template = (children as Record<string, unknown>).template;
  if (!template || typeof template !== 'object' || Array.isArray(template)) return null;
  const record = template as Record<string, unknown>;
  if (typeof record.componentId !== 'string' || typeof record.dataBinding !== 'string') {
    return null;
  }
  return { componentId: record.componentId, dataBinding: record.dataBinding };
}
