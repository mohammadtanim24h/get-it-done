import express, { type Application } from 'express';
import cors from 'cors';
import { env } from './config/env';
import apiRouter from './routes';
import healthRouter from './routes/health.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/', healthRouter);
  app.use(env.apiPrefix, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
