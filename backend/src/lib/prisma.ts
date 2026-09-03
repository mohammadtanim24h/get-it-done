import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env';

const createPrismaClient = (): PrismaClient => {
  const adapter = new PrismaPg({ connectionString: env.databaseUrl });
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
