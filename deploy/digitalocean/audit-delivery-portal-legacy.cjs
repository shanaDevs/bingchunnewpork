/**
 * Same checks as audit-delivery-portal-readonly.cjs but uses backend/.env DATABASE_URL
 * (CapRover / legacy host) for comparison. Read-only.
 */
const fs = require('fs');
const path = require('path');

const backendEnv = path.join(__dirname, '../../backend/.env');

function loadBackendDatabaseUrl() {
  const text = fs.readFileSync(backendEnv, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (!m) continue;
    let url = m[1].trim();
    if (
      (url.startsWith('"') && url.endsWith('"')) ||
      (url.startsWith("'") && url.endsWith("'"))
    ) {
      url = url.slice(1, -1);
    }
    return url;
  }
  throw new Error('DATABASE_URL not found in backend/.env');
}

process.env.DATABASE_URL = loadBackendDatabaseUrl();

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

const sections = {};

async function section(name, sql) {
  try {
    sections[name] = await prisma.$queryRawUnsafe(sql);
  } catch (err) {
    sections[name] = { error: err.message, code: err.code };
  }
}

async function run() {
  await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);

  sections.ping = await prisma.$queryRawUnsafe(
    `SELECT current_database() AS db, current_user AS usr`,
  );

  await section(
    'namespaceCheck',
    `SELECT nspname FROM pg_namespace WHERE nspname IN ('public', 'delivery') ORDER BY nspname`,
  );
  await section(
    'publicTableCount',
    `SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  await section(
    'deliveryTableCount',
    `SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'delivery' AND table_type = 'BASE TABLE'`,
  );
  await section(
    'deliveryRoles',
    `
    SELECT r.name, COUNT(u.id)::int AS users
    FROM public.roles r
    LEFT JOIN public.admin_users u ON u."roleId" = r.id AND u."isActive" = true
    WHERE r.name IN ('DELIVERY_ADMIN', 'DELIVERY_DRIVER')
    GROUP BY r.name ORDER BY r.name
  `,
  );
  await section(
    'riderProfiles',
    `SELECT COUNT(*)::int AS rider_profiles FROM delivery.rider_profiles`,
  );
  await section(
    'jobsByStatus',
    `SELECT status::text AS status, COUNT(*)::int AS count FROM delivery.delivery_jobs GROUP BY status ORDER BY status`,
  );
  await section(
    'deliveryOrders',
    `SELECT COUNT(*)::int AS delivery_orders FROM public.orders WHERE "orderMode" = 'DELIVERY'`,
  );

  const host = new URL(process.env.DATABASE_URL).hostname;
  console.log(
    JSON.stringify({ source: 'backend/.env', connected: true, host, sections }, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  );
}

run()
  .catch((err) => {
    console.error(JSON.stringify({ connected: false, error: err.message }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
