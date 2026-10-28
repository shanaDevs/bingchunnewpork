import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { WALLET_CREDIT_METHODS } from './orderPayment';
import { refreshWalletCaches } from './walletService';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { centsToDecimal } from './moneyDecimal';
import { walletBalanceCents } from './walletApiMoney';

const PAID_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  storeId: true,
  total: true,
  subtotal: true,
  deliveryFee: true,
  discount: true,
  loyaltyDiscount: true,
  paymentMethod: true,
  paymentRef: true,
  orderMode: true,
  createdAt: true,
} as const;

type PaidOrderRow = Prisma.OrderGetPayload<{ select: typeof PAID_ORDER_SELECT }>;

function buildOrderDescription(order: {
  orderNumber: string;
  orderMode: string;
  subtotal: number;
  total: number;
  deliveryFee: number;
  discount: number;
  loyaltyDiscount: number;
  paymentRef: string | null;
}) {
  return [
    `Order #${order.orderNumber}`,
    `(${order.orderMode})`,
    order.subtotal !== order.total
      ? `Subtotal: ${order.subtotal} | Delivery: ${order.deliveryFee} | Discount: ${order.discount + order.loyaltyDiscount}`
      : null,
    order.paymentRef ? `Ref: ${order.paymentRef}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Recompute running balanceAfter values and wallet cache fields from all transactions. */
export async function recalculateWalletBalance(storeId: string): Promise<number> {
  const wallet = await refreshWalletCaches(storeId);
  return walletBalanceCents(wallet);
}

function compareCreatedAtThenId(
  a: { id: string; createdAt: Date },
  b: { id: string; createdAt: Date },
): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

function groupOrdersByStore(orders: PaidOrderRow[]): Map<string, PaidOrderRow[]> {
  const byStore = new Map<string, PaidOrderRow[]>();
  for (const order of orders) {
    const list = byStore.get(order.storeId);
    if (list) list.push(order);
    else byStore.set(order.storeId, [order]);
  }
  return byStore;
}

async function loadLedgerBalancesByStore(storeIds: Iterable<string>): Promise<Map<string, number>> {
  const ids = [...new Set(storeIds)];
  const balances = new Map(ids.map((storeId) => [storeId, 0]));
  if (ids.length === 0) return balances;

  const grouped = await prisma.walletTransaction.groupBy({
    by: ['storeId'],
    where: { storeId: { in: ids } },
    _sum: { amount: true },
  });

  for (const row of grouped) {
    balances.set(row.storeId, decimalFieldToCentsNumber(row._sum.amount));
  }
  return balances;
}

function buildMissingWalletPaymentRows(
  orders: PaidOrderRow[],
  startingBalanceByStore: ReadonlyMap<string, number>,
): Prisma.WalletTransactionCreateManyInput[] {
  const rows: Prisma.WalletTransactionCreateManyInput[] = [];

  for (const [storeId, storeOrders] of groupOrdersByStore(orders)) {
    let runningBalance = startingBalanceByStore.get(storeId) ?? 0;
    const sorted = [...storeOrders].sort(compareCreatedAtThenId);

    for (const order of sorted) {
      const centsAmount = order.total * 100;
      runningBalance += centsAmount;
      rows.push({
        id: crypto.randomUUID(),
        storeId,
        orderId: order.id,
        type: 'ORDER_PAYMENT',
        amount: centsToDecimal(centsAmount),
        balanceAfter: centsToDecimal(runningBalance),
        paymentMethod: order.paymentMethod,
        paymentRef: order.paymentRef ?? null,
        description: buildOrderDescription(order),
        reference: order.orderNumber,
        createdAt: order.createdAt,
      });
    }
  }

  return rows;
}

async function loadPaidWalletCreditOrders(scopeStoreId?: string): Promise<PaidOrderRow[]> {
  return prisma.order.findMany({
    where: {
      paymentStatus: 'PAID',
      paymentMethod: { in: [...WALLET_CREDIT_METHODS] },
      ...(scopeStoreId ? { storeId: scopeStoreId } : {}),
    },
    select: PAID_ORDER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

async function loadExistingOrderPaymentIds(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const existing = await prisma.walletTransaction.findMany({
    where: { type: 'ORDER_PAYMENT', orderId: { in: orderIds } },
    select: { orderId: true },
  });
  return new Set(existing.map((txn) => txn.orderId).filter((id): id is string => Boolean(id)));
}

function collectStoreIdsToRecalc(
  paidOrders: PaidOrderRow[],
  missingOrders: PaidOrderRow[],
  scopeStoreId?: string,
): Set<string> {
  const storeIds = new Set(missingOrders.map((order) => order.storeId));
  if (scopeStoreId) {
    storeIds.add(scopeStoreId);
    return storeIds;
  }
  for (const order of paidOrders) {
    storeIds.add(order.storeId);
  }
  return storeIds;
}

/**
 * Add missing ORDER_PAYMENT rows for paid online orders and recalculate balances.
 * Does not delete existing transactions (settlements/adjustments preserved).
 */
export async function syncMissingWalletPayments(scopeStoreId?: string): Promise<{
  storesProcessed: number;
  ordersAdded: number;
  ordersSkipped: number;
}> {
  const paidOrders = await loadPaidWalletCreditOrders(scopeStoreId);

  if (paidOrders.length === 0) {
    const storeIds = scopeStoreId
      ? [scopeStoreId]
      : (await prisma.store.findMany({ select: { id: true } })).map((store) => store.id);
    for (const storeId of storeIds) {
      await recalculateWalletBalance(storeId);
    }
    return { storesProcessed: storeIds.length, ordersAdded: 0, ordersSkipped: 0 };
  }

  const existingOrderIds = await loadExistingOrderPaymentIds(paidOrders.map((order) => order.id));
  const missingOrders = paidOrders.filter((order) => !existingOrderIds.has(order.id));
  const storeIdsToRecalc = collectStoreIdsToRecalc(paidOrders, missingOrders, scopeStoreId);

  if (missingOrders.length > 0) {
    const startingBalanceByStore = await loadLedgerBalancesByStore(
      missingOrders.map((order) => order.storeId),
    );
    const rows = buildMissingWalletPaymentRows(missingOrders, startingBalanceByStore);
    await prisma.walletTransaction.createMany({ data: rows, skipDuplicates: true });
  }

  for (const storeId of storeIdsToRecalc) {
    await recalculateWalletBalance(storeId);
  }

  return {
    storesProcessed: storeIdsToRecalc.size,
    ordersAdded: missingOrders.length,
    ordersSkipped: paidOrders.length - missingOrders.length,
  };
}
