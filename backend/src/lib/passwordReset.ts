import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { sendPasswordResetEmail } from '../integrations/emailAdapter';
import { config } from '../config';
import { revokeUserSessions } from './userSession';

const GENERIC = 'If an account exists for that email, a reset link has been sent.';
const RESET_MINUTES = 30;

let ready = false;

export async function ensurePasswordResetSchema(): Promise<void> {
  if (ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" TEXT NOT NULL,
      "subjectType" TEXT NOT NULL,
      "subjectId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "password_reset_tokens_hash_idx"
    ON "password_reset_tokens" ("tokenHash")
  `);
  ready = true;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function passwordResetGenericMessage(): string {
  return GENERIC;
}

export async function requestPasswordReset(email: string, kind: 'user' | 'admin'): Promise<void> {
  await ensurePasswordResetSchema();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  if (kind === 'user') {
    const user = await prisma.user.findFirst({
      where: { email: normalized, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user?.email) return;
    await sendReset('user', user.id, user.email, '/reset-password');
    return;
  }

  const admin = await prisma.adminUser.findFirst({
    where: { email: normalized, isActive: true },
    include: { role: true },
  });
  if (!admin?.email || admin.role?.name === 'DELIVERY_DRIVER') return;
  await sendReset('admin', admin.id, admin.email, '/admin/reset-password');
}

async function sendReset(subjectType: 'user' | 'admin', subjectId: string, email: string, path: string) {
  await prisma.$executeRaw`
    UPDATE "password_reset_tokens"
    SET "usedAt" = CURRENT_TIMESTAMP
    WHERE "subjectType" = ${subjectType} AND "subjectId" = ${subjectId} AND "usedAt" IS NULL
  `;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
  await prisma.$executeRaw`
    INSERT INTO "password_reset_tokens" ("id", "subjectType", "subjectId", "tokenHash", "expiresAt")
    VALUES (${randomBytes(16).toString('hex')}, ${subjectType}, ${subjectId}, ${hashToken(token)}, ${expiresAt})
  `;
  const link = `${config.frontendUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(email, link);
}

export async function completePasswordReset(
  token: string,
  password: string,
  kind: 'user' | 'admin',
): Promise<void> {
  await ensurePasswordResetSchema();
  if (password.length < 8) throw new AppError('Password must be at least 8 characters', 400);
  const rows = await prisma.$queryRaw<Array<{ id: string; subjectId: string; expiresAt: Date; usedAt: Date | null }>>`
    SELECT "id", "subjectId", "expiresAt", "usedAt"
    FROM "password_reset_tokens"
    WHERE "tokenHash" = ${hashToken(token)} AND "subjectType" = ${kind}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new AppError('This reset link is invalid or has expired', 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const consumed = await prisma.$executeRaw`
    UPDATE "password_reset_tokens"
    SET "usedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id} AND "usedAt" IS NULL
  `;
  if (Number(consumed) !== 1) throw new AppError('This reset link is invalid or has expired', 400);

  if (kind === 'user') {
    await prisma.user.update({ where: { id: row.subjectId }, data: { passwordHash } });
    await revokeUserSessions(row.subjectId);
    return;
  }

  await prisma.adminUser.update({
    where: { id: row.subjectId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
}
