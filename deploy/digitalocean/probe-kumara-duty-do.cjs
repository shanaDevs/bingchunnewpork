const { requireDoadminDatabaseUrl } = require('./lib/load-doadmin-database-url.cjs');
process.env.DATABASE_URL = requireDoadminDatabaseUrl();
const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe('SET search_path TO public, delivery');
  const d = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, storeId: 'store-bing-chun---aluthgama' },
    select: { name: true, phone: true, dutyStatus: true, id: true },
    orderBy: { name: 'asc' },
  });
  console.log(d.filter(x => /kum/i.test(x.name)).map(x => x));
}
main().finally(() => prisma.$disconnect());
