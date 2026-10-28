import { prisma } from './prisma';

let fcmTokenSchemaReady = false;

export async function ensureFcmTokenTable(): Promise<void> {
  if (fcmTokenSchemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "customer_fcm_tokens" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "customer_fcm_tokens_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "customer_fcm_tokens_userId_idx" ON "customer_fcm_tokens"("userId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "customer_fcm_tokens_token_key" ON "customer_fcm_tokens"("token")`,
  );

  fcmTokenSchemaReady = true;
}
