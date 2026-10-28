/**
 * Seeds one PAID order with a PLATFORM-owned promo (100% platform-funded)
 * so Platform discount payback shows on Nugegoda payout for Aug 11–25.
 *
 * Does not delete refund or SHARED promo seed orders.
 *
 *   npm run seed:payback-test -w @bingchun/backend
 */
import crypto from 'crypto';
import { assertDevSeedOnly } from './seedGuard';
assertDevSeedOnly();
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';
import { buildPromotionUsageRecord } from '../lib/promotionUsage';
import { syncMissingWalletPayments } from '../lib/walletSync';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const SEED_ORDER_ID_PREFIX = 'seed-payback-';
const PROMO_CODE = 'PAYBACKTEST20';
const ORDER_DATE = '2026-08-16';
const SUBTOTAL = 5000;
const DISCOUNT_PCT = 20;
const STORE_NAME = 'Nugegoda';

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: STORE_NAME }, isActive: true },
    select: {
      id: true,
      name: true,
      platformDiscountPaybackEnabled: true,
    },
  });
  if (!store) throw new Error(`No active store matching "${STORE_NAME}"`);

  console.log('🌱  Platform discount payback seed');
  console.log(`    Store: ${store.name} (${store.id})`);

  if (!store.platformDiscountPaybackEnabled) {
    await prisma.store.update({
      where: { id: store.id },
      data: { platformDiscountPaybackEnabled: true },
    });
    console.log('    Enabled platformDiscountPaybackEnabled on this branch.\n');
  } else {
    console.log('    Platform discount payback already enabled.\n');
  }

  const existing = await prisma.order.findMany({
    where: { storeId: store.id, id: { startsWith: SEED_ORDER_ID_PREFIX } },
    select: { id: true },
  });
  if (existing.length > 0) {
    const ids = existing.map((o) => o.id);
    await prisma.promotionUsage.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.walletTransaction.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`🧹  Replaced ${ids.length} previous seed-payback-* order(s).\n`);
  }

  const product = await prisma.product.findFirst({
    where: { isAvailable: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (!product) throw new Error('No available products. Run prisma:seed first.');

  const promo = await prisma.promoCode.upsert({
    where: { code: PROMO_CODE },
    create: {
      id: crypto.randomUUID(),
      code: PROMO_CODE,
      title: 'Platform payback test (PLATFORM)',
      description: 'Dev seed — 100% platform-funded discount for payback testing',
      promotionKind: 'PERCENTAGE_DISCOUNT',
      ownership: 'PLATFORM',
      contributionSource: null,
      branchSharePct: 0,
      platformSharePct: 100,
      discountType: 'PERCENTAGE',
      discountValue: DISCOUNT_PCT,
      minOrderValue: 0,
      isActive: true,
      storeIds: [store.id],
      showOnHome: false,
    },
    update: {
      title: 'Platform payback test (PLATFORM)',
      ownership: 'PLATFORM',
      contributionSource: null,
      branchSharePct: 0,
      platformSharePct: 100,
      discountType: 'PERCENTAGE',
      discountValue: DISCOUNT_PCT,
      isActive: true,
      storeIds: [store.id],
      deletedAt: null,
    },
    select: { id: true, code: true, ownership: true, discountType: true, discountValue: true, promotionKind: true, promotionRules: true },
  });

  const storeSlug = store.id.replace(/[^a-z0-9]/gi, '').slice(-10).toLowerCase();
  const orderId = `${SEED_ORDER_ID_PREFIX}${storeSlug}-001`;
  const orderNumber = `PAYBACK-${storeSlug.slice(0, 4).toUpperCase()}-${ORDER_DATE.replace(/-/g, '')}-01`;
  const qty = 2;
  const discount = Math.floor((SUBTOTAL * DISCOUNT_PCT) / 100);
  const total = SUBTOTAL - discount;
  const createdAt = new Date(`${ORDER_DATE}T11:30:00.000Z`);

  await prisma.order.create({
    data: {
      id: orderId,
      orderNumber,
      storeId: store.id,
      guestName: 'Platform Payback Test Customer',
      guestPhone: '94771234567',
      orderMode: 'TAKEAWAY',
      status: 'DELIVERED',
      paymentMethod: 'PAYHERE',
      paymentGateway: 'PAYHERE',
      paymentStatus: 'PAID',
      paymentRef: `seed-ph-${orderId}`,
      prepaidAmount: total,
      subtotal: SUBTOTAL,
      deliveryFee: 0,
      convenientFee: 0,
      discount,
      total,
      promoCode: promo.code,
      estimatedMinutes: 15,
      channel: 'WEB',
      notes: 'PLATFORM-owned promo seed — platform discount payback',
      createdAt,
      updatedAt: createdAt,
      items: {
        create: [
          {
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            size: 'REGULAR',
            quantity: qty,
            unitPrice: Math.floor(SUBTOTAL / qty),
            totalPrice: SUBTOTAL,
          },
        ],
      },
      statusEvents: {
        create: [
          { status: 'RECEIVED', note: 'Seed order placed', createdAt },
          { status: 'DELIVERED', note: 'Seed order completed', createdAt },
        ],
      },
    },
  });

  const usageData = buildPromotionUsageRecord({
    orderId,
    storeId: store.id,
    subtotal: SUBTOTAL,
    deliveryFee: 0,
    orderDiscount: discount,
    promo: {
      id: promo.id,
      code: promo.code,
      ownership: 'PLATFORM',
      contributionSource: null,
      branchSharePct: 0,
      platformSharePct: 100,
      promotionKind: promo.promotionKind,
      promotionRules: promo.promotionRules,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    },
    cartItems: [
      {
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: Math.floor(SUBTOTAL / qty),
        lineTotal: SUBTOTAL,
      },
    ],
    storePaybackEnabled: true,
  });

  await prisma.promotionUsage.create({
    data: {
      id: crypto.randomUUID(),
      ...usageData,
      createdAt,
    },
  });

  await prisma.promoCode.update({
    where: { id: promo.id },
    data: { usedCount: { increment: 1 } },
  });

  const syncResult = await syncMissingWalletPayments(store.id);

  console.log(`🏷️   Promo: ${promo.code} (ownership PLATFORM, ${DISCOUNT_PCT}% off, 100% platform-funded)`);
  console.log(`    Order:    ${orderNumber}`);
  console.log(`    Date:     ${ORDER_DATE}`);
  console.log(`    Subtotal: LKR ${SUBTOTAL.toFixed(2)}`);
  console.log(`    Discount: LKR ${discount.toFixed(2)}  (platform payback LKR ${usageData.platformPaybackAmount.toFixed(2)})`);
  console.log(`    Wallet:   added ${syncResult.ordersAdded} payment(s); skipped ${syncResult.ordersSkipped}`);
  console.log('\n✅  Seed complete. Refresh payout to see Platform discount payback.\n');
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
