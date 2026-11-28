import type { A2uiMessage } from '../agui/events.js';

export interface AgentRunInput {
  threadId: string;
  runId: string;
  /** 最近一条用户文本 */
  userText: string;
  /** 请求中止时停止产出 */
  signal?: AbortSignal;
}

/** Agent：把用户输入变成流式 A2UI v0.8 消息；mock / 真 agent 共用此接口 */
export interface Agent {
  run(input: AgentRunInput): AsyncIterable<A2uiMessage>;
}
