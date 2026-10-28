import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connection_limit', '1');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function main() {
  const killed = await prisma.$queryRawUnsafe(`
    SELECT pg_terminate_backend(pid) AS killed, pid, state,
           EXTRACT(EPOCH FROM (now()-state_change))::int AS idle_secs
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state = 'idle'
      AND state_change < now() - interval '90 seconds'
  `);
  console.log('terminated', killed.length);
  const after = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE state='active')::int AS active,
           COUNT(*) FILTER (WHERE state='idle')::int AS idle
    FROM pg_stat_activity WHERE datname = current_database()
  `);
  console.log('after', after);
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
