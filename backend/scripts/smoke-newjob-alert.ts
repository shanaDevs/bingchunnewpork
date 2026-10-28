/**
 * Creates a READY delivery order and a delivery job through the real admin API
 * so `broadcastNewJob` fires — used to verify the driver app's new-job alert.
 *
 * Usage (backend dev server must be running):
 *   cd backend && npx tsx scripts/smoke-newjob-alert.ts [storeNameContains]
 */
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

const API = `http://127.0.0.1:${config.port}/api`;
const ADMIN_EMAIL = 'admin@bingchunsrilanka.lk';
const ADMIN_PASSWORD = 'Admin@123';

async function api(path: string, opts: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} ${json.message || JSON.stringify(json)}`);
  }
  return json.data;
}

async function main() {
  const storeFilter = process.argv[2] || 'Nugegoda';
  const store = await prisma.store.findFirst({
    where: { name: { contains: storeFilter }, isActive: true },
    select: { id: true, name: true, lat: true, lng: true },
  });
  if (!store) throw new Error(`Store matching "${storeFilter}" not found`);
  console.log('Store:', store.name, store.id);

  const product = await prisma.product.findFirst({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
  });
  if (!product) throw new Error('No product available');

  const suffix = Date.now().toString().slice(-6);
  const unit = product.basePrice || 850;
  const order = await prisma.order.create({
    data: {
      orderNumber: `SMK-ALERT-${suffix}`,
      guestName: 'Alert Test Customer',
      guestPhone: '0770000099',
      storeId: store.id,
      orderMode: 'DELIVERY',
      status: 'READY',
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      subtotal: unit,
      deliveryFee: 200,
      total: unit + 200,
      estimatedMinutes: 25,
      notes: 'New job alert smoke order',
      deliveryAddressLine: '7 Alert Lane',
      deliveryCity: 'Colombo',
      deliveryDistrict: 'Colombo',
      deliveryLat: store.lat + 0.004,
      deliveryLng: store.lng + 0.003,
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            size: 'REGULAR',
            quantity: 1,
            unitPrice: unit,
            totalPrice: unit,
          },
        ],
      },
      statusEvents: { create: [{ status: 'READY', note: 'Alert smoke seed' }] },
    },
    select: { id: true, orderNumber: true },
  });
  console.log('Created order', order.orderNumber);

  const login = await api('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const token = (login.token ?? login.accessToken) as string;
  console.log('Admin logged in');

  const job = await api('/admin/delivery-jobs', {
    method: 'POST',
    token,
    body: JSON.stringify({
      storeId: store.id,
      title: `Alert Test ${suffix}`,
      orderIds: [order.id],
    }),
  });
  console.log('Created job via API →', job.id, job.title, 'availableDrivers=', job.availableDriverCount);
  console.log('\nALERT_SMOKE_OK — check the phone for the new-job notification.');
}

main()
  .catch((e) => {
    console.error('ALERT_SMOKE_FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
