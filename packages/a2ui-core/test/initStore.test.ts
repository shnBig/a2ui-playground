import assert from 'node:assert/strict';
import { A2uiErrorType, getStore, init, initStore } from '../src/store/index.js';

describe('init / store 初始化', () => {
  beforeEach(() => {
    init();
  });

  it('init 后 store 处于干净的初始状态', () => {
    const state = getStore().getState();

    assert.deepEqual(state.surfaceMap, {});
    assert.deepEqual(state.hydrateNodeMap, {});
    assert.deepEqual(state.errors, []);
  });

  it('init 后可以正常写入并查询数据', () => {
    const state = getStore().getState();

    state.addSurface({ surfaceId: 'surface-1' });
    state.addHydrateNode({
      componentId: 'node-1',
      componentType: 'Text',
      props: {},
      _vnode: { type: 'div' },
      ownerSurfaceId: 'surface-1',
      protocol: '{"id":"node-1","component":{"Text":{}}}',
      children: [],
    });
    const errorId = state.addError({
      type: A2uiErrorType.PARSE_ERROR,
      content: 'invalid protocol',
    });

    const next = getStore().getState();
    assert.equal(next.findSurface('surface-1')?.surfaceId, 'surface-1');
    assert.equal(next.findHydrateNode('surface-1', 'node-1')?.ownerSurfaceId, 'surface-1');
    assert.equal(next.findError(errorId)?.content, 'invalid protocol');
  });

  it('重复 init 会创建全新的 store 实例并清空数据', () => {
    const first = init();
    first.getState().addSurface({ surfaceId: 'surface-1' });
    assert.equal(Object.keys(first.getState().surfaceMap).length, 1);

    const second = init();

    // 新实例与旧实例是不同的对象
    assert.notEqual(first, second);
    // 新实例是干净的
    assert.deepEqual(second.getState().surfaceMap, {});
    // 旧实例数据不受新实例影响
    assert.equal(Object.keys(first.getState().surfaceMap).length, 1);
  });

  it('initStore 重置数据但保持同一实例', () => {
    const store = init();
    store.getState().addSurface({ surfaceId: 'surface-1' });
    store.getState().addError({
      type: A2uiErrorType.PARSE_ERROR,
      content: 'invalid protocol',
    });

    initStore();

    assert.equal(getStore(), store);
    assert.deepEqual(store.getState().surfaceMap, {});
    assert.deepEqual(store.getState().errors, []);
  });

  describe('renderMap 由 store 维护', () => {
    it('init 传入的 renderMap 保存在 store 状态中', () => {
      const renderer = () => 'vnode';
      init({ renderMap: { Text: renderer } });

      const state = getStore().getState();
      assert.deepEqual(Object.keys(state.renderMap), ['Text']);
      assert.equal(state.findRenderer('Text'), renderer);
      assert.equal(state.findRenderer('Unknown'), undefined);
    });

    it('addRenderer / removeRenderer 可增删渲染器', () => {
      init();
      const textRenderer = () => 'text';
      const buttonRenderer = () => 'button';

      getStore().getState().addRenderer('Text', textRenderer);
      getStore().getState().addRenderer('Button', buttonRenderer);
      assert.deepEqual(Object.keys(getStore().getState().renderMap).sort(), [
        'Button',
        'Text',
      ]);

      getStore().getState().removeRenderer('Text');
      assert.equal(getStore().getState().findRenderer('Text'), undefined);
      assert.equal(getStore().getState().findRenderer('Button'), buttonRenderer);
    });

    it('reset 清空业务数据但保留 renderMap', () => {
      init({ renderMap: { Text: () => 'text' } });
      getStore().getState().addSurface({ surfaceId: 'surface-1' });

      initStore();

      assert.deepEqual(getStore().getState().surfaceMap, {});
      assert.equal(typeof getStore().getState().findRenderer('Text'), 'function');
    });

    it('后注册渲染器会重算已有节点的 _vnode，并同步 surface.rootNode', () => {
      init();
      const state = getStore().getState();
      state.addSurface({ surfaceId: 's1' });
      state.addHydrateNode({
        componentId: 'root',
        componentType: 'Text',
        props: { text: { literalString: 'hi' } },
        _vnode: null,
        ownerSurfaceId: 's1',
        protocol: '{"id":"root","component":{"Text":{}}}',
        children: [],
      });
      state.updateSurface('s1', { beginRender: true, rootNode: state.findHydrateNode('s1', 'root') });

      state.addRenderer('Text', () => 'text-vnode');

      const next = getStore().getState();
      assert.equal(next.findHydrateNode('s1', 'root')?._vnode, 'text-vnode');
      assert.equal(next.findSurface('s1')?.rootNode?._vnode, 'text-vnode', 'rootNode 应指向重建后的节点');

      next.removeRenderer('Text');
      assert.equal(getStore().getState().findHydrateNode('s1', 'root')?._vnode, null);
    });
  });
});
