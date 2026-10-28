/**
 * Smoke: a driver cannot mark an order delivered without the customer code.
 *
 * Seeds one READY delivery order + job at Dinuka's branch, then asserts:
 *   1. DELIVERED with no code    → 400 OTP_REQUIRED
 *   2. DELIVERED with wrong code → 400 OTP_INVALID
 *   3. DELIVERED with real code  → 200
 *
 * The stored code is hashed, so the test recovers the plaintext by scanning the
 * 6-digit space against the HMAC. That is test-only; nothing in the app can do this.
 *
 * Usage (backend running):
 *   cd backend && npx ts-node --transpile-only scripts/smoke-delivery-otp.ts
 */
import crypto from 'crypto';
import { prisma } from '../src/lib/prisma';
import { driverPinLookup, hashDriverPin } from '../src/lib/driverPin';
import { config } from '../src/config';

const API = `http://127.0.0.1:${config.port}/api`;
const SMOKE_PIN = '9999';

type ApiResult = { ok: boolean; status: number; code?: string; message?: string; data?: any };

async function api(path: string, opts: RequestInit & { token?: string } = {}): Promise<ApiResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const json: any = await res.json().catch(() => ({}));
  return {
    ok: res.ok && json.success !== false,
    status: res.status,
    code: json.code,
    message: json.message,
    data: json.data,
  };
}

async function must(path: string, opts: RequestInit & { token?: string } = {}) {
  const r = await api(path, opts);
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${r.status} ${r.message}`);
  return r.data;
}

function recoverCode(codeHash: string): string | null {
  for (let n = 100000; n <= 999999; n++) {
    const candidate = String(n);
    const hash = crypto.createHmac('sha256', config.otpPepper).update(candidate).digest('hex');
    if (hash === codeHash) return candidate;
  }
  return null;
}

const checks: string[] = [];
function check(label: string, pass: boolean, detail = '') {
  checks.push(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  const dinuka = await prisma.adminUser.findFirst({
    where: { name: 'Dinuka', role: { name: 'DELIVERY_DRIVER' }, isActive: true },
    select: { id: true, storeId: true },
  });
  if (!dinuka?.storeId) throw new Error('Dinuka driver not found / no branch');

  const store = await prisma.store.findUnique({
    where: { id: dinuka.storeId },
    select: { id: true, name: true, lat: true, lng: true, deliveryOtpRequired: true },
  });
  if (!store) throw new Error('Driver branch not found');

  console.log(`Branch: ${store.name} (branch flag deliveryOtpRequired=${store.deliveryOtpRequired})`);
  console.log(`Global baseline deliveryOtpRequiredDefault=${config.deliveryOtpRequiredDefault}`);

  await prisma.adminUser.update({
    where: { id: dinuka.id },
    data: {
      passwordHash: await hashDriverPin(SMOKE_PIN),
      pinLookup: driverPinLookup(dinuka.storeId, SMOKE_PIN),
      dutyStatus: 'ONLINE',
    },
  });

  const product = await prisma.product.findFirst({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
  });
  if (!product) throw new Error('No product available');

  const suffix = Date.now().toString().slice(-6);
  const unit = product.basePrice || 850;
  const order = await prisma.order.create({
    data: {
      orderNumber: `SMK-OTP-${suffix}`,
      guestName: 'OTP Smoke Customer',
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
      deliveryAddressLine: '12 Galle Road',
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
      statusEvents: { create: [{ status: 'READY', note: 'OTP smoke seed' }] },
    },
    select: { id: true, orderNumber: true },
  });

  const job = await prisma.deliveryJob.create({
    data: {
      storeId: store.id,
      title: `OTP smoke ${suffix}`,
      status: 'SCHEDULED',
      scheduledAt: new Date(),
      broadcastedAt: new Date(),
      jobOrders: { create: [{ orderId: order.id, sequence: 1 }] },
    },
    select: { id: true },
  });

  const login = await must('/auth/delivery/login', {
    method: 'POST',
    body: JSON.stringify({ pin: SMOKE_PIN, storeId: dinuka.storeId }),
  });
  const token = login.token as string;

  await must('/delivery/me/duty', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ dutyStatus: 'ONLINE' }),
  });
  await must(`/delivery/jobs/${job.id}/claim`, { method: 'POST', token, body: '{}' });
  const started = await must(`/delivery/jobs/${job.id}/start`, { method: 'POST', token, body: '{}' });

  check(
    'driver app is told the branch needs a code',
    started.store?.deliveryOtpRequired === true,
    `store.deliveryOtpRequired=${started.store?.deliveryOtpRequired}`,
  );

  const issued = await prisma.deliveryOtp.findFirst({
    where: { orderId: order.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  check('a code was issued to the customer at run start', !!issued);

  const noCode = await api(`/delivery/orders/${order.id}/status`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ status: 'DELIVERED' }),
  });
  check(
    'DELIVERED without a code is rejected',
    !noCode.ok && noCode.code === 'OTP_REQUIRED',
    `${noCode.status} ${noCode.code ?? noCode.message}`,
  );

  const wrongCode = await api(`/delivery/orders/${order.id}/status`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ status: 'DELIVERED', otp: '000000' }),
  });
  check(
    'DELIVERED with a wrong code is rejected',
    !wrongCode.ok && wrongCode.code === 'OTP_INVALID',
    `${wrongCode.status} ${wrongCode.code ?? wrongCode.message}`,
  );

  const afterFailures = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true },
  });
  check('order is still not delivered', afterFailures?.status !== 'DELIVERED', `status=${afterFailures?.status}`);

  const live = await prisma.deliveryOtp.findFirst({
    where: { orderId: order.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const code = live ? recoverCode(live.codeHash) : null;
  if (!code) throw new Error('Could not recover the plaintext code for the test');

  const good = await api(`/delivery/orders/${order.id}/status`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ status: 'DELIVERED', otp: code }),
  });
  check('DELIVERED with the customer code succeeds', good.ok && good.data?.status === 'DELIVERED', good.message ?? '');

  await api(`/delivery/jobs/${job.id}/complete`, { method: 'POST', token, body: '{}' });

  console.log('');
  checks.forEach((c) => console.log(c));
  console.log(`\nOrder ${order.orderNumber} — code was ${code}`);
  console.log(process.exitCode ? 'OTP_SMOKE_FAIL' : 'OTP_SMOKE_OK');
}

main()
  .catch((e) => {
    console.error('OTP_SMOKE_FAIL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
