import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] API listening on http://localhost:${env.port}${env.apiPrefix}`);
});

const shutdown = (signal: string): void => {
  console.log(`\n[${signal}] shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Shutdown complete.');
    process.exit(0);
  });
  // If connections refuse to drain, force-exit after a timeout.
  setTimeout(() => {
    console.error('Forced shutdown after timeout waiting for connections to close.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : String(reason));
});

export default server;
