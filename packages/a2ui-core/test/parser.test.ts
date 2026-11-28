import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getStore, init } from '../src/store/store.js';
import { A2uiErrorType } from '../src/store/types.js';
import {
  parseJsonl,
  parseJsonlFile,
  type DataModelUpdateMessage,
  type SurfaceUpdateMessage,
  type BeginRenderingMessage,
  type DeleteSurfaceMessage,
} from '../src/parser/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 测试用固定 fixture，不随 mock/ 下的实验数据变化
const MOCK_JSONL = join(__dirname, 'fixtures', 'simple-text.jsonl');

function readMock(): string {
  return readFileSync(MOCK_JSONL, 'utf-8');
}

describe('parser', () => {
  // 默认注册 Text，避免"未注册组件"错误干扰与本用例无关的断言
  beforeEach(() => init({ renderMap: { Text: () => null } }));

  describe('surfaceUpdate', () => {
    it('创建新 surface 并写入 hydrateNode', () => {
      const msg: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [
            { id: 'c1', component: { Text: { text: { literalString: 'hi' } } } },
          ],
        },
      };
      parseJsonl(JSON.stringify(msg));

      const surface = getStore().getState().findSurface('s1');
      const node = getStore().getState().findHydrateNode('s1', 'c1');
      assert.ok(surface, 'surface 应被创建');
      assert.equal(surface.beginRender, false);
      assert.equal(surface.rootNode, null, '未 beginRendering 前 rootNode 为 null');
      assert.equal(node?.ownerSurfaceId, 's1');
      assert.equal(node?.componentId, 'c1');
    });

    it('同一 surfaceUpdate 多次更新同一组件时覆盖 hydrateNode', () => {
      const first: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [
            { id: 'c1', component: { Text: { text: { literalString: 'v1' } } } },
          ],
        },
      };
      const second: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [
            { id: 'c1', component: { Text: { text: { literalString: 'v2' } } } },
          ],
        },
      };
      parseJsonl([JSON.stringify(first), JSON.stringify(second)].join('\n'));

      const node = getStore().getState().findHydrateNode('s1', 'c1');
      assert.ok(node);
      // 第二条 line 覆盖了 protocol
      assert.match(node.protocol, /v2/);
    });

    it('节点的 protocol 字段保存该组件的协议片段', () => {
      const msg: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [{ id: 'c1', component: { Text: {} } }],
        },
      };
      parseJsonl(JSON.stringify(msg));

      const node = getStore().getState().findHydrateNode('s1', 'c1');
      assert.ok(node);
      assert.deepEqual(JSON.parse(node.protocol), {
        id: 'c1',
        component: { Text: {} },
      });
    });
  });

  describe('beginRendering', () => {
    it('设置 surface.beginRender=true，rootNode 指向 hydrateNodeMap 中的根节点引用', () => {
      const su: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [{ id: 'root', component: { Text: {} } }],
        },
      };
      const br: BeginRenderingMessage = {
        beginRendering: { surfaceId: 's1', root: 'root' },
      };
      parseJsonl([JSON.stringify(su), JSON.stringify(br)].join('\n'));

      const state = getStore().getState();
      const surface = state.findSurface('s1');
      const rootNode = state.findHydrateNode('s1', 'root');
      assert.ok(surface);
      assert.ok(rootNode);
      assert.equal(surface.beginRender, true);
      // rootNode 是指向 hydrateNodeMap 中同一对象的引用（指针，不是 id）
      assert.equal(surface.rootNode, rootNode);
      assert.equal(surface.rootNode?.componentId, 'root');
    });

    it('beginRendering 早于 surfaceUpdate 时自动创建 surface，节点到达后回填 rootNode 引用', () => {
      const br: BeginRenderingMessage = {
        beginRendering: { surfaceId: 'orphan', root: 'root' },
      };
      const su: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 'orphan',
          components: [{ id: 'root', component: { Text: {} } }],
        },
      };
      parseJsonl([JSON.stringify(br), JSON.stringify(su)].join('\n'));

      const state = getStore().getState();
      const surface = state.findSurface('orphan');
      const rootNode = state.findHydrateNode('orphan', 'root');
      assert.ok(surface);
      assert.ok(rootNode);
      assert.equal(surface.beginRender, true);
      assert.equal(surface.rootNode, rootNode, '节点后到时应回填 rootNode 引用');
    });

    it('surface.rootNode 在根节点内容被覆盖后仍指向最新对象', () => {
      const su1: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [{ id: 'root', component: { Text: { text: { literalString: 'old' } } } }],
        },
      };
      const br: BeginRenderingMessage = {
        beginRendering: { surfaceId: 's1', root: 'root' },
      };
      const su2: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [{ id: 'root', component: { Text: { text: { literalString: 'new' } } } }],
        },
      };
      parseJsonl([JSON.stringify(su1), JSON.stringify(br), JSON.stringify(su2)].join('\n'));

      const state = getStore().getState();
      const surface = state.findSurface('s1');
      const freshNode = state.findHydrateNode('s1', 'root');
      assert.ok(surface);
      assert.ok(freshNode);
      assert.equal(surface.rootNode, freshNode, 'rootNode 引用应随节点更新同步');
      assert.match(freshNode.protocol, /new/);
    });
  });

  describe('dataModelUpdate', () => {
    it('写入数据模型，但不创建 surface', () => {
      const dmu: DataModelUpdateMessage = {
        dataModelUpdate: {
          surfaceId: 's1',
          contents: [{ key: 'name', valueString: 'Alice' }],
        },
      };
      const result = parseJsonl(JSON.stringify(dmu));

      assert.equal(result.errorCount, 0);
      assert.equal(getStore().getState().findSurface('s1'), undefined);
      assert.deepEqual(getStore().getState().dataModelMap.s1, { name: 'Alice' });
    });

    it('path 省略时用 contents 替换整棵模型', () => {
      const first: DataModelUpdateMessage = {
        dataModelUpdate: {
          surfaceId: 's1',
          contents: [{ key: 'name', valueString: 'Alice' }],
        },
      };
      const second: DataModelUpdateMessage = {
        dataModelUpdate: {
          surfaceId: 's1',
          path: '/',
          contents: [{ key: 'other', valueString: 'x' }],
        },
      };
      parseJsonl([JSON.stringify(first), JSON.stringify(second)].join('\n'));

      assert.deepEqual(getStore().getState().dataModelMap.s1, { other: 'x' });
    });

    it('子路径替换该子树，同级其他键保留，valueMap 递归解码', () => {
      const root: DataModelUpdateMessage = {
        dataModelUpdate: {
          surfaceId: 's1',
          contents: [
            { key: 'keep', valueBoolean: false },
            {
              key: 'user',
              valueMap: [{ key: 'name', valueString: 'Ann' }, { key: 'city', valueString: 'Old' }],
            },
          ],
        },
      };
      const patch: DataModelUpdateMessage = {
        dataModelUpdate: {
          surfaceId: 's1',
          path: '/user',
          contents: [
            { key: 'name', valueString: 'Bob' },
            {
              key: 'address',
              valueMap: [{ key: 'city', valueString: 'Anytown' }],
            },
          ],
        },
      };
      parseJsonl([JSON.stringify(root), JSON.stringify(patch)].join('\n'));

      assert.deepEqual(getStore().getState().dataModelMap.s1, {
        keep: false,
        user: { name: 'Bob', address: { city: 'Anytown' } },
      });
    });

    it('后续 parse 默认 reset 会清掉数据模型', () => {
      parseJsonl(
        JSON.stringify({
          dataModelUpdate: {
            surfaceId: 's1',
            contents: [{ key: 'name', valueString: 'Alice' }],
          },
        }),
      );
      parseJsonl('');
      assert.deepEqual(getStore().getState().dataModelMap, {});
    });
  });

  describe('deleteSurface', () => {
    it('删除 surface 并级联清理 hydrateNode', () => {
      const su: SurfaceUpdateMessage = {
        surfaceUpdate: {
          surfaceId: 's1',
          components: [
            { id: 'c1', component: {} },
            { id: 'c2', component: {} },
          ],
        },
      };
      const del: DeleteSurfaceMessage = {
        deleteSurface: { surfaceId: 's1' },
      };
      const dmu: DataModelUpdateMessage = {
        dataModelUpdate: {
          surfaceId: 's1',
          contents: [{ key: 'name', valueString: 'Alice' }],
        },
      };
      parseJsonl([JSON.stringify(su), JSON.stringify(dmu), JSON.stringify(del)].join('\n'));

      const state = getStore().getState();
      assert.ok(!state.findSurface('s1'), 'surface 应被删除');
      assert.ok(!state.findHydrateNode('s1', 'c1'), 'c1 应级联删除');
      assert.ok(!state.findHydrateNode('s1', 'c2'), 'c2 应级联删除');
      assert.equal(state.dataModelMap.s1, undefined, '数据模型应随 surface 删除');
    });

    it('删除不存在的 surface 不报错', () => {
      const del: DeleteSurfaceMessage = { deleteSurface: { surfaceId: 'ghost' } };
      const result = parseJsonl(JSON.stringify(del));
      assert.equal(result.errorCount, 0);
    });
  });

  describe('simple-text.jsonl 完整解析', () => {
    it('ParseResult 反映 surface / hydrateNode 数量', () => {
      const result = parseJsonl(readMock());
      assert.equal(Object.keys(result.surfaces).length, 1);
      assert.equal(Object.keys(result.hydrateNodes).length, 1);
      assert.equal(result.errorCount, 0);
    });

    it('surface 存在且 beginRender=true，rootNode 指向 root 节点', () => {
      parseJsonl(readMock());
      const state = getStore().getState();
      const surface = state.findSurface('simple-text');
      assert.ok(surface);
      assert.equal(surface.beginRender, true);
      assert.equal(surface.rootNode?.componentId, 'root');
      assert.equal(surface.rootNode, state.findHydrateNode('simple-text', 'root'));
    });

    it('hydrateNode 存在且 ownerSurfaceId 正确', () => {
      parseJsonl(readMock());
      const node = getStore().getState().findHydrateNode('simple-text', 'root');
      assert.ok(node);
      assert.equal(node.ownerSurfaceId, 'simple-text');
      assert.equal(node._vnode, null, 'parser 阶段 _vnode 尚未注水');
    });

    it('节点 protocol 保存该组件的协议片段', () => {
      parseJsonl(readMock());
      const node = getStore().getState().findHydrateNode('simple-text', 'root');
      assert.ok(node);
      assert.deepEqual(JSON.parse(node.protocol), {
        id: 'root',
        component: {
          Text: {
            text: { literalString: 'Hello, A2UI!' },
            usageHint: 'h5',
          },
        },
      });
    });
  });

  describe('parseJsonlFile', () => {
    it('从文件路径读取并解析，结果与 parseJsonl 一致', async () => {
      await parseJsonlFile(MOCK_JSONL);

      const surface = getStore().getState().findSurface('simple-text');
      const node = getStore().getState().findHydrateNode('simple-text', 'root');
      assert.ok(surface);
      assert.ok(node);
      assert.equal(surface.rootNode, node);
    });
  });

  describe('renderMap', () => {
    const surfaceLine = JSON.stringify({
      surfaceUpdate: {
        surfaceId: 's1',
        components: [
          {
            id: 'root',
            component: { Text: { text: { literalString: 'hi' }, usageHint: 'h1' } },
          },
        ],
      },
    });

    it('解析 component 时调用 renderMap 对应渲染器，并把结果写入 _vnode', () => {
      init({
        renderMap: {
          Text: (props) => ({ rendered: props }),
        },
      });
      parseJsonl(surfaceLine, { reset: false });

      const node = getStore().getState().findHydrateNode('s1', 'root');
      assert.deepEqual(node?._vnode, {
        rendered: { text: { literalString: 'hi' }, usageHint: 'h1' },
      });
    });

    it('parseJsonl 默认 reset 时保留 init 注入的 renderMap', () => {
      init({
        renderMap: {
          Text: () => 'rendered-by-config',
        },
      });
      // 不传 reset:false，走默认 reset 分支
      parseJsonl(surfaceLine);

      const node = getStore().getState().findHydrateNode('s1', 'root');
      assert.equal(node?._vnode, 'rendered-by-config');
    });

    it('没有对应渲染器时 _vnode 为 null，并记录未注册错误', () => {
      init(); // 不注册任何渲染器
      parseJsonl(surfaceLine, { reset: false });

      const state = getStore().getState();
      const node = state.findHydrateNode('s1', 'root');
      assert.equal(node?._vnode, null);
      assert.equal(state.errors.length, 1);
      assert.equal(state.errors[0].type, A2uiErrorType.COMPONENT_NOT_REGISTERED);
      assert.match(state.errors[0].content, /"Text" is not registered/);
      assert.equal(state.errors[0].componentId, 'root');
      assert.equal(state.errors[0].surfaceId, 's1');
    });

    it('渲染器抛错时记录 PARSE_ERROR，_vnode 为 null', () => {
      init({
        renderMap: {
          Text: () => {
            throw new Error('boom');
          },
        },
      });
      parseJsonl(surfaceLine, { reset: false });

      const state = getStore().getState();
      const node = state.findHydrateNode('s1', 'root');
      assert.equal(node?._vnode, null);
      assert.equal(state.errors.length, 1);
      assert.match(state.errors[0].content, /render "Text" failed: boom/);
      assert.equal(state.errors[0].componentId, 'root');
      assert.equal(state.errors[0].surfaceId, 's1');
    });

    it('渲染器被调用一次，且收到协议中该组件的完整属性', () => {
      const calls: Array<Record<string, unknown>> = [];
      init({
        renderMap: {
          Text: (props) => {
            calls.push(props);
            return 'ok';
          },
        },
      });
      parseJsonl(surfaceLine, { reset: false });

      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        text: { literalString: 'hi' },
        usageHint: 'h1',
      });
    });

    it('渲染器被调用时收到 componentId / surfaceId 上下文', () => {
      const contexts: Array<{ componentId: string; surfaceId: string }> = [];
      init({
        renderMap: {
          Text: (_props, context) => {
            contexts.push(context);
            return 'ok';
          },
        },
      });
      parseJsonl(surfaceLine, { reset: false });

      assert.deepEqual(contexts, [{ componentId: 'root', surfaceId: 's1' }]);
    });

    it('同批次多个组件时，各自的渲染器各被调用一次且入参对应', () => {
      const textCalls: Array<Record<string, unknown>> = [];
      const buttonCalls: Array<Record<string, unknown>> = [];
      init({
        renderMap: {
          Text: (props) => {
            textCalls.push(props);
            return 'text-vnode';
          },
          Button: (props) => {
            buttonCalls.push(props);
            return 'button-vnode';
          },
        },
      });
      parseJsonl(
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              { id: 'title', component: { Text: { text: { literalString: 'A' } } } },
              { id: 'action', component: { Button: { label: 'B' } } },
            ],
          },
        }),
        { reset: false },
      );

      assert.equal(textCalls.length, 1);
      assert.deepEqual(textCalls[0], { text: { literalString: 'A' } });
      assert.equal(buttonCalls.length, 1);
      assert.deepEqual(buttonCalls[0], { label: 'B' });

      const state = getStore().getState();
      assert.equal(state.findHydrateNode('s1', 'title')?._vnode, 'text-vnode');
      assert.equal(state.findHydrateNode('s1', 'action')?._vnode, 'button-vnode');
    });

    it('组件类型未注册渲染器时不调用任何渲染器', () => {
      let called = 0;
      init({
        renderMap: {
          Text: () => {
            called += 1;
            return 'text-vnode';
          },
        },
      });
      parseJsonl(
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [{ id: 'chart', component: { Chart: { data: [1, 2] } } }],
          },
        }),
        { reset: false },
      );

      assert.equal(called, 0);
      const state = getStore().getState();
      assert.equal(state.findHydrateNode('s1', 'chart')?._vnode, null);

      const notRegistered = state.errors.filter(
        (error) => error.type === A2uiErrorType.COMPONENT_NOT_REGISTERED,
      );
      assert.equal(notRegistered.length, 1);
      assert.match(notRegistered[0].content, /"Chart" is not registered/);
      assert.equal(notRegistered[0].componentId, 'chart');
      assert.equal(notRegistered[0].surfaceId, 's1');
    });

    it('component 无组件类型键时不调用渲染器', () => {
      let called = 0;
      init({
        renderMap: {
          Text: () => {
            called += 1;
            return 'text-vnode';
          },
        },
      });
      parseJsonl(
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [{ id: 'empty', component: {} }],
          },
        }),
        { reset: false },
      );

      assert.equal(called, 0);
      const state = getStore().getState();
      assert.equal(state.findHydrateNode('s1', 'empty')?._vnode, null);

      const notRegistered = state.errors.filter(
        (error) => error.type === A2uiErrorType.COMPONENT_NOT_REGISTERED,
      );
      assert.equal(notRegistered.length, 1);
      assert.match(notRegistered[0].content, /component "empty" has no component type key/);
      assert.equal(notRegistered[0].componentId, 'empty');
    });

    it('渲染器抛错时只被调用一次，不重试', () => {
      let called = 0;
      init({
        renderMap: {
          Text: () => {
            called += 1;
            throw new Error('boom');
          },
        },
      });
      parseJsonl(surfaceLine, { reset: false });

      assert.equal(called, 1);
      const state = getStore().getState();
      assert.equal(state.findHydrateNode('s1', 'root')?._vnode, null);
      assert.equal(state.errors.length, 1);
    });

    it('同一组件被再次解析时渲染器会被重新调用', () => {
      let called = 0;
      init({
        renderMap: {
          Text: () => {
            called += 1;
            return `vnode-${called}`;
          },
        },
      });
      parseJsonl([surfaceLine, surfaceLine].join('\n'), { reset: false });

      assert.equal(called, 2);
      assert.equal(getStore().getState().findHydrateNode('s1', 'root')?._vnode, 'vnode-2');
    });
  });

  describe('数据绑定', () => {
    const textRenderer = (props: Record<string, unknown>) => props;

    it('仅 literal 时原样传给渲染器，不写数据模型', () => {
      init({ renderMap: { Text: textRenderer } });
      parseJsonl(
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              { id: 'root', component: { Text: { text: { literalString: 'Hello' } } } },
            ],
          },
        }),
        { reset: false },
      );

      const node = getStore().getState().findHydrateNode('s1', 'root');
      assert.deepEqual(node?.props, { text: { literalString: 'Hello' } });
      assert.deepEqual(node?._vnode, { text: { literalString: 'Hello' } });
      assert.equal(getStore().getState().dataModelMap.s1, undefined);
    });

    it('仅 path 时从模型填回 literalString，协议 props 保持原文', () => {
      init({ renderMap: { Text: textRenderer } });
      parseJsonl(
        [
          JSON.stringify({
            dataModelUpdate: {
              surfaceId: 's1',
              contents: [{ key: 'headline', valueString: 'Hello' }],
            },
          }),
          JSON.stringify({
            surfaceUpdate: {
              surfaceId: 's1',
              components: [
                { id: 'root', component: { Text: { text: { path: '/headline' } } } },
              ],
            },
          }),
        ].join('\n'),
        { reset: false },
      );

      const node = getStore().getState().findHydrateNode('s1', 'root');
      assert.deepEqual(node?.props, { text: { path: '/headline' } });
      assert.deepEqual(node?._vnode, {
        text: { path: '/headline', literalString: 'Hello' },
      });
    });

    it('path 与 literal 同时出现时先写入模型，后续 dataModelUpdate 会改 vnode', () => {
      const seen: string[] = [];
      init({
        renderMap: {
          Text: (props) => {
            const text = props.text as { literalString?: string };
            seen.push(text.literalString ?? '');
            return text.literalString ?? '';
          },
        },
      });
      parseJsonl(
        [
          JSON.stringify({
            surfaceUpdate: {
              surfaceId: 's1',
              components: [
                {
                  id: 'root',
                  component: {
                    Text: { text: { path: '/user/name', literalString: 'Guest' } },
                  },
                },
              ],
            },
          }),
          JSON.stringify({
            dataModelUpdate: {
              surfaceId: 's1',
              path: 'user',
              contents: [{ key: 'name', valueString: 'Bob' }],
            },
          }),
        ].join('\n'),
        { reset: false },
      );

      assert.deepEqual(getStore().getState().dataModelMap.s1, {
        user: { name: 'Bob' },
      });
      assert.equal(getStore().getState().findHydrateNode('s1', 'root')?._vnode, 'Bob');
      assert.deepEqual(seen, ['Guest', 'Bob']);
    });

    it('后到的隐式初始化会重渲染已经绑定该路径的旧节点', () => {
      init({
        renderMap: {
          Text: (props) => (props.text as { literalString?: string }).literalString ?? '',
        },
      });
      parseJsonl(
        [
          JSON.stringify({
            surfaceUpdate: {
              surfaceId: 's1',
              components: [
                { id: 'title', component: { Text: { text: { path: '/headline' } } } },
              ],
            },
          }),
          JSON.stringify({
            surfaceUpdate: {
              surfaceId: 's1',
              components: [
                {
                  id: 'note',
                  component: {
                    Text: { text: { path: '/headline', literalString: 'Guest' } },
                  },
                },
              ],
            },
          }),
        ].join('\n'),
        { reset: false },
      );

      assert.equal(getStore().getState().findHydrateNode('s1', 'title')?._vnode, 'Guest');
      assert.equal(getStore().getState().findHydrateNode('s1', 'note')?._vnode, 'Guest');
    });
  });

  describe('异常处理', () => {
    it('非法 JSON 行应记录 PARSE_ERROR 但不中断后续行', () => {
      const bad = '{not valid json';
      const br: BeginRenderingMessage = {
        beginRendering: { surfaceId: 'ok', root: 'r' },
      };
      parseJsonl([bad, JSON.stringify(br)].join('\n'));

      const state = getStore().getState();
      const err = state.errors[0];
      assert.ok(err);
      assert.ok(err.content.includes('invalid JSON'));
      assert.ok(state.findSurface('ok')); // 后续正常行仍被处理
    });

    it('未知 action key 应记录 PARSE_ERROR', () => {
      parseJsonl('{"bogusAction":{}}');
      const state = getStore().getState();
      assert.equal(state.errors.length, 1);
      assert.match(state.errors[0].content, /unknown message type/);
    });
  });
});
