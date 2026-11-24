1. 维护原始协议
2. surface管理
3. 组件节点 - hydrateNodeMap
4. Error信息

interface A2uiStore {
  surfaceMap: <record, Surface>,
  HydrateNodeMap: <record, HydrateNode>
}

interface Surface {
    surfaceId: String,
    beginrender: Bool,
    rootNode: HydrateNode,
}

interface HydrateNode {
    componentId: String,
    _vnode: ReactElement,
    ownerSurfaceId: String,
    protocal: string (JSONL协议)
}

enum ErrorType = {
    PARSE_ERROR
}

interface Error {
    type: ErrorType,
    content: string,
}

更新 删除 查找 添加 (by Id维度)

const reactElement = {
    TextFile: (props: {test}) => {
        <div>{test}</div>
    }
}

store里面还有对surfaceMap,
HydrateNodeMap, ErrorMap的更新、删除、查找、添加操作

为了解除对react的依赖
store 通过zustand/vanilla 实现状态管理
