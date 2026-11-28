import Koa from 'koa';
import cors from '@koa/cors';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { mockAgent } from './agent/mockAgent.js';
import { createAgentHandler } from './routes/agent.js';

const PORT = Number(process.env.PORT ?? 3100);

const app = new Koa();
const router = new Router();

app.use(
  cors({
    origin: (ctx) => ctx.get('Origin') || '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept'],
  }),
);
app.use(bodyParser());

router.get('/health', (ctx) => {
  ctx.body = { ok: true, service: '@a2ui/playground-server' };
});

router.post('/agent', createAgentHandler(mockAgent));

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(PORT, () => {
  console.log(`@a2ui/playground-server listening on http://localhost:${PORT}`);
  console.log(`  POST /agent           (AG-UI RunAgentInput → SSE，默认)`);
  console.log(`  POST /agent?sse=false (同上，一次性 JSON { events })`);
  console.log(`  GET  /health`);
});
