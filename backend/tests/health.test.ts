import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

import { prisma } from '../src/lib/prisma';
import { createApp } from '../src/app';

const mockedQueryRaw = vi.mocked(prisma.$queryRaw);

describe('GET /health', () => {
  beforeEach(() => {
    mockedQueryRaw.mockReset();
  });

  it('returns ok with service metadata when the database is reachable', async () => {
    mockedQueryRaw.mockResolvedValue([]);
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data).toHaveProperty('uptime');
    expect(res.body.data).toHaveProperty('timestamp');
  });

  it('returns 503 when the database is unreachable', async () => {
    mockedQueryRaw.mockRejectedValue(new Error('connection refused'));
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database).toBe('disconnected');
  });
});

describe('unknown routes', () => {
  it('returns a consistent 404 error shape', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.error.message).toContain('/api/does-not-exist');
  });
});

describe('malformed request bodies', () => {
  it('returns a 400 INVALID_JSON error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
