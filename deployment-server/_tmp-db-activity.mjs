import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connection_limit', '1');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function main() {
  const activity = await prisma.$queryRawUnsafe(`
    SELECT state, wait_event_type, wait_event, COUNT(*)::int AS n
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY 1, 2, 3
    ORDER BY n DESC
  `);
  const top = await prisma.$queryRawUnsafe(`
    SELECT pid, state, wait_event_type, wait_event,
           left(query, 140) AS q,
           EXTRACT(EPOCH FROM (now() - query_start))::int AS secs
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
    ORDER BY query_start NULLS LAST
    LIMIT 20
  `);
  const settings = await prisma.$queryRawUnsafe(`
    SELECT name, setting FROM pg_settings
    WHERE name IN ('max_connections', 'superuser_reserved_connections')
  `);
  console.log(JSON.stringify({ activity, top, settings }, null, 2));
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
