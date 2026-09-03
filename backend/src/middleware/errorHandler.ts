import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next: NextFunction) => {
  const status = err.status ?? 500;
  const message =
    env.isProduction && status >= 500 ? 'Internal server error' : err.message;

  if (!env.isTest) {
    console.error(`[error] ${err.message}`);
  }

  res.status(status).json({
    success: false,
    error: { message },
  });
};
