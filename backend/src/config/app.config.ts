import { env } from './env';

export const appConfig = {
  name: 'get-it-done-api',
  version: '0.1.0',
  apiPrefix: env.apiPrefix,
} as const;
