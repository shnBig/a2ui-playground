import Koa from 'koa';

const app = new Koa();

app.use((ctx) => {
  ctx.body = 'A2UI Playground Server';
});

app.listen(3000, () => {
  console.log('A2UI Playground Server listening on http://localhost:3000');
});
