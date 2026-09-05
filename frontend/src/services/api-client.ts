import { apiUrl } from '@/lib/config';
import type { ApiErrorBody, ApiErrorCode } from '@/types/api';

export type ApiClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';

/**
 * Error thrown by the API client for every failed request. UI code should
 * catch this and read `message` (user-displayable), `code`, `fieldErrors`,
 * and `isUnauthorized`.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiClientErrorCode = 'UNKNOWN',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Per-field validation messages from 400 VALIDATION_ERROR responses, if any. */
  get fieldErrors(): Record<string, string[]> | null {
    if (
      this.code === 'VALIDATION_ERROR' &&
      this.details !== null &&
      typeof this.details === 'object' &&
      'fields' in (this.details as Record<string, unknown>)
    ) {
      return (this.details as { fields: Record<string, string[]> }).fields;
    }
    return null;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/** Pages that handle 401s inline (credential failures, anonymous session probes). */
const AUTH_PATHS = new Set(['/login', '/register']);

/**
 * A 401 outside the auth pages means the session cookie expired or was
 * revoked mid-session. Send the user to the login page (a full navigation
 * also drops all in-memory client state). Login/register pages are exempt
 * so a bad password doesn't bounce the user off the form.
 */
function handleStaleSession() {
  if (typeof window === 'undefined') return;
  if (AUTH_PATHS.has(window.location.pathname)) return;
  window.location.assign('/login');
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...rest,
      // Auth uses an httpOnly cookie set by the backend on login; every
      // request must send it. Centralized here so callers never think about it.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiClientError(
      'Unable to reach the server. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    if (res.status === 401) handleStaleSession();
    let message = `Request failed with status ${res.status}`;
    let code: ApiClientErrorCode = 'UNKNOWN';
    let details: unknown;
    try {
      const data = (await res.json()) as Partial<ApiErrorBody>;
      if (data.error) {
        if (data.error.message) message = data.error.message;
        if (data.error.code) code = data.error.code;
        details = data.error.details;
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiClientError(message, res.status, code, details);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiClientError('Received an invalid response from the server.', res.status);
  }
}

/**
 * Centralized API client. Services unwrap the `{ data }` envelope:
 *   const { data } = await apiClient.get<ApiEnvelope<{ user: User }>>('/auth/me');
 */
export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
