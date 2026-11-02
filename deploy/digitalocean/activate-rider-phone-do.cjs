/**
 * Set isActive=true for DELIVERY_DRIVER admin_users matching a phone on live DO Postgres.
 * Usage: node deploy/digitalocean/activate-rider-phone-do.cjs 0788677359
 */
const { requireDoadminDatabaseUrl } = require('./lib/load-doadmin-database-url.cjs');

const phoneArg = process.argv[2] || '0788677359';

function phoneLookupVariants(phone) {
  const digits = phone.replace(/\D/g, '');
  let local = phone.trim();
  if (digits.startsWith('94') && digits.length === 11) local = `0${digits.slice(2)}`;
  else if (digits.startsWith('7') && digits.length === 9) local = `0${digits}`;
  else if (digits.startsWith('07') && digits.length === 10) local = digits;
  const withoutLeadingZero = local.replace(/\D/g, '').replace(/^0/, '');
  return [...new Set([local, digits, `94${withoutLeadingZero}`, withoutLeadingZero, `0${withoutLeadingZero}`])];
}

process.env.DATABASE_URL = requireDoadminDatabaseUrl();

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);

  const variants = phoneLookupVariants(phoneArg);
  const before = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, phone: { in: variants } },
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      storeId: true,
      store: { select: { name: true, city: true } },
    },
    orderBy: { name: 'asc' },
  });

  if (before.length === 0) {
    console.log(JSON.stringify({ error: 'No DELIVERY_DRIVER rows for phone', phone: phoneArg, variants }, null, 2));
    process.exitCode = 1;
    return;
  }

  const updated = await prisma.adminUser.updateMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, phone: { in: variants } },
    data: { isActive: true },
  });

  const after = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_DRIVER' }, phone: { in: variants } },
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      store: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        phone: phoneArg,
        rowsMatched: before.length,
        rowsUpdated: updated.count,
        before: before.map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          isActive: d.isActive,
          branch: d.store?.name,
        })),
        after: after.map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          isActive: d.isActive,
          branch: d.store?.name,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
