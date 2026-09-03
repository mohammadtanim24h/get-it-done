import { env } from '../config/env';
import type { HealthStatus } from '../types';

export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  };
}
