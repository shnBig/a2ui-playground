import assert from 'node:assert/strict';
import { getStore, init } from '../src/store/store.js';
import { createJsonlStream } from '../src/parser/index.js';

const LINE_UPDATE = JSON.stringify({
  surfaceUpdate: {
    surfaceId: 's1',
    components: [{ id: 'root', component: { Text: {} } }],
  },
});
const LINE_BEGIN = JSON.stringify({
  beginRendering: { surfaceId: 's1', root: 'root' },
});
const FULL_JSONL = [LINE_UPDATE, LINE_BEGIN, ''].join('\n');

describe('createJsonlStream', () => {
  // 默认注册 Text，避免未注册错误干扰断言
  beforeEach(() => init({ renderMap: { Text: () => 'text-vnode' } }));

  it('chunk 在 JSON 中间断开时缓冲后仍能正确解析', () => {
    const stream = createJsonlStream();
    // 按 7 字符切片，必然把 JSON 从中间切断
    for (let i = 0; i < FULL_JSONL.length; i += 7) {
      stream.push(FULL_JSONL.slice(i, i + 7));
    }
    const result = stream.flush();

    assert.equal(result.errorCount, 0, '半截 JSON 不应被提前解析而报错');
    const tree = result.trees.find((item) => item.surfaceId === 's1');
    assert.equal(tree?.beginRender, true);
    assert.equal(tree?.root?.componentId, 'root');
  });

  it('一次 push 包含多行时全部处理', () => {
    const stream = createJsonlStream();
    const result = stream.push(FULL_JSONL);

    assert.equal(result.errorCount, 0);
    assert.equal(result.trees[0].rootVnode, 'text-vnode');
  });

  it('半行 JSON 留在缓冲区，不解析也不报错', () => {
    const stream = createJsonlStream();
    const result = stream.push(LINE_UPDATE); // 缺少换行符

    assert.equal(result.errorCount, 0);
    assert.deepEqual(result.surfaces, {});
    assert.deepEqual(result.trees, []);
  });

  it('每次 push 返回增量结果，flush 后树才完整', () => {
    const stream = createJsonlStream();

    const afterUpdate = stream.push(`${LINE_UPDATE}\n`);
    const surfaceAfterUpdate = afterUpdate.trees.find((item) => item.surfaceId === 's1');
    assert.ok(afterUpdate.surfaces.s1, 'surfaceUpdate 已写入 store');
    assert.equal(surfaceAfterUpdate?.beginRender, false);
    assert.equal(surfaceAfterUpdate?.root, null, '未 beginRendering 前不组装树');

    const afterBeginBuffered = stream.push(LINE_BEGIN); // 末尾无换行，仍在缓冲
    assert.equal(
      afterBeginBuffered.trees.find((item) => item.surfaceId === 's1')?.beginRender,
      false,
    );

    const afterFlush = stream.flush();
    const surfaceAfterFlush = afterFlush.trees.find((item) => item.surfaceId === 's1');
    assert.equal(surfaceAfterFlush?.beginRender, true);
    assert.equal(surfaceAfterFlush?.root?.componentId, 'root');
  });

  it('flush 幂等：重复调用不会重复解析', () => {
    let called = 0;
    init({
      renderMap: {
        Text: () => {
          called += 1;
          return 'text-vnode';
        },
      },
    });

    const stream = createJsonlStream({ reset: false });
    stream.push(LINE_UPDATE); // 未换行，仍在缓冲
    assert.equal(called, 0);

    stream.flush();
    assert.equal(called, 1);

    stream.flush();
    assert.equal(called, 1, '缓冲区已清空，不应再次调用渲染器');
  });

  it('非法行只记录错误，不影响后续行解析', () => {
    const stream = createJsonlStream();
    stream.push(`{not valid json\n${LINE_UPDATE}\n`);
    const result = stream.flush();

    assert.equal(result.errorCount, 1);
    assert.match(getStore().getState().errors[0].content, /invalid JSON/);
    assert.ok(result.surfaces.s1, '后续合法行仍被处理');
  });

  it('父级先到先渲染，子组件到达后逐步挂载', () => {
    init({
      renderMap: { Column: () => 'column-vnode', Text: () => 'text-vnode' },
      attachChildren: (vnode, children) => `${vnode}(${children.join('|')})`,
    });

    const begin = JSON.stringify({
      beginRendering: { surfaceId: 's1', root: 'root' },
    });
    const rootLine = JSON.stringify({
      surfaceUpdate: {
        surfaceId: 's1',
        components: [
          {
            id: 'root',
            component: { Column: { children: { explicitList: ['t1', 't2'] } } },
          },
        ],
      },
    });
    const textLine = (id: string) =>
      JSON.stringify({
        surfaceUpdate: {
          surfaceId: 's1',
          components: [{ id, component: { Text: {} } }],
        },
      });

    const stream = createJsonlStream({ reset: false });
    const findTree = (result: ReturnType<typeof stream.push>) =>
      result.trees.find((item) => item.surfaceId === 's1');

    // beginRendering 先到、root 未到：暂不渲染
    assert.equal(findTree(stream.push(`${begin}\n`))?.rootVnode, null);

    // 父级到齐：先渲染出空容器
    const afterRoot = findTree(stream.push(`${rootLine}\n`));
    assert.equal(afterRoot?.root?.componentId, 'root');
    assert.deepEqual(afterRoot?.root?.children, []);
    assert.equal(afterRoot?.rootVnode, 'column-vnode');

    // 子组件逐个到达：容器内容逐步增加
    assert.equal(
      findTree(stream.push(`${textLine('t1')}\n`))?.rootVnode,
      'column-vnode(text-vnode)',
    );
    assert.equal(
      findTree(stream.push(`${textLine('t2')}\n`))?.rootVnode,
      'column-vnode(text-vnode|text-vnode)',
    );
  });
});
