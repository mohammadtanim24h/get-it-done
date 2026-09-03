import type { RequestHandler } from 'express';
import { env } from '../config/env';

/**
 * Minimal request logger for development: method, path, status and duration.
 * Disabled in test environments to keep test output clean.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (env.isTest) {
    next();
    return;
  }

  const start = performance.now();
  res.on('finish', () => {
    const duration = (performance.now() - start).toFixed(1);
    console.log(`[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
};
