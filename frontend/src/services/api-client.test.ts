import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiClient } from './api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function catchClientError<T>(promise: Promise<T>): Promise<ApiClientError> {
  return promise.catch((err: ApiClientError) => err) as Promise<ApiClientError>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWindowLocation(pathname: string) {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname, assign } });
  return assign;
}

describe('apiClient request', () => {
  it('sends credentials with every request and parses JSON bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.get<{ data: { ok: boolean } }>('/boards');

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/boards',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('serializes request bodies and sets JSON headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const body = { name: 'Ada', email: 'ada@example.com', password: 'password123' };
    await apiClient.post('/auth/register', body);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/auth/register');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(init.body).toBe(JSON.stringify(body));
  });

  it('returns undefined for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiClient.delete('/boards/b1')).resolves.toBeUndefined();
  });
});

describe('apiClient error handling', () => {
  it('parses error bodies into ApiClientError with code, status, and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401),
      ),
    );

    const err = await catchClientError(apiClient.get('/auth/me'));

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Authentication required');
    expect(err.isUnauthorized).toBe(true);
  });

  it('exposes field errors for validation failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: { fields: { email: ['Invalid email'] } },
            },
          },
          400,
        ),
      ),
    );

    const err = await catchClientError(apiClient.post('/auth/login', {}));

    expect(err.fieldErrors).toEqual({ email: ['Invalid email'] });
  });

  it('falls back to a generic message for non-JSON error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway', { status: 502 })));

    const err = await catchClientError(apiClient.get('/boards'));

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toContain('502');
    expect(err.fieldErrors).toBeNull();
  });

  it('throws a NETWORK_ERROR when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const err = await catchClientError(apiClient.get('/boards'));

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.status).toBe(0);
    expect(err.isUnauthorized).toBe(false);
  });
});

describe('stale session handling', () => {
  it('redirects to /login on a 401 outside the auth pages', async () => {
    const assign = stubWindowLocation('/boards');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Unauthorized' } }, 401)),
    );

    await catchClientError(apiClient.get('/boards'));

    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not redirect on a 401 while already on /login', async () => {
    const assign = stubWindowLocation('/login');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Invalid credentials' } }, 401)),
    );

    await catchClientError(apiClient.post('/auth/login', {}));

    expect(assign).not.toHaveBeenCalled();
  });
});
