import { PrismaClient } from '@prisma/client';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connection_limit', '1');
url.searchParams.set('statement_timeout', '120000');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function main() {
  // Nuke all other sessions for this DB/user so DDL can proceed.
  for (let round = 1; round <= 3; round++) {
    const killed = await prisma.$queryRawUnsafe(`
      SELECT pg_terminate_backend(pid) AS killed, pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND usename = current_user
    `);
    console.log(`round ${round} terminated`, killed.length);
    await new Promise((r) => setTimeout(r, 1000));
  }

  await prisma.$executeRawUnsafe(`SET lock_timeout = '15s'`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public.promo_codes
    ADD COLUMN IF NOT EXISTS "showOnHome" BOOLEAN NOT NULL DEFAULT true
  `);
  console.log('promo_codes.showOnHome ensured');

  const after = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) FILTER (WHERE state='active')::int AS active,
           COUNT(*)::int AS total
    FROM pg_stat_activity WHERE datname = current_database()
  `);
  console.log('after', after);
}

main()
  .catch((e) => {
    console.error('FAIL', e?.meta?.message || e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
