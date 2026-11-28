import type { Context } from 'koa';
import type { BaseEvent } from '@ag-ui/core';

/** 将 Koa 响应切到 SSE 模式，返回写事件与结束的辅助函数 */
export function openSse(ctx: Context): {
  writeEvent: (event: BaseEvent) => void;
  end: () => void;
  isClosed: () => boolean;
} {
  ctx.status = 200;
  ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
  ctx.set('Cache-Control', 'no-cache, no-transform');
  ctx.set('Connection', 'keep-alive');
  ctx.set('X-Accel-Buffering', 'no');
  ctx.respond = false;

  const res = ctx.res;
  res.flushHeaders?.();

  let closed = false;
  const markClosed = () => {
    closed = true;
  };
  ctx.req.on('close', markClosed);
  res.on('close', markClosed);

  return {
    writeEvent(event: BaseEvent) {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end() {
      if (closed || res.writableEnded) return;
      closed = true;
      res.end();
    },
    isClosed: () => closed || res.writableEnded,
  };
}
