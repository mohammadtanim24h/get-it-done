import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import type { HealthStatus } from '../types';

/**
 * Returns application availability. The database is pinged so the caller can
 * distinguish an alive API from a broken dependency. Returns `degraded` (never
 * throws) when the database is unreachable, so the endpoint can respond 503.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  let database: HealthStatus['database'] = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch (error) {
    console.error('[health] database check failed:', error instanceof Error ? error.message : String(error));
  }

  return {
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  };
}
