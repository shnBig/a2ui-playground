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
import { Badge, Button, Empty, List, Modal, Progress, Tag } from 'antd';
import { createJsonlStream, init, treeBuild } from '@a2ui/core';
import type { JsonlStreamParser, SurfaceTree } from '@a2ui/core';
// .jsonl 文件为唯一数据源，通过 Vite raw 导入为字符串
import simpleTextJsonl from '@a2ui/core/mock/simple-text.jsonl?raw';
import columnTextsJsonl from '@a2ui/core/mock/column-texts.jsonl?raw';
import cardDemoJsonl from '@a2ui/core/mock/card-demo.jsonl?raw';
import { attachChildren, renderMap } from '@a2ui/react';

// 应用启动时创建 store 实例，把 React 渲染表与子节点挂载策略注入 core
const store = init({ renderMap, attachChildren });

/** 三份 mock 拼接成一次完整流；末尾已有换行，段间再加一个只是空行，会被跳过 */
const FULL_JSONL = `${simpleTextJsonl}\n${columnTextsJsonl}\n${cardDemoJsonl}`;
/** 模拟 chunk 大小与间隔，越小越能看出"逐步组合"的过程 */
const CHUNK_SIZE = 24;
const CHUNK_INTERVAL = 60;

/**
 * 预览容器 → React root。
 * 必须挂在 globalThis 上：HMR 会重新执行本模块，模块级变量会被重置，
 * 导致对同一容器重复 createRoot（"container has already been passed to createRoot()"）。
 */
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

  // 流式播放状态：模拟 server 逐 chunk 下发
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<JsonlStreamParser | null>(null);

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
      if (offset >= FULL_JSONL.length) {
        stream.flush();
        setIsStreaming(false);
        setProgress(100);
        timerRef.current = null;
        return;
      }
      stream.push(FULL_JSONL.slice(offset, offset + CHUNK_SIZE));
      offset += CHUNK_SIZE;
      setProgress(Math.min(100, Math.round((offset / FULL_JSONL.length) * 100)));
      timerRef.current = window.setTimeout(step, CHUNK_INTERVAL);
    };
    step();
  }, []);

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
    // createRoot(root).render(组件树)
    root.render(<TreePreview trees={trees} />);
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
      <div style={{ display: 'flex', gap: 12 }}>
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
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <Button onClick={startStream} disabled={isStreaming}>
          {isStreaming ? '流式接收中…' : '重新播放流'}
        </Button>
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
