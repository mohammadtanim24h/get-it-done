import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] API listening on http://localhost:${env.port}${env.apiPrefix}`);
});

export default server;
