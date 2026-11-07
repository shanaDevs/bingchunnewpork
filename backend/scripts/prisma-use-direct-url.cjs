/**
 * Preload for ts-node seed scripts: interactive Prisma transactions (e.g. stock deduction)
 * do not work through PgBouncer in transaction pooling mode (P2028).
 * If set, use a direct Postgres URL before @bingchun/db constructs PrismaClient.
 *
 *   node -r ./scripts/prisma-use-direct-url.cjs node_modules/ts-node/dist/bin.js …
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (_) {
  /* optional */
}
const direct =
  process.env.PRISMA_DIRECT_URL ||
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL_DIRECT;
if (direct) {
  process.env.DATABASE_URL = direct;
}
