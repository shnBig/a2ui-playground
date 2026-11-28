import type { Context } from 'koa';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { a2uiCustomEvent, runError, runFinished, runStarted } from '../agui/events.js';
import { openSse } from '../agui/sse.js';
import type { Agent } from '../agent/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readUserText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!isRecord(msg) || msg.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
  }
  return undefined;
}

function parseRunInput(body: unknown):
  | { ok: true; input: Pick<RunAgentInput, 'threadId' | 'runId' | 'messages'>; userText: string }
  | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'body must be a JSON object' };
  const { threadId, runId, messages } = body;
  if (typeof threadId !== 'string' || threadId.length === 0) {
    return { ok: false, error: 'threadId is required' };
  }
  if (typeof runId !== 'string' || runId.length === 0) {
    return { ok: false, error: 'runId is required' };
  }
  if (!Array.isArray(messages)) {
    return { ok: false, error: 'messages must be an array' };
  }
  const userText = readUserText(messages);
  if (userText === undefined) {
    return { ok: false, error: 'messages must include a user message with string content' };
  }
  return {
    ok: true,
    input: {
      threadId,
      runId,
      messages: messages as RunAgentInput['messages'],
    },
    userText,
  };
}

/**
 * query `sse`：是否使用 SSE。
 * - 缺省 / true / 1 / on → SSE（默认）
 * - false / 0 / off → 一次性 JSON：`{ events: BaseEvent[] }`
 */
function wantsSse(ctx: Context): boolean {
  const raw = ctx.query.sse;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === '') return true;
  const normalized = String(value).trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'off');
}

async function collectAgentEvents(
  agent: Agent,
  args: {
    threadId: string;
    runId: string;
    userText: string;
    signal?: AbortSignal;
  },
): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [runStarted(args.threadId, args.runId)];
  try {
    for await (const message of agent.run({
      threadId: args.threadId,
      runId: args.runId,
      userText: args.userText,
      signal: args.signal,
    })) {
      events.push(a2uiCustomEvent(message));
    }
    events.push(runFinished(args.threadId, args.runId));
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return events;
    }
    const message = err instanceof Error ? err.message : String(err);
    events.push(runError(message, 'AGENT_ERROR'));
  }
  return events;
}

/** POST /agent：AG-UI RunAgentInput → SSE 或 JSON（?sse=false） */
export function createAgentHandler(agent: Agent) {
  return async (ctx: Context) => {
    const parsed = parseRunInput(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { error: parsed.error };
      return;
    }

    const { threadId, runId } = parsed.input;
    const useSse = wantsSse(ctx);

    if (!useSse) {
      const events = await collectAgentEvents(agent, {
        threadId,
        runId,
        userText: parsed.userText,
      });
      ctx.status = 200;
      ctx.body = { sse: false, events };
      return;
    }

    const sse = openSse(ctx);
    const ac = new AbortController();
    const onClose = () => ac.abort();
    ctx.req.on('close', onClose);

    try {
      sse.writeEvent(runStarted(threadId, runId));

      for await (const message of agent.run({
        threadId,
        runId,
        userText: parsed.userText,
        signal: ac.signal,
      })) {
        if (sse.isClosed()) break;
        sse.writeEvent(a2uiCustomEvent(message));
      }

      if (!sse.isClosed()) {
        sse.writeEvent(runFinished(threadId, runId));
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        // 客户端断开，不再写事件
      } else if (!sse.isClosed()) {
        const message = err instanceof Error ? err.message : String(err);
        sse.writeEvent(runError(message, 'AGENT_ERROR'));
      }
    } finally {
      ctx.req.off('close', onClose);
      sse.end();
    }
  };
}
