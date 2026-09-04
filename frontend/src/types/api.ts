// Wire-level API shapes (request envelopes and error bodies).

export type ApiErrorCode =
  | 'INTERNAL_ERROR'
  | 'ROUTE_NOT_FOUND'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Success responses are always `{ "data": ... }`; deletes return 204 with no body. */
export interface ApiEnvelope<T> {
  data: T;
}

/** `details` payload for 400 VALIDATION_ERROR responses. */
export interface ValidationErrorDetails {
  fields: Record<string, string[]>;
}
