import { afterEach, describe, expect, it, vi } from 'vitest';
import { authService } from './auth';

const ada = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function mockFetchWithUser(user: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: { user } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authService', () => {
  it('login posts credentials and returns the user', async () => {
    const fetchMock = mockFetchWithUser(ada);

    await expect(
      authService.login({ email: 'ada@example.com', password: 'password123' }),
    ).resolves.toEqual(ada);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'ada@example.com',
      password: 'password123',
    });
  });

  it('register posts to /auth/register and returns the created user', async () => {
    const fetchMock = mockFetchWithUser(ada, 201);

    await expect(
      authService.register({ name: 'Ada', email: 'ada@example.com', password: 'password123' }),
    ).resolves.toEqual(ada);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/auth/register');
  });

  it('me unwraps the /auth/me envelope', async () => {
    mockFetchWithUser(ada);

    await expect(authService.me()).resolves.toEqual(ada);
  });
});
