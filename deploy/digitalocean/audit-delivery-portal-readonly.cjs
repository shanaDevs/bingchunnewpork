/**
 * Read-only delivery portal audit against DO Postgres (uses @bingchun/db Prisma client).
 * Loads DATABASE_URL from deploy/digitalocean/secrets.env and uses the public host
 * (strip the `private-` prefix from the hostname).
 *
 * Note: secrets.env uses user `bingchun_app`. App Platform injects `${pg.DATABASE_URL}`
 * (doadmin) for migrations/runtime. If you see permission denied, re-run with doadmin
 * from the DO database Connection details, or set AUDIT_DATABASE_URL for this process.
 */
const fs = require('fs');
const path = require('path');

const secretsPath = path.join(__dirname, 'secrets.env');
const doadminUrlPath = path.join(__dirname, 'audit-doadmin.url');

function loadPublicDatabaseUrl() {
  if (process.env.AUDIT_DATABASE_URL) {
    return process.env.AUDIT_DATABASE_URL;
  }
  if (fs.existsSync(doadminUrlPath)) {
    const line = fs
      .readFileSync(doadminUrlPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (line) {
      const parsed = new URL(line);
      if (parsed.hostname.startsWith('private-')) {
        parsed.hostname = parsed.hostname.slice('private-'.length);
      }
      return parsed.toString();
    }
  }
  const text = fs.readFileSync(secretsPath, 'utf8');
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
    const parsed = new URL(url);
    if (parsed.hostname.startsWith('private-')) {
      parsed.hostname = parsed.hostname.slice('private-'.length);
    }
    return parsed.toString();
  }
  throw new Error('DATABASE_URL not found in secrets.env');
}

process.env.DATABASE_URL = loadPublicDatabaseUrl();

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

const sections = {};

