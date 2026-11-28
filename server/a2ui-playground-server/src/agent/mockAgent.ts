import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { A2uiMessage } from '../agui/events.js';
import type { Agent, AgentRunInput } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** monorepo: server/a2ui-playground-server/src/agent → packages/a2ui-core/mock */
const MOCK_DIR = path.resolve(__dirname, '../../../../packages/a2ui-core/mock');

const CHUNK_DELAY_MS = 120;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pickMockFile(userText: string): string {
  const text = userText.toLowerCase();
  if (text.includes('购物') || text.includes('cart') || text.includes('shopping')) {
    return 'shopping-cart.jsonl';
  }
  if (text.includes('绑定') || text.includes('binding')) {
    return 'binding-check.jsonl';
  }
  if (text.includes('simple') || text.includes('简单文本')) {
    return 'simple-text.jsonl';
  }
  // 默认：本地更新 demo（含 Button + path 文案）
  return 'local-update.jsonl';
}

function loadA2uiMessages(fileName: string): A2uiMessage[] {
  const raw = fs.readFileSync(path.join(MOCK_DIR, fileName), 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as A2uiMessage);
}

/**
 * Mock agent：按用户输入挑选现成 A2UI JSONL，逐条 delay 产出，模拟流式生成。
 */
export class MockAgent implements Agent {
  async *run(input: AgentRunInput): AsyncIterable<A2uiMessage> {
    const fileName = pickMockFile(input.userText);
    const messages = loadA2uiMessages(fileName);

    for (const message of messages) {
      if (input.signal?.aborted) return;
      await sleep(CHUNK_DELAY_MS, input.signal);
      if (input.signal?.aborted) return;
      yield message;
    }
  }
}

export const mockAgent = new MockAgent();
