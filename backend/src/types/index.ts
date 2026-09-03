// Shared type definitions for the API layer.

/** Machine-readable error codes used across the API. */
export type ErrorCode =
  | 'INTERNAL_ERROR'
  | 'ROUTE_NOT_FOUND'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE';

/** Success responses: { "data": ... } */
export type ApiSuccessBody<T> = {
  data: T;
};

/** Error responses: { "error": { "code", "message", "details"? } } */
export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export type HealthStatus = {
  status: 'ok' | 'degraded';
  database: 'connected' | 'disconnected';
  uptime: number;
  timestamp: string;
  environment: string;
};