async function run() {
  await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);

  async function section(name, sql) {
    try {
      sections[name] = await prisma.$queryRawUnsafe(sql);
    } catch (err) {
      sections[name] = { error: err.message, code: err.code };
    }
  }

  sections.ping = await prisma.$queryRawUnsafe(
    `SELECT current_database() AS db, current_user AS usr`,
  );

  await section(
    'schemas',
    `
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name IN ('public', 'delivery')
    ORDER BY schema_name
  `,
  );

  await section(
    'namespaceCheck',
    `
    SELECT nspname FROM pg_namespace
    WHERE nspname IN ('public', 'delivery')
    ORDER BY nspname
  `,
  );

  await section(
    'publicTableCount',
    `
    SELECT COUNT(*)::int AS tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `,
  );

  await section(
    'deliveryTableCount',
    `
    SELECT COUNT(*)::int AS tables
    FROM information_schema.tables
    WHERE table_schema = 'delivery' AND table_type = 'BASE TABLE'
  `,
  );

  await section(
    'migrations',
    `
    SELECT migration_name, finished_at
    FROM public._prisma_migrations
    ORDER BY finished_at DESC NULLS LAST
    LIMIT 15
  `,
  );

  await section(
    'deliveryRoles',
    `
    SELECT r.name, COUNT(u.id)::int AS users
    FROM public.roles r
    LEFT JOIN public.admin_users u ON u."roleId" = r.id AND u."isActive" = true
    WHERE r.name IN ('DELIVERY_ADMIN', 'DELIVERY_DRIVER')
    GROUP BY r.name
    ORDER BY r.name
  `,
  );

  await section(
    'deliveryUsersSample',
    `
    SELECT r.name AS role, u.id, u.name, u."storeId", u."isActive", u."createdAt"
    FROM public.admin_users u
    JOIN public.roles r ON r.id = u."roleId"
    WHERE r.name IN ('DELIVERY_ADMIN', 'DELIVERY_DRIVER')
    ORDER BY r.name, u."createdAt" DESC
    LIMIT 10
  `,
  );

  await section(
    'riderProfiles',
    `SELECT COUNT(*)::int AS rider_profiles FROM delivery.rider_profiles`,
  );

  await section(
    'riderProfilesOrphan',
    `
    SELECT COUNT(*)::int AS profiles_without_admin
    FROM delivery.rider_profiles rp
    LEFT JOIN public.admin_users u ON u.id = rp."adminUserId"
    WHERE u.id IS NULL
  `,
  );

  await section(
    'jobsByStatus',
    `
    SELECT status::text AS status, COUNT(*)::int AS count
    FROM delivery.delivery_jobs
    GROUP BY status
    ORDER BY status
  `,
  );

  await section(
    'jobOrderLinks',
    `SELECT COUNT(*)::int AS job_order_links FROM delivery.delivery_job_orders`,
  );

  await section(
    'deliveryOrders',
    `
    SELECT COUNT(*)::int AS delivery_orders
    FROM public.orders
    WHERE "orderMode" = 'DELIVERY'
  `,
  );

  await section(
    'storesDelivery',
    `
    SELECT COUNT(*)::int AS stores_with_delivery
    FROM public.stores
    WHERE "deliveryEnabled" = true
  `,
  );

  await section(
    'zones',
    `SELECT COUNT(*)::int AS zones FROM delivery.delivery_zones`,
  );

  await section(
    'payouts',
    `SELECT COUNT(*)::int AS payouts FROM delivery.delivery_payouts`,
  );

  await section(
    'pgClassTableCounts',
    `
    SELECT n.nspname AS schema, COUNT(*)::int AS physical_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'delivery') AND c.relkind = 'r'
    GROUP BY n.nspname
    ORDER BY n.nspname
  `,
  );

  await section(
    'pgStatRowEstimates',
    `
    SELECT schemaname, relname, n_live_tup::bigint AS est_rows
    FROM pg_stat_user_tables
    WHERE schemaname IN ('public', 'delivery')
    ORDER BY n_live_tup DESC
    LIMIT 15
  `,
  );

  await section(
    'pgStatTotals',
    `
    SELECT schemaname, SUM(n_live_tup)::bigint AS est_rows_total
    FROM pg_stat_user_tables
    WHERE schemaname IN ('public', 'delivery')
    GROUP BY schemaname
    ORDER BY schemaname
  `,
  );

  await section(
    'coreStores',
    `SELECT COUNT(*)::int AS stores FROM public.stores`,
  );

  await section(
    'coreAdminUsers',
    `SELECT COUNT(*)::int AS admin_users FROM public.admin_users`,
  );

  await section(
    'coreCustomerUsers',
    `SELECT COUNT(*)::int AS customer_users FROM public.users`,
  );

  await section(
    'coreOrders',
    `SELECT COUNT(*)::int AS orders FROM public.orders`,
  );

  await section(
    'coreDeliveryJobs',
    `SELECT COUNT(*)::int AS delivery_jobs FROM delivery.delivery_jobs`,
  );

  await section(
    'recentMigrations',
    `
    SELECT migration_name, finished_at
    FROM public._prisma_migrations
    ORDER BY finished_at DESC NULLS LAST
    LIMIT 5
  `,
  );

  await section(
    'outboxPending',
    `
    SELECT COUNT(*)::int AS outbox_pending
    FROM delivery.delivery_outbox
    WHERE "deliveredAt" IS NULL
  `,
  );

  const host = new URL(process.env.DATABASE_URL).hostname;
  const dbUser = new URL(process.env.DATABASE_URL).username;
  console.log(
    JSON.stringify({ connected: true, host, dbUser, sections }, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  );
}

run()
  .catch((err) => {
    console.error(
      JSON.stringify({
        connected: false,
        error: err.message,
        code: err.code,
        hint:
          err.message.includes('timeout') ||
          err.message.includes('ECONNREFUSED') ||
          err.code === 'P1001'
            ? 'Add your public IP (112.134.172.185) to bingchun-pg trusted sources in DigitalOcean.'
            : undefined,
      }),
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
