import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

const globalPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };
export const prisma = globalPrisma.prisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX, connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS }),
});
if (env.NODE_ENV !== 'production') globalPrisma.prisma = prisma;

export const databaseHealth = { check: () => prisma.$queryRaw`SELECT 1` };
