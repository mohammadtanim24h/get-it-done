import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/appError';
import type { ApiErrorBody, ErrorCode } from '../types';

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

interface PrismaRequestError extends Error {
  code?: string;
  meta?: unknown;
}

const isPrismaError = (err: Error): err is PrismaRequestError =>
  typeof (err as PrismaRequestError).code === 'string' && /^P\d{4}$/.test((err as PrismaRequestError).code ?? '');

const mapPrismaError = (err: PrismaRequestError): { statusCode: number; code: ErrorCode; message: string } => {
  switch (err.code) {
    case 'P2002':
      return { statusCode: 409, code: 'CONFLICT', message: 'A record with these values already exists' };
    case 'P2025':
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found' };
    default:
      return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let errorCode: ErrorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof AppError) {
    ({ statusCode, code: errorCode, message, details } = err);
  } else if (err instanceof SyntaxError && 'body' in err) {
    // Malformed JSON request body rejected by express.json().
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if ((err as BodyParserError).status === 413 || (err as BodyParserError).type === 'entity.too.large') {
    statusCode = 413;
    errorCode = 'PAYLOAD_TOO_LARGE';
    message = 'Request body exceeds the allowed size limit';
  } else if (err instanceof Error && isPrismaError(err)) {
    const mapped = mapPrismaError(err);
    ({ statusCode, code: errorCode, message } = mapped);
    if (statusCode >= 500 && env.isProduction) message = 'Internal server error';
  } else if (!(err instanceof AppError)) {
    // Unexpected errors: never leak details in production.
    message = env.isProduction ? 'Internal server error' : err instanceof Error ? err.message : 'Internal server error';
  }

  if (!env.isTest) {
    console.error(`[error] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }

  const body: ApiErrorBody = { error: { code: errorCode, message } };
  if (details !== undefined) body.error.details = details;

  res.status(statusCode).json(body);
};
