import dotenv from 'dotenv';

dotenv.config();

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: parsePort(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
} as const;
