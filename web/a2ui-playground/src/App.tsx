import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Badge, Button, Empty, List, Modal, Progress, Tag, message } from 'antd';
import { createJsonlStream, init, parseJsonl, treeBuild } from '@a2ui/core';
import type { JsonlStreamParser, SurfaceTree } from '@a2ui/core';
// .jsonl 文件为唯一数据源，通过 Vite raw 导入为字符串
import simpleTextJsonl from '@a2ui/core/mock/simple-text.jsonl?raw';
import columnTextsJsonl from '@a2ui/core/mock/column-texts.jsonl?raw';
import cardDemoJsonl from '@a2ui/core/mock/card-demo.jsonl?raw';
import bindingDemoJsonl from '@a2ui/core/mock/binding-demo.jsonl?raw';
import bindingCheckJsonl from '@a2ui/core/mock/binding-check.jsonl?raw';
import shoppingCartJsonl from '@a2ui/core/mock/shopping-cart.jsonl?raw';
import localUpdateJsonl from '@a2ui/core/mock/local-update.jsonl?raw';
import { attachChildren, renderMap } from '@a2ui/react';

// 应用启动时创建 store 实例，把 React 渲染表与子节点挂载策略注入 core
const store = init({ renderMap, attachChildren });

/** 四份 mock 拼接成一次完整流；末尾已有换行，段间再加一个只是空行，会被跳过 */
const FULL_JSONL = `${simpleTextJsonl}\n${columnTextsJsonl}\n${cardDemoJsonl}\n${bindingDemoJsonl}`;
/** 模拟 chunk 大小与间隔，越小越能看出"逐步组合"的过程 */
const CHUNK_SIZE = 24;
const CHUNK_INTERVAL = 60;

const DEMOS = {
  full: { label: '完整流', jsonl: FULL_JSONL },
  binding: { label: '数据绑定', jsonl: bindingCheckJsonl },
  cart: { label: '购物车', jsonl: shoppingCartJsonl },
  local: { label: '本地更新', jsonl: localUpdateJsonl },
} as const;
type DemoId = keyof typeof DEMOS;

/** 绑定 demo 播放结束后再推一次，用来确认画面跟着模型变 */
const BINDING_UPDATE = [
  JSON.stringify({
    dataModelUpdate: {
      surfaceId: 'binding-check',
      path: '/profile',
      contents: [{ key: 'name', valueString: 'Bob' }],
    },
  }),
  JSON.stringify({
    dataModelUpdate: {
      surfaceId: 'binding-check',
      path: '/items',
      contents: [
        { key: 'a', valueMap: [{ key: 'title', valueString: 'Gamma' }] },
        { key: 'b', valueMap: [{ key: 'title', valueString: 'Delta' }] },
      ],
    },
  }),
].join('\n');

/** 购物车 demo：整棵模型替换（省略 path），需带上仍要保留的字段 */
const CART_UPDATE = [
  JSON.stringify({
    dataModelUpdate: {
      surfaceId: 'shopping-cart',
      contents: [
        { key: 'title', valueString: '购物车' },
        { key: 'subtitle', valueString: '2 件商品' },
        {
          key: 'items',
          valueMap: [
            {
              key: 'espresso',
              valueMap: [
                { key: 'name', valueString: '意式浓缩' },
                { key: 'detail', valueString: '×2 · ¥36.00' },
              ],
            },
            {
              key: 'matcha',
              valueMap: [
                { key: 'name', valueString: '抹茶拿铁' },
                { key: 'detail', valueString: '×1 · ¥28.00' },
              ],
            },
          ],
        },
        {
          key: 'summary',
          valueMap: [
            { key: 'count', valueString: '共 3 件' },
            { key: 'total', valueString: '合计 ¥64.00' },
          ],
        },
      ],
    },
  }),
].join('\n');

/**
 * 预览容器 → React root。
 * 必须挂在 globalThis 上：HMR 会重新执行本模块，模块级变量会被重置，
 * 导致对同一容器重复 createRoot（"container has already been passed to createRoot()"）。
 */
const AGENT_URL = '/agent';

type AguiEvent = {
  type?: string;
  name?: string;
  value?: unknown;
};

