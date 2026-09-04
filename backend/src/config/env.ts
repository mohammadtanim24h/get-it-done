import dotenv from 'dotenv';

dotenv.config();

const NODE_ENVS = ['development', 'test', 'production'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

const parseNodeEnv = (value: string | undefined): NodeEnv => {
  const nodeEnv = (value ?? 'development') as NodeEnv;
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error(
      `Invalid environment variable NODE_ENV="${value}". Expected one of: ${NODE_ENVS.join(', ')}.`,
    );
  }
  return nodeEnv;
};

const parsePort = (value: string | undefined): number => {
  if (value === undefined || value === '') return 4000;
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid environment variable PORT="${value}". Expected an integer between 1 and 65535.`);
  }
  return port;
};

const parseCorsOrigin = (value: string | undefined): string[] => {
  const raw = value ?? 'http://localhost:3000';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
const isTest = nodeEnv === 'test';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!isTest && databaseUrl === '') {
  throw new Error(
    'Required environment variable DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure it.',
  );
}

const parseJwtSecret = (value: string | undefined): string => {
  if (value !== undefined && value !== '') return value;
  if (isTest) return 'test-jwt-secret';
  throw new Error(
    'Required environment variable JWT_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
};

export const env = {
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  isTest,
  port: parsePort(process.env.PORT),
  apiPrefix: process.env.API_PREFIX ?? '/api',
  corsOrigins: parseCorsOrigin(process.env.CORS_ORIGIN),
  databaseUrl,
  jwtSecret: parseJwtSecret(process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  jwtCookieName: process.env.JWT_COOKIE_NAME ?? 'access_token',
} as const;
