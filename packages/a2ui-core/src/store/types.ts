/** canvas / surface 唯一标识 */
export type SurfaceId = string;

/** 组件节点唯一标识（作用域为 surface） */
export type ComponentId = string;

/** 原始协议文本：该组件在协议中的片段（JSON） */
export type ProtocolText = string;

/**
 * 组件节点：协议节点映射到渲染器产物的结果。
 * TNode 由渲染层决定（a2ui-react 传入 ReactElement），core 不感知具体框架。
 */
export interface HydrateNode<TNode = unknown> {
  componentId: ComponentId;
  /** 组件类型名（如 Text / Column），用于 renderMap 查找与渲染器注册后的重建 */
  componentType: ComponentId | null;
  /** 协议中该组件的原始属性，渲染器重算 _vnode 时需要 */
  props: Record<string, unknown>;
  /** 渲染产物；未注册渲染器或渲染失败时为 null */
  _vnode: TNode | null;
  ownerSurfaceId: SurfaceId;
  protocol: ProtocolText;
  /** 子组件 id 列表（来自协议 children.explicitList），无子节点时为空数组 */
  children: ComponentId[];
}

/**
 * 一个 surface 的状态。仅三个属性：
 * - surfaceId: 唯一标识
 * - beginRender: 是否开始渲染（beginRendering 消息后置为 true）
 * - rootNode: 指向该 surface 下根节点的引用（不是 id）
 */
export interface Surface<TNode = unknown> {
  surfaceId: SurfaceId;
  beginRender: boolean;
  rootNode: HydrateNode<TNode> | null;
}

/** 创建 surface 时的入参，除 surfaceId 外均有默认值 */
export interface SurfaceInput<TNode = unknown> {
  surfaceId: SurfaceId;
  beginRender?: boolean;
  rootNode?: HydrateNode<TNode> | null;
}

export enum A2uiErrorType {
  PARSE_ERROR = 'PARSE_ERROR',
  /** 协议中的组件类型未在 renderMap 注册 */
  COMPONENT_NOT_REGISTERED = 'COMPONENT_NOT_REGISTERED',
}

/** store 中记录的错误信息 */
export interface A2uiError {
  errorId: string;
  type: A2uiErrorType;
  content: string;
  surfaceId?: SurfaceId;
  componentId?: ComponentId;
}

export type SurfacePatch<TNode = unknown> = Partial<Omit<Surface<TNode>, 'surfaceId'>>;
export type HydrateNodePatch<TNode = unknown> = Partial<
  Omit<HydrateNode<TNode>, 'componentId' | 'ownerSurfaceId'>
>;

/** 渲染器上下文：parser 调用渲染器时传入，供渲染层在根元素上标记组件 */
export interface RenderContext {
  componentId: ComponentId;
  surfaceId: SurfaceId;
}

/**
 * 组件渲染器：把协议中某个组件类型的属性渲染成渲染器产物（如 ReactElement）。
 * core 不感知具体框架，TNode 由渲染层决定。
 */
export type Renderer<TNode = unknown> = (
  props: Record<string, unknown>,
  context: RenderContext,
) => TNode;

/** 组件类型名 → 渲染器 */
export type RenderMap<TNode = unknown> = Record<string, Renderer<TNode>>;

/**
 * 把子节点挂到父节点 vnode 上的策略，由渲染层注入。
 * React 下即 cloneElement(vnode, undefined, ...children)；未注入时 treeBuild 不组装子节点。
 */
export type AttachChildren<TNode = unknown> = (vnode: TNode, children: TNode[]) => TNode;

/**
 * 组件节点表：按 surface 分区，避免不同 surface 的同名 componentId 互相覆盖。
 * 访问统一通过 store 的 find/update/remove 方法，不直接改嵌套对象。
 */
export type HydrateNodeMap<TNode = unknown> = Record<
  SurfaceId,
  Record<ComponentId, HydrateNode<TNode>>
>;

/** store 的状态与按 surface + id 维度的增删改查操作 */
export interface A2uiStoreState<TNode = unknown> {
  surfaceMap: Record<SurfaceId, Surface<TNode>>;
  hydrateNodeMap: HydrateNodeMap<TNode>;
  errors: A2uiError[];
  /** 组件渲染器表，由 init() 注入，reset() 不清空 */
  renderMap: RenderMap<TNode>;
  /** 子节点挂载策略，由 init() 注入，reset() 不清空 */
  attachChildren: AttachChildren<TNode> | null;

  addSurface(surface: SurfaceInput<TNode>): void;
  updateSurface(surfaceId: SurfaceId, patch: SurfacePatch<TNode>): void;
  removeSurface(surfaceId: SurfaceId): void;
  findSurface(surfaceId: SurfaceId): Surface<TNode> | undefined;

  addHydrateNode(node: HydrateNode<TNode>): void;
  updateHydrateNode(
    surfaceId: SurfaceId,
    componentId: ComponentId,
    patch: HydrateNodePatch<TNode>,
  ): void;
  removeHydrateNode(surfaceId: SurfaceId, componentId: ComponentId): void;
  findHydrateNode(
    surfaceId: SurfaceId,
    componentId: ComponentId,
  ): HydrateNode<TNode> | undefined;

  addRenderer(componentType: string, renderer: Renderer<TNode>): void;
  removeRenderer(componentType: string): void;
  findRenderer(componentType: string): Renderer<TNode> | undefined;

  addError(error: Omit<A2uiError, 'errorId'> & { errorId?: string }): string;
  removeError(errorId: string): void;
  findError(errorId: string): A2uiError | undefined;
  clearErrors(surfaceId?: SurfaceId): void;

  reset(): void;
}