function buildAgentBody(userText: string) {
  return {
    threadId: `thread-${Date.now()}`,
    runId: `run-${Date.now()}`,
    messages: [{ id: `msg-${Date.now()}`, role: 'user', content: userText }],
  };
}

/** 从 AG-UI 事件里抽出 CUSTOM name=a2ui 的 A2UI 消息，拼成 JSONL */
function a2uiJsonlFromEvents(events: AguiEvent[]): string {
  return events
    .filter((event) => event.type === 'CUSTOM' && event.name === 'a2ui' && event.value)
    .map((event) => JSON.stringify(event.value))
    .join('\n');
}

const ROOT_REGISTRY_KEY = '__a2uiPreviewRoots__';

function getRootRegistry(): WeakMap<HTMLDivElement, Root> {
  const holder = globalThis as typeof globalThis & Record<string, unknown>;
  if (!(holder[ROOT_REGISTRY_KEY] instanceof WeakMap)) {
    holder[ROOT_REGISTRY_KEY] = new WeakMap<HTMLDivElement, Root>();
  }
  return holder[ROOT_REGISTRY_KEY] as WeakMap<HTMLDivElement, Root>;
}

export default function App() {
  const state = useSyncExternalStore(
    store.subscribe,
    () => store.getState(),
  );
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentResult, setAgentResult] = useState<string>('');

  // 流式播放状态：模拟 server 逐 chunk 下发
  const [demoId, setDemoId] = useState<DemoId>('full');
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewText, setPreviewText] = useState('');
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<JsonlStreamParser | null>(null);
  const jsonl = DEMOS[demoId].jsonl;

  // store 变化时重新组装组件树
  const trees = useMemo(() => treeBuild(), [state]);

  /** 重新开始一次流式输出：先清空 store 数据，再按 chunk 逐步 push */
  const startStream = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 默认 reset：清空上一次的数据，但保留 init() 注入的 renderMap
    const stream = createJsonlStream();
    streamRef.current = stream;
    setIsStreaming(true);
    setProgress(0);

    let offset = 0;
    const step = () => {
      if (streamRef.current !== stream) return; // 已被新一轮播放替换
      if (offset >= jsonl.length) {
        stream.flush();
        setIsStreaming(false);
        setProgress(100);
        timerRef.current = null;
        return;
      }
      stream.push(jsonl.slice(offset, offset + CHUNK_SIZE));
      offset += CHUNK_SIZE;
      setProgress(Math.min(100, Math.round((offset / jsonl.length) * 100)));
      timerRef.current = window.setTimeout(step, CHUNK_INTERVAL);
    };
    step();
  }, [jsonl]);

  // 首屏自动播放一次；卸载时清理未完成的定时器
  useEffect(() => {
    startStream();
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [startStream]);

  const pushBindingUpdate = useCallback(() => {
    parseJsonl(BINDING_UPDATE, { reset: false });
  }, []);

  const pushCartUpdate = useCallback(() => {
    parseJsonl(CART_UPDATE, { reset: false });
  }, []);

  /** 调用 playground-server /agent；sse=false 一次拿齐，sse=true 边收边 parse */
  const callAgent = useCallback(async (useSse: boolean) => {
    setAgentLoading(true);
    try {
      const url = useSse ? AGENT_URL : `${AGENT_URL}?sse=false`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: useSse ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(buildAgentBody('本地更新')),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      if (!useSse) {
        const data = (await res.json()) as { sse?: boolean; events?: AguiEvent[] };
        const events = Array.isArray(data.events) ? data.events : [];
        const jsonl = a2uiJsonlFromEvents(events);
        parseJsonl(jsonl, { reset: true });
        setAgentResult(JSON.stringify(data, null, 2));
        setAgentModalOpen(true);
        message.success(`agent JSON：${events.length} 条事件已渲染`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('response body is empty');
      const decoder = new TextDecoder();
      let buffer = '';
      const events: AguiEvent[] = [];
      const stream = createJsonlStream({ reset: true });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const dataLine = chunk
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          const payload = dataLine.slice('data:'.length).trim();
          if (!payload) continue;
          const event = JSON.parse(payload) as AguiEvent;
          events.push(event);
          if (event.type === 'CUSTOM' && event.name === 'a2ui' && event.value) {
            stream.push(`${JSON.stringify(event.value)}\n`);
          }
        }
      }
      stream.flush();
      setAgentResult(JSON.stringify({ sse: true, events }, null, 2));
      setAgentModalOpen(true);
      message.success(`agent SSE：${events.length} 条事件已流式渲染`);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      message.error(`agent 请求失败：${text}`);
      setAgentResult(text);
      setAgentModalOpen(true);
    } finally {
      setAgentLoading(false);
    }
  }, []);

  // 预览区使用独立的 React root 渲染，与主应用隔离
  const previewRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // 同一个容器只允许 createRoot 一次（HMR 会重复执行 effect）
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    previewContainerRef.current = container;

    const registry = getRootRegistry();
    let root = registry.get(container);
    if (!root) {
      root = createRoot(container);
      registry.set(container, root);
    }
    // createRoot(root).render(组件树)。渲染是异步的，下一帧再读预览文本做绑定核对
    root.render(<TreePreview trees={trees} />);
    let cancelled = false;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!cancelled) setPreviewText(container.innerText);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [trees]);

  // 容器真正脱离文档（页面卸载）时销毁 root；HMR 时容器仍在文档中，复用原 root。
  // 卸载延迟到当前任务之后，避免在 React 渲染期间同步 unmount 触发竞态警告。
  useEffect(
    () => () => {
      const container = previewContainerRef.current;
      if (!container) return;
      const registry = getRootRegistry();
      const root = registry.get(container);
      if (!root) return;
      setTimeout(() => {
        if (!container.isConnected) {
          registry.delete(container);
          root.unmount();
        }
      }, 0);
    },
    [],
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button type="primary" onClick={() => setStoreModalOpen(true)}>
          查看 store
        </Button>
        <Badge count={state.errors.length} size="small">
          <Button
            danger={state.errors.length > 0}
            onClick={() => setErrorModalOpen(true)}
          >
            查看错误
          </Button>
        </Badge>
        <Button loading={agentLoading} onClick={() => callAgent(false)}>
          测试 agent (JSON)
        </Button>
        <Button loading={agentLoading} onClick={() => callAgent(true)}>
          测试 agent (SSE)
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {(Object.keys(DEMOS) as DemoId[]).map((id) => (
          <Button
            key={id}
            type={demoId === id ? 'primary' : 'default'}
            disabled={isStreaming && demoId === id}
            onClick={() => setDemoId(id)}
          >
            {DEMOS[id].label}
          </Button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <Button onClick={startStream} disabled={isStreaming}>
          {isStreaming ? '流式接收中…' : '重新播放'}
        </Button>
        {demoId === 'binding' ? (
          <Button onClick={pushBindingUpdate} disabled={isStreaming}>
            推送 dataModelUpdate
          </Button>
        ) : null}
        {demoId === 'cart' ? (
          <Button onClick={pushCartUpdate} disabled={isStreaming}>
            移除芝士蛋糕
          </Button>
        ) : null}
        <Tag color={isStreaming ? 'processing' : 'success'}>
          {isStreaming ? 'streaming' : 'done'}
        </Tag>
        <Progress
          percent={progress}
          size="small"
          showInfo={false}
          style={{ width: 240 }}
        />
        <span style={{ color: '#888', fontSize: 12 }}>
          {progress}% ({CHUNK_SIZE} 字符/块，每 {CHUNK_INTERVAL}ms 一块)
        </span>
      </div>

      {demoId === 'binding' ? (
        <BindingCheck
          streaming={isStreaming}
          model={state.dataModelMap['binding-check']}
          previewText={previewText}
        />
      ) : null}
      {demoId === 'cart' ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#fafafa',
            color: '#555',
          }}
        >
          使用 react catalog：List 模板展开购物车行，Card 包一层商品信息。播放结束后点「移除芝士蛋糕」会更新
          dataModel，列表与合计应同步变化。
        </div>
      ) : null}
      {demoId === 'local' ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#fafafa',
            color: '#555',
          }}
        >
          Button.action.type=localUpdate：点击预览区「更新文案」会在客户端 applyDataModelUpdate，文案应从「点击前」变为「点击后」，不上送
          userAction。
        </div>
      ) : null}
      <div ref={previewRef} style={{ marginTop: 24 }} />

      <Modal
        title="A2UI Store"
        open={storeModalOpen}
        onCancel={() => setStoreModalOpen(false)}
        footer={null}
        width={800}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 6,
            maxHeight: '60vh',
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {JSON.stringify(state, serializeState, 2)}
        </pre>
      </Modal>

      <Modal
        title="Agent 响应"
        open={agentModalOpen}
        onCancel={() => setAgentModalOpen(false)}
        footer={null}
        width={800}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 6,
            maxHeight: '60vh',
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {agentResult}
        </pre>
      </Modal>

      <Modal
        title="A2UI Errors"
        open={errorModalOpen}
        onCancel={() => setErrorModalOpen(false)}
        footer={null}
        width={800}
      >
        {state.errors.length === 0 ? (
          <Empty description="暂无错误" />
        ) : (
          <List
            dataSource={state.errors}
            style={{ maxHeight: '60vh', overflow: 'auto' }}
            renderItem={(error) => (
              <List.Item key={error.errorId}>
                <div>
                  <Tag color="red">{error.type}</Tag>
                  <div style={{ marginTop: 4 }}>{error.content}</div>
                  <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                    {error.surfaceId ? `surface: ${error.surfaceId}` : null}
                    {error.surfaceId && error.componentId ? ' / ' : null}
                    {error.componentId ? `component: ${error.componentId}` : null}
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
}

function readString(model: unknown, key: string): string | undefined {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return undefined;
  const value = (model as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function readItemTitles(model: unknown): string[] {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return [];
  const items = (model as Record<string, unknown>).items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) return [];
  return Object.values(items).flatMap((item) => {
    const title = readString(item, 'title');
    return title ? [title] : [];
  });
}

/** 把当前数据模型和预览文本对照，绑定成功时三项都通过 */
function BindingCheck({
  streaming,
  model,
  previewText,
}: {
  streaming: boolean;
  model: unknown;
  previewText: string;
}) {
  const profile = model && typeof model === 'object' && !Array.isArray(model)
    ? (model as Record<string, unknown>).profile
    : undefined;
  const name = readString(profile, 'name');
  const titles = readItemTitles(model);
  const checks = [
    {
      label: '字面量仍是 Static literal',
      pass: previewText.includes('Static literal'),
    },
    {
      label: name ? `路径绑定显示 ${name}` : '路径绑定已写入模型',
      pass:
        name !== undefined &&
        previewText.includes(name) &&
        !previewText.includes('Guest') &&
        (name === 'Bob' ? !previewText.includes('Alice') : !previewText.includes('Bob')),
    },
    {
      label: titles.length > 0 ? `模板列表显示 ${titles.join('、')}` : '模板列表已展开',
      pass:
        titles.length > 0 &&
        titles.every((title) => previewText.includes(title)) &&
        (name === 'Bob'
          ? !previewText.includes('Alpha') && !previewText.includes('Beta')
          : !previewText.includes('Gamma') && !previewText.includes('Delta')),
    },
  ];

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fafafa',
      }}
    >
      <div style={{ marginBottom: 8, color: '#555' }}>
        播放结束后应看到 Alice、Alpha、Beta。点击「推送 dataModelUpdate」后应变成 Bob、Gamma、Delta，Static literal 不变。
      </div>
      {streaming ? (
        <Tag color="processing">播放中，结束后自动核对</Tag>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {checks.map((check) => (
            <Tag key={check.label} color={check.pass ? 'success' : 'error'}>
              {check.pass ? '通过' : '未通过'} · {check.label}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

/** 预览区内容：直接渲染每个 surface 组装好的根 vnode */
function TreePreview({ trees }: { trees: SurfaceTree[] }) {
  return (
    <>
      {trees.map((tree) =>
        tree.rootVnode ? (
          <div key={tree.surfaceId} id={`surface-${tree.surfaceId}`}>
            {tree.rootVnode as ReactNode}
          </div>
        ) : null,
      )}
    </>
  );
}

/** 序列化时用占位符替代 ReactElement 与函数表，避免输出不可读内容 */
function serializeState(key: string, value: unknown): unknown {
  if (key === '_vnode') {
    return value === null ? null : '[ReactElement]';
  }
  if (key === 'renderMap') {
    return '[renderMap]';
  }
  return value;
}
