import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Use DATABASE_URL (pooler/transaction mode) for runtime, DIRECT_URL for migrations
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL!;
  // Use single client connection instead of pool to avoid "max connections" on serverless
  const pool = new pg.Pool({
    connectionString,
    max: 1, // Single connection
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
