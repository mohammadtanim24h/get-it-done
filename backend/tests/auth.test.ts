import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { createApp } from '../src/app';

const mockedFindUnique = vi.mocked(prisma.user.findUnique);
const mockedCreate = vi.mocked(prisma.user.create);

// Read the runtime config: a developer's backend/.env may set JWT_SECRET /
// JWT_COOKIE_NAME, which dotenv loads and which take precedence over the
// test defaults in config/env.ts. Signing with the app's actual secret and
// cookie name keeps these tests environment-independent.
const TEST_JWT_SECRET = env.jwtSecret;
const COOKIE_NAME = env.jwtCookieName;
const PASSWORD_HASH = '$2b$04$tqBZXpqifkTZLJ2tlkx3R.8rLj7ZYmcif3yRRk2HVb..zkliJiqpu';

const dbUser = {
  id: 'user-1',
  name: 'John Doe',
  email: 'john@example.com',
  passwordHash: PASSWORD_HASH,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** Sign a valid token the way the app does. */
const signValidToken = (user: { id: string; email: string }): string =>
  jwt.sign({ email: user.email }, TEST_JWT_SECRET, { subject: user.id, expiresIn: '1h' });

beforeEach(() => {
  mockedFindUnique.mockReset();
  mockedCreate.mockReset();
});

describe('POST /api/auth/register', () => {
  it('creates a user with a hashed password and returns 201 without passwordHash', async () => {
    mockedCreate.mockImplementation(async ({ data }: { data: { name: string; email: string; passwordHash: string } }) => ({
      id: 'user-1',
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: 'John Doe', email: 'John@Example.com ', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    // Email normalized; password stored as a bcrypt hash, not plaintext.
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const storedHash = mockedCreate.mock.calls[0]![0].data.passwordHash;
    expect(storedHash).not.toBe('password123');
    expect(storedHash.startsWith('$2')).toBe(true);
  });

  it('returns 409 when the email is already registered', async () => {
    mockedCreate.mockRejectedValue({ code: 'P2002' });

    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: 'John Doe', email: 'john@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 VALIDATION_ERROR with field details for invalid input', async () => {
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields.name).toBeInstanceOf(Array);
    expect(res.body.error.details.fields.email).toBeInstanceOf(Array);
    expect(res.body.error.details.fields.password).toBeInstanceOf(Array);
  });
});

describe('POST /api/auth/login', () => {
  it('sets an httpOnly auth cookie and returns the user', async () => {
    mockedFindUnique.mockResolvedValue(dbUser);

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'john@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe('user-1');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const setCookie = res.headers['set-cookie']![0] as string;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
  });

  it('returns the same generic 401 for unknown email and wrong password (no enumeration)', async () => {
    mockedFindUnique.mockResolvedValue(null); // unknown email
    const unknown = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    mockedFindUnique.mockResolvedValue(dbUser); // wrong password
    const wrongPw = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'john@example.com', password: 'wrongpassword' });

    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(unknown.body).toEqual(wrongPw.body);
    expect(unknown.body.error.code).toBe('UNAUTHORIZED');
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user for a valid token cookie', async () => {
    mockedFindUnique.mockResolvedValue(dbUser);
    const token = signValidToken({ id: 'user-1', email: 'john@example.com' });

    const res = await request(createApp())
      .get('/api/auth/me')
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a missing token with 401', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid (bad signature) token with 401', async () => {
    const token = jwt.sign({ email: 'john@example.com' }, 'wrong-secret', {
      subject: 'user-1',
      expiresIn: '1h',
    });
    const res = await request(createApp())
      .get('/api/auth/me')
      .set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an expired token with 401', async () => {
    const token = jwt.sign(
      { email: 'john@example.com', exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_JWT_SECRET,
      { subject: 'user-1' },
    );
    const res = await request(createApp())
      .get('/api/auth/me')
      .set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie and returns 204 without requiring auth', async () => {
    const res = await request(createApp()).post('/api/auth/logout');

    expect(res.status).toBe(204);
    const setCookie = (res.headers['set-cookie'] ?? []).join(';').toLowerCase();
    expect(setCookie).toContain(`${COOKIE_NAME.toLowerCase()}=;`);
    // The cookie is expired into the past so the browser discards it.
    expect(setCookie).toContain('expires=thu, 01 jan 1970');
  });
});
