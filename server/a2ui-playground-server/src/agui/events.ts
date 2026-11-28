import { EventType } from '@ag-ui/core';
import type {
  CustomEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
} from '@ag-ui/core';

/** 一条 A2UI v0.8 server→client 消息（顶层恰好一个 action key） */
export type A2uiMessage = Record<string, unknown>;

export function runStarted(threadId: string, runId: string): RunStartedEvent {
  return {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  };
}

export function runFinished(threadId: string, runId: string): RunFinishedEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    timestamp: Date.now(),
  };
}

export function runError(message: string, code?: string): RunErrorEvent {
  return {
    type: EventType.RUN_ERROR,
    message,
    code,
    timestamp: Date.now(),
  };
}

/** 用 AG-UI CUSTOM 事件承载一条 A2UI v0.8 消息，便于逐条流式下发 */
export function a2uiCustomEvent(value: A2uiMessage): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: 'a2ui',
    value,
    timestamp: Date.now(),
  };
}
