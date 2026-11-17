/**
 * Extra PayHere pickup OUTSIDE the Jun 5 – Jul 4 payout window (Jul 10).
 * Increases All-Time Online Available Balance only — does not change that period’s
 * branch payout / platform commission figures (negative net platform preserved).
 *
 *   npm run seed:dehiwala-payout-topup -w @bingchun/backend
 *   npm run seed:dehiwala-payout-topup -w @bingchun/backend -- --clean
 */
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import type { OrderMode, PaymentMethod } from '@prisma/client';
import { completeTakeawayPickup, placeOrder } from '../controllers/orderController';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance, syncMissingWalletPayments } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { ensureAppSchema } from '../lib/appSchema';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-dehiwala-topup-';
const TOPUP_YEAR = 2026;
const TOPUP_MONTH = 7;
const TOPUP_DAY = 10;
const WALK_IN_PHONE = '0771000710';
const DEHIWALA_BRANCH_EMAIL = 'dehiwalabranch@gmail.com';
const DEHIWALA_BRANCH_PASSWORD = 'Branch@123';

async function ensurePayHere(): Promise<void> {
  await updatePaymentSettings({
    activeOnlineGateway: 'PAYHERE',
    payhereMode: 'sandbox',
    payhereMerchantId: '1225599',
    payhereMerchantSecret: 'sandboxsecretkey123',
    paymentMethods: {
      PAYHERE: { enabled: true, label: 'Online Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CARD: { enabled: true, label: 'Card Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CASH_AT_COUNTER: { enabled: true, label: 'Cash at Counter', modes: ['TAKEAWAY'] },
    },
  });
}

async function main() {
  assertDevSeedOnly();
  process.env.RUNTIME_SCHEMA_PATCHES = 'true';
  await ensureAppSchema();
  const clean = process.argv.includes('--clean');
  const note = `${SEED_NOTE}${TOPUP_YEAR}-07-10-payhere`;
  const placedAt = new Date(`${TOPUP_YEAR}-07-10T12:00:00+05:30`);

  const store = await prisma.store.findFirst({
    where: { name: 'Bing Chun - Dehiwala', isActive: true },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('Dehiwala store not found');

  const existing = await prisma.order.findFirst({
    where: { storeId: store.id, notes: note },
    select: { id: true, orderNumber: true },
  });
  if (existing && !clean) {
    console.log(`Already seeded top-up: ${existing.orderNumber} — use --clean to replace.`);
    return;
  }
  if (existing && clean) {
    await prisma.promotionUsage.deleteMany({ where: { orderId: existing.id } });
    await prisma.walletTransaction.deleteMany({ where: { orderId: existing.id } });
    await prisma.order.delete({ where: { id: existing.id } });
    console.log(`Removed ${existing.orderNumber}`);
  }

  const product = await prisma.storeProduct.findFirst({
    where: { storeId: store.id, isAvailable: true, product: { name: { contains: 'Brown Sugar' } } },
    include: { product: { select: { id: true, name: true, basePrice: true } } },
  });
  if (!product) throw new Error('Brown Sugar product not found at Dehiwala');

  const role = await prisma.role.findFirst({ where: { name: 'STORE_MANAGER' }, select: { id: true } });
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(DEHIWALA_BRANCH_PASSWORD, 12);
  const manager = await prisma.adminUser.upsert({
    where: { email: DEHIWALA_BRANCH_EMAIL },
    update: { storeId: store.id, roleId: role!.id, passwordHash, isActive: true },
    create: {
      name: 'Dehiwala Branch Manager',
      email: DEHIWALA_BRANCH_EMAIL,
      passwordHash,
      roleId: role!.id,
      storeId: store.id,
      isActive: true,
    },
    select: { id: true },
  });

  const phone = normalizePhone(WALK_IN_PHONE);
  let user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Dehiwala top-up seed',
        phone,
        email: 'seed.dehiwala.topup@bingchun-test.lk',
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  await ensurePayHere();
  await syncStoreProducts(store.id, { stock: 50, isAvailable: true });

  const staff: HarnessUser & { type: 'admin' } = {
    sub: manager.id,
    type: 'admin',
    role: 'STORE_MANAGER',
    storeId: store.id,
  };

  const body = {
    orderMode: 'TAKEAWAY',
    storeId: store.id,
    items: [{ productId: product.product.id, size: 'REGULAR', toppingIds: [], quantity: 1 }],
    paymentMethod: 'PAYHERE' as PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
    scheduleMode: 15,
    scheduledAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
  };

  const data = await runHandler<{
    order: { id: string; orderNumber: string; storeId: string };
  }>(placeOrder, {
    body,
    user: { sub: user.id, type: 'user' },
    headers: { 'idempotency-key': crypto.randomUUID() },
  });

  const row = await prisma.order.findUniqueOrThrow({
    where: { id: data.order.id },
    select: {
      id: true,
      orderNumber: true,
      subtotal: true,
      total: true,
      discount: true,
      userId: true,
      paymentMethod: true,
      orderMode: true,
    },
  });
  if (row.discount > 0) throw new Error(`Expected no discount, got ${row.discount}`);

  await markOnlineOrderPaid(
    {
      id: row.id,
      orderNumber: row.orderNumber,
      storeId: data.order.storeId,
      total: row.total,
      paymentMethod: row.paymentMethod,
      userId: row.userId,
      orderMode: row.orderMode as OrderMode,
    },
    { paymentRef: `${SEED_NOTE}pay-${crypto.randomUUID()}` },
  );

  await runHandler(completeTakeawayPickup, {
    method: 'POST',
    params: { id: row.id },
    user: staff,
    body: { collectPayment: false, note: `${SEED_NOTE}pickup` },
  });

  await prisma.order.update({
    where: { id: row.id },
    data: { createdAt: placedAt, updatedAt: placedAt },
  });
  await prisma.walletTransaction.updateMany({
    where: { orderId: row.id },
    data: { createdAt: placedAt },
  });

  await syncMissingWalletPayments(store.id);
  await recalculateWalletBalance(store.id);

  console.log(
    `✅ Top-up ${row.orderNumber}  ${placedAt.toISOString().slice(0, 10)}  subtotal ${row.subtotal}  ` +
      `total ${row.total}  (outside Jun 5 – Jul 4 payout window)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());