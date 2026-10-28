import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { signRefreshToken, signToken } from '../middleware/auth';

let ready = false;

export async function ensureUserSessionSchema(): Promise<void> {
  if (ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "refresh_token_families" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "currentJtiHash" TEXT NOT NULL,
      "revokedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "refresh_token_families_userId_idx"
    ON "refresh_token_families" ("userId")
  `);
  ready = true;
}

function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

export async function readUserTokenVersion(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ tokenVersion: number }>>`
    SELECT "tokenVersion" FROM "users" WHERE "id" = ${userId}
  `;
  return Number(rows[0]?.tokenVersion ?? 0);
}

export async function issueCustomerTokens(userId: string): Promise<{ token: string; refreshToken: string }> {
  await ensureUserSessionSchema();
  const tv = await readUserTokenVersion(userId);
  const familyId = randomUUID();
  const jti = randomBytes(16).toString('hex');
  await prisma.$executeRaw`
    INSERT INTO "refresh_token_families" ("id", "userId", "currentJtiHash")
    VALUES (${familyId}, ${userId}, ${hashJti(jti)})
  `;
  return {
    token: signToken(userId, 'user', undefined, undefined, tv),
    refreshToken: signRefreshToken(userId, tv, jti, familyId),
  };
}

export async function rotateCustomerRefresh(payload: {
  sub: string;
  tv?: number;
  jti?: string;
  fam?: string;
}): Promise<{ token: string; refreshToken: string }> {
  await ensureUserSessionSchema();
  const tv = await readUserTokenVersion(payload.sub);
  if ((payload.tv ?? 0) !== tv) throw new AppError('Invalid token', 401);

  if (!payload.jti || !payload.fam) {
    return issueCustomerTokens(payload.sub);
  }

  const rows = await prisma.$queryRaw<Array<{ currentJtiHash: string; revokedAt: Date | null }>>`
    SELECT "currentJtiHash", "revokedAt" FROM "refresh_token_families" WHERE "id" = ${payload.fam}
  `;
  const family = rows[0];
  if (!family || family.revokedAt) throw new AppError('Invalid token', 401);
  if (family.currentJtiHash !== hashJti(payload.jti)) {
    await prisma.$executeRaw`
      UPDATE "refresh_token_families" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "id" = ${payload.fam}
    `;
    throw new AppError('Invalid token', 401);
  }

  const jti = randomBytes(16).toString('hex');
  await prisma.$executeRaw`
    UPDATE "refresh_token_families" SET "currentJtiHash" = ${hashJti(jti)} WHERE "id" = ${payload.fam}
  `;
  return {
    token: signToken(payload.sub, 'user', undefined, undefined, tv),
    refreshToken: signRefreshToken(payload.sub, tv, jti, payload.fam),
  };
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await ensureUserSessionSchema();
  await prisma.$executeRaw`
    UPDATE "users" SET "tokenVersion" = "tokenVersion" + 1 WHERE "id" = ${userId}
  `;
  await prisma.$executeRaw`
    UPDATE "refresh_token_families"
    SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId} AND "revokedAt" IS NULL
  `;
}
