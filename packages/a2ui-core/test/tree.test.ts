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

    const [updateLine, beginLine] = readColumnMock().trim().split('\n');
    const update = JSON.parse(updateLine) as {
      surfaceUpdate: { surfaceId: string; components: Array<{ id: string }> };
    };
    // 打乱定义顺序：把子组件放到父组件之前
    update.surfaceUpdate.components.reverse();
    parseJsonl([JSON.stringify(update), beginLine].join('\n'), { reset: false });

    const root = treeBuild().find((item) => item.surfaceId === 'column-texts')?.root;
    assert.deepEqual(
      root?.children.map((child) => child.componentId),
      ['text-1', 'text-2', 'text-3'],
      'children 顺序应跟随 explicitList，而不是组件定义顺序',
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
});
