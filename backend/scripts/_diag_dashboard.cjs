require('dotenv').config({ path: __dirname + '/../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function timed(label, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`${label}: ${Date.now() - t}ms`, typeof r === 'object' ? JSON.stringify(r).slice(0, 300) : r);
  } catch (e) {
    console.log(`${label}: ERROR ${e.message.slice(0, 200)}`);
  }
}

(async () => {
  await timed('ping', () => prisma.$queryRawUnsafe('SELECT 1 as ok'));
  await timed('sizes', () => prisma.$queryRawUnsafe(`
    SELECT relname, n_live_tup::int AS rows FROM pg_stat_user_tables
    WHERE relname IN ('orders','order_items','refunds','store_wallets','users') ORDER BY relname`));
  await timed('order indexes', () => prisma.$queryRawUnsafe(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('orders','order_items') ORDER BY tablename, indexname`));
  await timed('connections', () => prisma.$queryRawUnsafe(`
    SELECT state, count(*)::int AS n, max(EXTRACT(EPOCH FROM (now() - query_start)))::int AS longest_s
    FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`));
  await timed('long running', () => prisma.$queryRawUnsafe(`
    SELECT pid, state, EXTRACT(EPOCH FROM (now() - query_start))::int AS secs, wait_event_type, left(query, 160) AS q
    FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()
    ORDER BY secs DESC NULLS LAST LIMIT 10`));
  await timed('max_connections', () => prisma.$queryRawUnsafe(`SHOW max_connections`));

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paid = { paymentStatus: 'PAID', status: { not: 'CANCELLED' }, createdAt: { gte: monthStart } };
  await timed('order.count month', () => prisma.order.count({ where: { createdAt: { gte: monthStart } } }));
  await timed('order.aggregate paid month', () => prisma.order.aggregate({ where: paid, _sum: { total: true } }));
  await timed('orderItem.groupBy month', () => prisma.orderItem.groupBy({
    by: ['productName'], where: { order: paid }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 50,
  }));
  await timed('orderItem.aggregate month', () => prisma.orderItem.aggregate({ where: { order: paid }, _sum: { quantity: true } }));
  await prisma.$disconnect();
})();
