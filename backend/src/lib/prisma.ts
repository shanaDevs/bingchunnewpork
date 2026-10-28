import {
  prisma as sharedPrisma,
  connectDb as sharedConnectDb,
  disconnectDb as sharedDisconnectDb,
  getPrismaFanOutLimit,
  getPrismaPoolLimit,
  Prisma,
  PrismaClient,
} from '@bingchun/db';

/**
 * Local bindings (not re-export) so Vitest can `vi.mock('../../src/lib/prisma')`
 * and replace `prisma` for backend modules that import this file.
 */
export const prisma = sharedPrisma;
export const connectDb = sharedConnectDb;
export const disconnectDb = sharedDisconnectDb;
export { Prisma, PrismaClient, getPrismaFanOutLimit, getPrismaPoolLimit };
