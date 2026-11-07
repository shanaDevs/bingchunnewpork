/**
 * Pack existing Bambalapitiya READY delivery orders into a job via the live
 * API so the core socket emits `newDeliveryJob` to drivers already in the
 * branch pool (Sakuni on USB). Prisma-only creates cannot broadcast.
 *
 *   cd backend && npx ts-node --transpile-only scripts/broadcast-bambalapitiya-job.ts
 */
import { prisma } from '../src/lib/prisma';
import { signToken } from '../src/middleware/auth';
import { config } from '../src/config';

const API = `http://127.0.0.1:${config.port}/api`;
const SEED_NOTE_PREFIX = 'seed-bambalapitiya-delivery-';

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: 'Bambalapitiya' }, isActive: true },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('Bambalapitiya store not found');

  const admin = await prisma.adminUser.findFirst({
    where: { email: 'admin@bingchunsrilanka.lk', isActive: true },
    include: { role: { select: { name: true } } },
  });
  if (!admin) throw new Error('Super admin not found');
  const token = signToken(admin.id, 'admin', admin.role.name, admin.storeId ?? undefined);

  let orders = await prisma.order.findMany({
    where: {
      storeId: store.id,
      orderMode: 'DELIVERY',
      status: 'READY',
      notes: { startsWith: SEED_NOTE_PREFIX },
    },
    select: { id: true, orderNumber: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  if (orders.length === 0) {
    orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        orderMode: 'DELIVERY',
        status: 'READY',
        guestPhone: { contains: '762843595' },
      },
      select: { id: true, orderNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (orders.length === 0) {
    const existing = await prisma.deliveryJob.findFirst({
      where: { storeId: store.id, status: 'SCHEDULED' },
      select: {
        id: true,
        title: true,
        status: true,
        jobOrders: { select: { order: { select: { orderNumber: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: 'No READY delivery orders to pack. Driver alerts only fire when a SCHEDULED job is created.',
          existingScheduledJob: existing,
        },
        null,
        2,
      ),
    );
    return;
  }

  const res = await fetch(`${API}/admin/delivery-jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      storeId: store.id,
      title: 'Bambalapitiya run — Dinuka Gayan',
      orderIds: orders.map((o) => o.id),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: { id?: string; title?: string; availableDriverCount?: number };
  };
  if (!res.ok || json.success === false) {
    throw new Error(`POST /admin/delivery-jobs → ${res.status} ${json.message || JSON.stringify(json)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        jobId: json.data?.id,
        title: json.data?.title,
        availableDriverCount: json.data?.availableDriverCount,
        orders: orders.map((o) => o.orderNumber),
        store: store.name,
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
