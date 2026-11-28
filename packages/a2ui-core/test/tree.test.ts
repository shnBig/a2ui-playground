import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getStore, init } from '../src/store/store.js';
import { parseJsonl } from '../src/parser/index.js';
import { treeBuild } from '../src/treebuilder/index.js';
import type { ComponentTreeNode } from '../src/treebuilder/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// simple-text 使用固定 fixture；树结构用例直接使用 mock/column-texts.jsonl
const MOCK_JSONL = join(__dirname, 'fixtures', 'simple-text.jsonl');
const COLUMN_MOCK_JSONL = join(__dirname, '..', 'mock', 'column-texts.jsonl');

function readMock(): string {
  return readFileSync(MOCK_JSONL, 'utf-8');
}

function readColumnMock(): string {
  return readFileSync(COLUMN_MOCK_JSONL, 'utf-8');
}

describe('treeBuild', () => {
  beforeEach(() => init());

  it('解析 simple-text 后组装出单 surface 组件树', () => {
    parseJsonl(readMock());

    const trees = treeBuild();
    assert.equal(trees.length, 1);

    const tree = trees[0];
    assert.equal(tree.surfaceId, 'simple-text');
    assert.equal(tree.beginRender, true);
    assert.equal(tree.root?.componentId, 'root');
    assert.deepEqual(tree.root?.children, [], '暂不组装子节点，children 为空');
    assert.equal(tree.root?.vnode, getStore().getState().findHydrateNode('simple-text', 'root')?._vnode);
  });

  it('组件树的 vnode 是 renderMap 渲染产物', () => {
    init({ renderMap: { Text: () => ({ rendered: true }) } });
    parseJsonl(readMock(), { reset: false });

    const tree = treeBuild()[0];
    assert.deepEqual(tree.root?.vnode, { rendered: true });
  });

  it('未注入 attachChildren 时 rootVnode 等于 root.vnode', () => {
    init({ renderMap: { Text: () => 'text-vnode' } });
    parseJsonl(readMock(), { reset: false });

    const tree = treeBuild()[0];
    assert.equal(tree.rootVnode, tree.root?.vnode);
  });

  it('注入 attachChildren 后 rootVnode 已挂载子节点，可直接渲染', () => {
    init({
      renderMap: { Column: () => 'column-vnode', Text: () => 'text-vnode' },
      attachChildren: (vnode, children) =>
        `${vnode}(${children.join('|')})`,
    });
    parseJsonl(readColumnMock(), { reset: false });

    const tree = treeBuild().find((item) => item.surfaceId === 'column-texts');
    assert.equal(
      tree?.rootVnode,
      'column-vnode(text-vnode|text-vnode|text-vnode)',
      'rootVnode 应为已挂载子节点的最终渲染树',
    );
  });

  it('未 beginRendering 的 surface，root 与 rootVnode 均为 null', () => {
    parseJsonl(
      JSON.stringify({
        surfaceUpdate: {
          surfaceId: 's1',
          components: [{ id: 'c1', component: { Text: {} } }],
        },
      }),
    );

    const tree = treeBuild().find((item) => item.surfaceId === 's1');
    assert.ok(tree);
    assert.equal(tree.beginRender, false);
    assert.equal(tree.root, null);
    assert.equal(tree.rootVnode, null);
  });

  it('parseJsonl 返回结果中携带组装好的组件树', () => {
    const result = parseJsonl(readMock());

    assert.equal(result.trees.length, 1);
    assert.equal(result.trees[0].surfaceId, 'simple-text');
    assert.equal(result.trees[0].root?.componentId, 'root');
  });

  it('解析后组件树随 store 变化同步更新', () => {
    parseJsonl(readMock());
    assert.equal(treeBuild()[0].root?.componentId, 'root');

    // 删除 surface 后，组件树不再包含该 surface
    parseJsonl(
      JSON.stringify({ deleteSurface: { surfaceId: 'simple-text' } }),
      { reset: false },
    );
    assert.equal(treeBuild().length, 0);
  });

  it('按 children.explicitList 组装 Column 与三个 Text 的父子结构', () => {
    init({ renderMap: { Column: () => null, Text: () => null } });
    parseJsonl(readColumnMock(), { reset: false });

    const tree = treeBuild().find((item) => item.surfaceId === 'column-texts');
    assert.ok(tree?.root, '应组装出根节点');

    const root = tree.root;
    assert.equal(root.componentId, 'root');
    assert.equal(root.parentId, null, '根节点 parentId 为 null');
    assert.deepEqual(
      getStore().getState().findHydrateNode('column-texts', 'root')?.children,
      ['text-1', 'text-2', 'text-3'],
      'HydrateNode.children 保存协议中的子组件 id',
    );
    assert.deepEqual(
      root.children.map((child) => child.componentId),
      ['text-1', 'text-2', 'text-3'],
      'children 顺序应与 explicitList 一致',
    );
    for (const child of root.children) {
      assert.equal(child.parentId, 'root', '子节点 parentId 指向父组件');
      assert.deepEqual(child.children, []);
    }
  });

  it('树中每个节点的 vnode 与 store 中对应 hydrateNode 的 _vnode 一致', () => {
    init({ renderMap: { Column: () => 'column-vnode', Text: () => 'text-vnode' } });
    parseJsonl(readColumnMock(), { reset: false });

    const root = treeBuild().find((item) => item.surfaceId === 'column-texts')?.root;
    assert.ok(root);

    const state = getStore().getState();
    const walk = (node: typeof root) => {
      assert.equal(
        node.vnode,
        state.findHydrateNode('column-texts', node.componentId)?._vnode,
        `${node.componentId} 的 vnode 应来自 store`,
      );
      node.children.forEach(walk);
    };
    walk(root);

    assert.equal(root.vnode, 'column-vnode');
    assert.deepEqual(
      root.children.map((child) => child.vnode),
      ['text-vnode', 'text-vnode', 'text-vnode'],
    );
  });

  it('多次 treeBuild 结果稳定且不修改 store', () => {
    init({ renderMap: { Column: () => null, Text: () => null } });
    parseJsonl(readColumnMock(), { reset: false });

    const first = treeBuild().find((item) => item.surfaceId === 'column-texts')?.root;
    const nodeKeysBefore = Object.keys(getStore().getState().hydrateNodeMap).sort();
    const second = treeBuild().find((item) => item.surfaceId === 'column-texts')?.root;

    const simplify = (node: ComponentTreeNode | null | undefined): unknown =>
      node && {
        id: node.componentId,
        parentId: node.parentId,
        children: node.children.map(simplify),
      };

    assert.deepEqual(simplify(first), simplify(second));
    assert.deepEqual(
      Object.keys(getStore().getState().hydrateNodeMap).sort(),
      nodeKeysBefore,
      'treeBuild 不应增删 hydrateNode',
    );
  });

  it('子组件在协议中先于父组件定义时仍按 explicitList 组装', () => {
    init({ renderMap: { Column: () => null, Text: () => null } });

    // 子组件先定义、父组件后定义
    const surfaceUpdate = {
      surfaceUpdate: {
        surfaceId: 'column-texts',
        components: [
          { id: 'text-1', component: { Text: {} } },
          { id: 'text-2', component: { Text: {} } },
          { id: 'text-3', component: { Text: {} } },
          {
            id: 'root',
            component: {
              Column: { children: { explicitList: ['text-1', 'text-2', 'text-3'] } },
            },
          },
        ],
      },
    };
    const beginRendering = {
      beginRendering: { surfaceId: 'column-texts', root: 'root' },
    };
    parseJsonl(
      [JSON.stringify(surfaceUpdate), JSON.stringify(beginRendering)].join('\n'),
      { reset: false },
    );

    const root = treeBuild().find((item) => item.surfaceId === 'column-texts')?.root;
    assert.deepEqual(
      root?.children.map((child) => child.componentId),
      ['text-1', 'text-2', 'text-3'],
      'children 顺序应跟随 explicitList，而不是组件定义顺序',
    );
  });

  it('Card 通过 child 单引用组装子树', () => {
    init({
      renderMap: {
        Card: () => 'card-vnode',
        Column: () => 'column-vnode',
        Text: () => 'text-vnode',
      },
      attachChildren: (vnode, children) => `${vnode}(${children.join('|')})`,
    });
    parseJsonl(
      [
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'card' } }),
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              { id: 'card', component: { Card: { child: 'body' } } },
              {
                id: 'body',
                component: {
                  Column: { children: { explicitList: ['text-1'] } },
                },
              },
              { id: 'text-1', component: { Text: {} } },
            ],
          },
        }),
      ].join('\n'),
      { reset: false },
    );

    const tree = treeBuild().find((item) => item.surfaceId === 's1');
    assert.deepEqual(
      getStore().getState().findHydrateNode('s1', 'card')?.children,
      ['body'],
      'child 单引用应写入 HydrateNode.children',
    );
    assert.equal(tree?.root?.componentId, 'card');
    assert.equal(tree?.root?.children[0].componentId, 'body');
    assert.equal(tree?.root?.children[0].parentId, 'card');
    assert.equal(
      tree?.rootVnode,
      'card-vnode(column-vnode(text-vnode))',
      'Card → Column → Text 应递归挂载成一棵渲染树',
    );
  });

  it('子组件引用不存在时跳过该子节点', () => {
    init({ renderMap: { Column: () => null, Text: () => null } });
    parseJsonl(
      [
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              {
                id: 'root',
                component: {
                  Column: { children: { explicitList: ['text-1', 'ghost'] } },
                },
              },
              { id: 'text-1', component: { Text: { text: { literalString: 'hi' } } } },
            ],
          },
        }),
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'root' } }),
      ].join('\n'),
      { reset: false },
    );

    const root = treeBuild().find((item) => item.surfaceId === 's1')?.root;
    assert.deepEqual(
      root?.children.map((child) => child.componentId),
      ['text-1'],
    );
  });

  it('子节点形成环时只展开一次', () => {
    init({ renderMap: { Column: () => null } });
    parseJsonl(
      [
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              { id: 'a', component: { Column: { children: { explicitList: ['b'] } } } },
              { id: 'b', component: { Column: { children: { explicitList: ['a'] } } } },
            ],
          },
        }),
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'a' } }),
      ].join('\n'),
      { reset: false },
    );

    const root = treeBuild().find((item) => item.surfaceId === 's1')?.root;
    assert.equal(root?.componentId, 'a');
    assert.equal(root?.children[0].componentId, 'b');
    assert.deepEqual(root?.children[0].children, [], '环上的 a 不再展开');
  });

  it('template 按 map 插入顺序展开，相对路径取当前项，绝对路径仍读 surface 模型', () => {
    init({
      renderMap: {
        Column: () => 'col',
        Text: (props) => (props.text as { literalString?: string }).literalString ?? '',
      },
      attachChildren: (vnode, children) => `${vnode}[${children.join(',')}]`,
    });
    parseJsonl(
      [
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              {
                id: 'list',
                component: {
                  Column: {
                    children: { template: { componentId: 'row', dataBinding: '/items' } },
                  },
                },
              },
              {
                id: 'row',
                component: { Column: { children: { explicitList: ['rel', 'abs'] } } },
              },
              { id: 'rel', component: { Text: { text: { path: 'title' } } } },
              { id: 'abs', component: { Text: { text: { path: '/headline' } } } },
            ],
          },
        }),
        JSON.stringify({
          dataModelUpdate: {
            surfaceId: 's1',
            contents: [
              { key: 'headline', valueString: 'Hello' },
              {
                key: 'items',
                valueMap: [
                  { key: 'a', valueMap: [{ key: 'title', valueString: 'First' }] },
                  { key: 'b', valueMap: [{ key: 'title', valueString: 'Second' }] },
                ],
              },
            ],
          },
        }),
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'list' } }),
      ].join('\n'),
      { reset: false },
    );

    const tree = treeBuild().find((item) => item.surfaceId === 's1');
    assert.deepEqual(
      tree?.root?.children.map((child) => child.componentId),
      ['row@a', 'row@b'],
    );
    assert.equal(tree?.rootVnode, 'col[col[First,Hello],col[Second,Hello]]');
    assert.deepEqual(
      getStore().getState().findHydrateNode('s1', 'list')?.children,
      [],
      'template 克隆不写入 HydrateNode.children',
    );
  });

  it('List 的 template 按 valueMap 展开，direction 不参与组树', () => {
    init({
      renderMap: {
        List: () => 'list',
        Text: (props) => (props.text as { literalString?: string }).literalString ?? '',
      },
      attachChildren: (vnode, children) => `${vnode}[${children.join(',')}]`,
    });
    parseJsonl(
      [
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              {
                id: 'feed',
                component: {
                  List: {
                    direction: 'horizontal',
                    alignment: 'start',
                    children: { template: { componentId: 'item', dataBinding: '/items' } },
                  },
                },
              },
              { id: 'item', component: { Text: { text: { path: 'title' } } } },
            ],
          },
        }),
        JSON.stringify({
          dataModelUpdate: {
            surfaceId: 's1',
            contents: [
              {
                key: 'items',
                valueMap: [
                  { key: 'a', valueMap: [{ key: 'title', valueString: 'First' }] },
                  { key: 'b', valueMap: [{ key: 'title', valueString: 'Second' }] },
                ],
              },
            ],
          },
        }),
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'feed' } }),
      ].join('\n'),
      { reset: false },
    );

    const tree = treeBuild().find((item) => item.surfaceId === 's1');
    assert.deepEqual(
      tree?.root?.children.map((child) => child.componentId),
      ['item@a', 'item@b'],
    );
    assert.equal(tree?.rootVnode, 'list[First,Second]');
    assert.deepEqual(getStore().getState().findHydrateNode('s1', 'feed')?.children, []);
  });

  it('template 的 dataBinding 不是集合时不产出子节点', () => {
    init({ renderMap: { Column: () => 'col', Text: () => 'text' } });
    parseJsonl(
      [
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              {
                id: 'list',
                component: {
                  Column: {
                    children: { template: { componentId: 'item', dataBinding: '/missing' } },
                  },
                },
              },
              { id: 'item', component: { Text: { text: { path: 'title' } } } },
            ],
          },
        }),
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'list' } }),
      ].join('\n'),
      { reset: false },
    );

    const root = treeBuild().find((item) => item.surfaceId === 's1')?.root;
    assert.deepEqual(root?.children, []);
    assert.equal(root?.vnode, 'col');
  });

  it('literalArray 按数组下标展开 template', () => {
    init({
      renderMap: {
        Column: () => 'col',
        Text: (props) => (props.text as { literalString?: string }).literalString ?? '',
      },
      attachChildren: (vnode, children) => `${vnode}[${children.join(',')}]`,
    });
    parseJsonl(
      [
        JSON.stringify({
          surfaceUpdate: {
            surfaceId: 's1',
            components: [
              {
                id: 'list',
                component: {
                  Column: {
                    children: { template: { componentId: 'item', dataBinding: '/tags' } },
                  },
                },
              },
              {
                id: 'item',
                component: { Text: { text: { path: '/tags', literalArray: ['a', 'b'] } } },
              },
            ],
          },
        }),
        JSON.stringify({ beginRendering: { surfaceId: 's1', root: 'list' } }),
      ].join('\n'),
      { reset: false },
    );

    const tree = treeBuild().find((item) => item.surfaceId === 's1');
    assert.deepEqual(getStore().getState().dataModelMap.s1, { tags: ['a', 'b'] });
    assert.deepEqual(
      tree?.root?.children.map((child) => child.componentId),
      ['item@0', 'item@1'],
    );
    assert.equal(tree?.rootVnode, 'col[,]');
  });
});
