import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { requireBranchStoreId } from '../middleware/auth';
import {
  manualTopUp,
  setWeeklyBaseQty,
  LOW_STOCK_THRESHOLD,
  OUT_OF_STOCK_THRESHOLD,
  isLowStock,
  isOutOfStockByQty,
} from '../lib/stockEngine';
import { normalizeProductImageUrl } from '../lib/productImages';

async function resolveStoreId(req: Request, queryStoreId?: string): Promise<string> {
  if (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'CASHIER') {
    return requireBranchStoreId(req);
  }
  if (!queryStoreId) throw new AppError('storeId is required', 400);
  return queryStoreId;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new AppError('Invalid date format', 400);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateRange(from?: string, to?: string) {
  const fromTrimmed = from?.trim();
  const toTrimmed = to?.trim();
  const fromDate = fromTrimmed ? parseLocalDate(fromTrimmed) : undefined;
  let toDate: Date | undefined;
  if (toTrimmed) {
    toDate = parseLocalDate(toTrimmed);
    toDate.setHours(23, 59, 59, 999);
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError('from must be on or before to', 400);
  }
  return { fromDate, toDate };
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function enumerateDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cur = new Date(from);
  while (cur <= to) {
    keys.push(formatDateKey(cur));
    cur = addDays(cur, 1);
  }
  return keys;
}

function nullIfZero(value: number): number | null {
  return value === 0 ? null : value;
}

type LedgerLog = { qtyChange: number; createdAt: Date; batchNumber?: string | null };

type LedgerDayBatch = {
  id: string;
  batchNumber: string;
  batchType?: string;
  batchGroupNumber?: string | null;
  status: string;
  receivedQty: number;
  remainingQty: number;
  unitCost: number | null;
  receivedAt: string;
  productId?: string;
  productName?: string;
};

type LedgerRow = {
  date: string;
  openStock: number | null;
  stockValue: number | null;
  stockIn: number | null;
  stockOut: number | null;
  lkrIn: number | null;
  lkrOut: number | null;
  stockMargin: number;
  closingValue: number;
  lkrMargin: number | null;
  discountTotal: number | null;
  batchNumbers: string | null;
  batches: LedgerDayBatch[];
};

type BuiltLedger = {
  opening: { date: string; stock: number; value: number; lkrMargin: number | null };
  rows: LedgerRow[];
  broughtForward: { date: string; stock: number; value: number; lkrMargin: number | null };
};

function groupLogsByDay(logs: LedgerLog[]): Map<string, LedgerLog[]> {
  const logsByDay = new Map<string, LedgerLog[]>();
  for (const log of logs) {
    const key = formatDateKey(log.createdAt);
    if (!logsByDay.has(key)) logsByDay.set(key, []);
    logsByDay.get(key)!.push(log);
  }
  return logsByDay;
}

function dayStockFlows(dayLogs: LedgerLog[]): { stockIn: number; stockOut: number } {
  const stockIn = dayLogs.filter((l) => l.qtyChange > 0).reduce((sum, l) => sum + l.qtyChange, 0);
  const stockOut = dayLogs.filter((l) => l.qtyChange < 0).reduce((sum, l) => sum + Math.abs(l.qtyChange), 0);
  return { stockIn, stockOut };
}

function dayBatchNumbers(dayLogs: LedgerLog[]): string | null {
  const numbers = [...new Set(dayLogs.map((log) => log.batchNumber).filter(Boolean) as string[])];
  return numbers.length > 0 ? numbers.join(', ') : null;
}

function mergeLedgerBatchNumbers(rows: LedgerRow[]): string | null {
  const numbers = new Set<string>();
  for (const row of rows) {
    if (!row.batchNumbers) continue;
    for (const batchNumber of row.batchNumbers.split(', ')) {
      if (batchNumber) numbers.add(batchNumber);
    }
  }
  return numbers.size > 0 ? [...numbers].sort().join(', ') : null;
}

async function fetchLedgerDayBatches(
  storeId: string,
  fromDay: Date,
  toEnd: Date,
  productId?: string,
): Promise<Map<string, LedgerDayBatch[]>> {
  const batches = await prisma.stockBatch.findMany({
    where: {
      storeId,
      ...(productId ? { productId } : {}),
      receivedAt: { gte: fromDay, lte: toEnd },
    },
    select: {
      id: true,
      batchNumber: true,
      batchType: true,
      status: true,
      receivedQty: true,
      remainingQty: true,
      unitCost: true,
      receivedAt: true,
      productId: true,
      batchGroup: {
        select: { batchNumber: true },
      },
    },
    orderBy: { receivedAt: 'asc' },
  });

  const productIds = [...new Set(batches.map((batch) => batch.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      })
    : [];
  const productMap = new Map(products.map((product) => [product.id, product.name]));

  const byDay = new Map<string, LedgerDayBatch[]>();
  for (const batch of batches) {
    const key = formatDateKey(batch.receivedAt);
    const entry: LedgerDayBatch = {
      id: batch.id,
      batchNumber: batch.batchNumber,
      batchType: batch.batchType,
      batchGroupNumber: batch.batchGroup?.batchNumber ?? null,
      status: batch.status,
      receivedQty: batch.receivedQty,
      remainingQty: batch.remainingQty,
      unitCost: batch.unitCost,
      receivedAt: batch.receivedAt.toISOString(),
      ...(productId
        ? {}
        : {
            productId: batch.productId,
            productName: productMap.get(batch.productId) ?? 'Unknown product',
          }),
    };
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(entry);
  }
  return byDay;
}

function attachBatchesToLedgerRows(rows: LedgerRow[], batchesByDay: Map<string, LedgerDayBatch[]>): LedgerRow[] {
  return rows.map((row) => {
    const batches = batchesByDay.get(row.date) ?? [];
    return {
      ...row,
      batches,
      batchNumbers: batches.length > 0
        ? batches.map((batch) => batch.batchNumber).join(', ')
        : row.batchNumbers,
    };
  });
}

type PromoOfferLine = { productId?: string; discountAmount?: number };

function productPromoDiscount(
  orderDiscount: number,
  subtotal: number,
  productLineTotal: number,
  offerDetails: unknown,
  productId: string,
): number {
  if (productLineTotal <= 0) return 0;

  const details = offerDetails as { scope?: string; lines?: PromoOfferLine[] } | null | undefined;
  if (details?.scope === 'product' && Array.isArray(details.lines)) {
    return details.lines
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + (line.discountAmount ?? 0), 0);
  }

  if (orderDiscount <= 0 || subtotal <= 0) return 0;
  return Math.floor((orderDiscount * productLineTotal) / subtotal);
}

function productLoyaltyDiscount(
  loyaltyDiscount: number,
  subtotal: number,
  productLineTotal: number,
): number {
  if (loyaltyDiscount <= 0 || subtotal <= 0 || productLineTotal <= 0) return 0;
  return Math.floor((loyaltyDiscount * productLineTotal) / subtotal);
}

async function fetchDailySalesMetrics(
  storeId: string,
  fromDay: Date,
  toEnd: Date,
  productId?: string,
): Promise<{ discounts: Map<string, number>; lkrIn: Map<string, number> }> {
  const discounts = new Map<string, number>();
  const lkrIn = new Map<string, number>();

  if (!productId) {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: fromDay, lte: toEnd },
        paymentStatus: 'PAID',
      },
      select: {
        discount: true,
        loyaltyDiscount: true,
        createdAt: true,
        items: { select: { totalPrice: true } },
      },
    });

    for (const order of orders) {
      const gross = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
      const discountShare = order.discount + order.loyaltyDiscount;
      const key = formatDateKey(order.createdAt);
      discounts.set(key, (discounts.get(key) ?? 0) + discountShare);
      lkrIn.set(key, (lkrIn.get(key) ?? 0) + gross - discountShare);
    }
    return { discounts, lkrIn };
  }

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: fromDay, lte: toEnd },
      paymentStatus: 'PAID',
      items: { some: { productId } },
    },
    select: {
      discount: true,
      loyaltyDiscount: true,
      subtotal: true,
      createdAt: true,
      items: {
        where: { productId },
        select: { totalPrice: true },
      },
      promotionUsages: {
        select: { offerDetails: true },
        take: 1,
      },
    },
  });

  for (const order of orders) {
    const productLineTotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
    if (productLineTotal <= 0) continue;

    const offerDetails = order.promotionUsages[0]?.offerDetails;
    const promoShare = productPromoDiscount(
      order.discount,
      order.subtotal,
      productLineTotal,
      offerDetails,
      productId,
    );
    const loyaltyShare = productLoyaltyDiscount(
      order.loyaltyDiscount,
      order.subtotal,
      productLineTotal,
    );
    const discountShare = promoShare + loyaltyShare;

    const key = formatDateKey(order.createdAt);
    discounts.set(key, (discounts.get(key) ?? 0) + discountShare);
    lkrIn.set(key, (lkrIn.get(key) ?? 0) + productLineTotal - discountShare);
  }
  return { discounts, lkrIn };
}

function attachSalesMetricsToLedgerRows(
  rows: LedgerRow[],
  discounts: Map<string, number>,
  lkrInByDay: Map<string, number>,
): LedgerRow[] {
  return rows.map((row) => ({
    ...row,
    discountTotal: nullIfZero(discounts.get(row.date) ?? 0),
    lkrIn: nullIfZero(lkrInByDay.get(row.date) ?? 0),
  }));
}

function recalculateLkrMargin(
  opening: BuiltLedger['opening'],
  rows: LedgerRow[],
  broughtForward: BuiltLedger['broughtForward'],
): void {
  let running = opening.lkrMargin ?? 0;
  for (const row of rows) {
    running += (row.lkrIn ?? 0) - (row.lkrOut ?? 0);
    row.lkrMargin = nullIfZero(running);
  }
  broughtForward.lkrMargin = nullIfZero(running);
}

function computeCumulativeLkrMarginFromLogs(
  logs: LedgerLog[],
  cost: number,
  basePrice: number,
): number {
  const logsByDay = groupLogsByDay(logs);
  const sortedDays = [...logsByDay.keys()].sort();
  let margin = 0;
  for (const date of sortedDays) {
    const { stockIn, stockOut } = dayStockFlows(logsByDay.get(date)!);
    margin += stockOut * basePrice - stockIn * cost;
  }
  return margin;
}

function buildSingleProductLedger(
  fromDay: Date,
  toDay: Date,
  toEnd: Date,
  toLabel: string,
  cost: number,
  basePrice: number,
  currentRemaining: number,
  allLogsSinceFrom: LedgerLog[],
  logsBeforeFrom: LedgerLog[],
): BuiltLedger {
  const netChangeSinceFrom = allLogsSinceFrom.reduce((sum, log) => sum + log.qtyChange, 0);
  const openingStock = currentRemaining - netChangeSinceFrom;

  const logsInRange = allLogsSinceFrom.filter((log) => log.createdAt <= toEnd);
  const logsByDay = new Map<string, LedgerLog[]>();
  for (const log of logsInRange) {
    const key = formatDateKey(log.createdAt);
    if (!logsByDay.has(key)) logsByDay.set(key, []);
    logsByDay.get(key)!.push(log);
  }

  const dayKeys = enumerateDateKeys(fromDay, toDay);
  let running = openingStock;
  let runningLkrMargin = computeCumulativeLkrMarginFromLogs(logsBeforeFrom, cost, basePrice);
  const openingLkrMargin = runningLkrMargin;
  const rows: LedgerRow[] = [];

  for (let i = 0; i < dayKeys.length; i += 1) {
    const date = dayKeys[i];
    const dayLogs = logsByDay.get(date) ?? [];
    const { stockIn, stockOut } = dayStockFlows(dayLogs);
    const closing = running + stockIn - stockOut;
    const isFirstRow = i === 0;
    const lkrIn = stockOut * basePrice;
    const lkrOut = stockIn * cost;
    runningLkrMargin += lkrIn - lkrOut;

    rows.push({
      date,
      openStock: isFirstRow ? null : running,
      stockValue: isFirstRow ? null : running * cost,
      stockIn: nullIfZero(stockIn),
      stockOut: nullIfZero(stockOut),
      lkrIn: nullIfZero(lkrIn),
      lkrOut: nullIfZero(lkrOut),
      stockMargin: closing,
      closingValue: closing * cost,
      lkrMargin: nullIfZero(runningLkrMargin),
      discountTotal: null,
      batchNumbers: dayBatchNumbers(dayLogs),
      batches: [],
    });

    running = closing;
  }

  const openingDate = formatDateKey(addDays(fromDay, -1));

  return {
    opening: {
      date: openingDate,
      stock: openingStock,
      value: openingStock * cost,
      lkrMargin: nullIfZero(openingLkrMargin),
    },
    rows,
    broughtForward: {
      date: toLabel,
      stock: running,
      value: running * cost,
      lkrMargin: nullIfZero(runningLkrMargin),
    },
  };
}

function aggregateBuiltLedgers(ledgers: BuiltLedger[], fromDay: Date, toDay: Date, toLabel: string): BuiltLedger {
  const openingDate = formatDateKey(addDays(fromDay, -1));
  const dayKeys = enumerateDateKeys(fromDay, toDay);

  if (ledgers.length === 0) {
    return {
      opening: { date: openingDate, stock: 0, value: 0, lkrMargin: null },
      rows: dayKeys.map((date) => ({
        date,
        openStock: null,
        stockValue: null,
        stockIn: null,
        stockOut: null,
        lkrIn: null,
        lkrOut: null,
        stockMargin: 0,
        closingValue: 0,
        lkrMargin: null,
        discountTotal: null,
        batchNumbers: null,
        batches: [],
      })),
      broughtForward: { date: toLabel, stock: 0, value: 0, lkrMargin: null },
    };
  }

  const opening = {
    date: openingDate,
    stock: ledgers.reduce((sum, l) => sum + l.opening.stock, 0),
    value: ledgers.reduce((sum, l) => sum + l.opening.value, 0),
    lkrMargin: nullIfZero(ledgers.reduce((sum, l) => sum + (l.opening.lkrMargin ?? 0), 0)),
  };

  const rows: LedgerRow[] = dayKeys.map((date, i) => {
    const sumNullable = (pick: (row: LedgerRow) => number | null): number | null => {
      const values = ledgers.map((l) => pick(l.rows[i]));
      if (values.every((v) => v == null)) return null;
      return values.reduce((sum, v) => sum + (v ?? 0), 0);
    };

    const stockInTotal = ledgers.reduce((sum, l) => sum + (l.rows[i].stockIn ?? 0), 0);
    const stockOutTotal = ledgers.reduce((sum, l) => sum + (l.rows[i].stockOut ?? 0), 0);
    const lkrInTotal = ledgers.reduce((sum, l) => sum + (l.rows[i].lkrIn ?? 0), 0);
    const lkrOutTotal = ledgers.reduce((sum, l) => sum + (l.rows[i].lkrOut ?? 0), 0);

    return {
      date,
      openStock: sumNullable((row) => row.openStock),
      stockValue: sumNullable((row) => row.stockValue),
      stockIn: nullIfZero(stockInTotal),
      stockOut: nullIfZero(stockOutTotal),
      lkrIn: nullIfZero(lkrInTotal),
      lkrOut: nullIfZero(lkrOutTotal),
      stockMargin: ledgers.reduce((sum, l) => sum + l.rows[i].stockMargin, 0),
      closingValue: ledgers.reduce((sum, l) => sum + l.rows[i].closingValue, 0),
      lkrMargin: nullIfZero(ledgers.reduce((sum, l) => sum + (l.rows[i].lkrMargin ?? 0), 0)),
      discountTotal: null,
      batchNumbers: mergeLedgerBatchNumbers(ledgers.map((ledger) => ledger.rows[i])),
      batches: [],
    };
  });

  return {
    opening,
    rows,
    broughtForward: {
      date: toLabel,
      stock: ledgers.reduce((sum, l) => sum + l.broughtForward.stock, 0),
      value: ledgers.reduce((sum, l) => sum + l.broughtForward.value, 0),
      lkrMargin: nullIfZero(ledgers.reduce((sum, l) => sum + (l.broughtForward.lkrMargin ?? 0), 0)),
    },
  };
}

export async function stockTopUp(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const { delta, note, storeId: bodyStoreId, weeklyBaseQty } = z.object({
      delta: z.number().int().optional(),
      note: z.string().optional(),
      storeId: z.string().optional(),
      weeklyBaseQty: z.number().int().positive().optional(),
    }).parse(req.body);

    const storeId = await resolveStoreId(req, bodyStoreId);
    const adminUserId = req.user?.sub;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);

    if (weeklyBaseQty !== undefined) {
      await setWeeklyBaseQty(storeId, productId, weeklyBaseQty, adminUserId);
    }

    let result = { weeklyBaseQty: weeklyBaseQty ?? 0, weeklyRemainingQty: 0 };
    if (delta !== undefined && delta !== 0) {
      result = await manualTopUp(storeId, productId, delta, adminUserId, note);
    } else if (weeklyBaseQty !== undefined) {
      const row = await prisma.storeProduct.findUnique({
        where: { storeId_productId: { storeId, productId } },
        select: { weeklyBaseQty: true, weeklyRemainingQty: true },
      });
      if (row) result = row;
    } else {
      throw new AppError('Provide delta or weeklyBaseQty', 400);
    }

    return success(res, { productId, storeId, ...result });
  } catch (err) {
    next(err);
  }
}

export async function stockWeeklyReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, from, to } = z.object({
      storeId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);
    const { fromDate, toDate } = parseDateRange(from, to);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, city: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const inventory = await prisma.storeProduct.findMany({
      where: { storeId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            category: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });

    const productIds = inventory.map((r) => r.productId);
    const auditWhere = {
      storeId,
      productId: { in: productIds },
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const auditLogs = productIds.length
      ? await prisma.stockAuditLog.findMany({
          where: auditWhere,
          orderBy: { createdAt: 'desc' },
          include: {
            adminUser: { select: { id: true, name: true } },
          },
        })
      : [];

    const logsByProduct = new Map<string, typeof auditLogs>();
    for (const log of auditLogs) {
      if (!logsByProduct.has(log.productId)) logsByProduct.set(log.productId, []);
      logsByProduct.get(log.productId)!.push(log);
    }

    const items = inventory.map((row) => {
      const logs = logsByProduct.get(row.productId) ?? [];
      const sold = logs
        .filter((l) => l.changeType === 'ORDER_DEDUCTION')
        .reduce((sum, l) => sum + Math.abs(l.qtyChange), 0);
      const restored = logs
        .filter((l) => l.changeType === 'ORDER_RESTORATION')
        .reduce((sum, l) => sum + l.qtyChange, 0);
      const manualAdjustments = logs.filter((l) => l.changeType === 'MANUAL_ADJUSTMENT');
      const lowStockHits = logs.filter(
        (l) =>
          l.changeType === 'ORDER_DEDUCTION' &&
          l.qtyAfter <= LOW_STOCK_THRESHOLD &&
          l.qtyBefore > LOW_STOCK_THRESHOLD,
      );
      const depletionHits = logs.filter(
        (l) =>
          l.changeType === 'ORDER_DEDUCTION' &&
          l.qtyAfter <= OUT_OF_STOCK_THRESHOLD &&
          l.qtyBefore > OUT_OF_STOCK_THRESHOLD,
      );

      return {
        productId: row.productId,
        name: row.product.name,
        imageUrl: normalizeProductImageUrl(row.product.imageUrl),
        category: row.product.category,
        weeklyBaseQty: row.weeklyBaseQty,
        weeklyRemainingQty: row.weeklyRemainingQty,
        sold: sold - restored,
        remaining: row.weeklyRemainingQty,
        weekResetAt: null,
        isLowStock: isLowStock(row.weeklyRemainingQty),
        isOutOfStock: isOutOfStockByQty(row.weeklyRemainingQty) || !row.isAvailable,
        restockHistory: logs
          .filter(
            (l) =>
              l.changeType === 'MANUAL_ADJUSTMENT'
              || l.changeType === 'WEEKLY_RESET'
              || l.changeType === 'BATCH_RECEIVED'
              || l.changeType === 'BATCH_ADJUSTMENT',
          )
          .map((l) => ({
            createdAt: l.createdAt,
            qtyChange: l.qtyChange,
            note: l.note,
            adminUserId: l.adminUserId,
            adminUserName: l.adminUserName ?? l.adminUser?.name ?? null,
          })),
        lowStockHits,
        depletionHits,
      };
    });

    return success(res, {
      store,
      from: fromDate?.toISOString() ?? null,
      to: toDate?.toISOString() ?? null,
      items,
    });
  } catch (err) {
    next(err);
  }
}

export async function stockAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      storeId: queryStoreId,
      productId,
      changeType,
      from,
      to,
      page,
      limit,
    } = z.object({
      storeId: z.string().optional(),
      productId: z.string().optional(),
      changeType: z.enum([
        'ORDER_DEDUCTION',
        'ORDER_RESTORATION',
        'MANUAL_ADJUSTMENT',
        'WEEKLY_RESET',
        'BATCH_RECEIVED',
        'BATCH_ADJUSTMENT',
        'WASTAGE',
        'EXPIRY_WRITE_OFF',
      ]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().positive().max(200).optional().default(50),
    }).parse(req.query);

    const storeId = queryStoreId
      ? await resolveStoreId(req, queryStoreId)
      : req.user?.role === 'STORE_MANAGER' || req.user?.role === 'CASHIER'
        ? await resolveStoreId(req)
        : undefined;

    const { fromDate, toDate } = parseDateRange(from, to);
    const skip = (page - 1) * limit;

    const where = {
      ...(storeId ? { storeId } : {}),
      ...(productId ? { productId } : {}),
      ...(changeType ? { changeType } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.stockAuditLog.findMany({
        where,
        include: {
          adminUser: { select: { id: true, name: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.stockAuditLog.count({ where }),
    ]);

    const productIds = [...new Set(logs.map((log) => log.productId))];
    const storeIds = [...new Set(logs.map((log) => log.storeId))];

    const [products, stores] = await Promise.all([
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
      storeIds.length
        ? prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));

    return success(res, {
      logs: logs.map((log) => ({
        id: log.id,
        storeId: log.storeId,
        storeName: storeMap.get(log.storeId) ?? 'Unknown branch',
        productId: log.productId,
        productName: productMap.get(log.productId) ?? 'Unknown product',
        changeType: log.changeType,
        qtyBefore: log.qtyBefore,
        qtyChange: log.qtyChange,
        qtyAfter: log.qtyAfter,
        orderId: log.orderId,
        orderNumber: log.order?.orderNumber ?? null,
        adminUserId: log.adminUserId,
        adminUserName: log.adminUserName ?? log.adminUser?.name ?? null,
        note: log.note,
        createdAt: log.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function stockMovementLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, productId, from, to } = z.object({
      storeId: z.string().optional(),
      productId: z.string().optional(),
      from: z.string(),
      to: z.string(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);
    const fromDay = parseLocalDate(from);
    const toDay = parseLocalDate(to);
    if (fromDay > toDay) throw new AppError('from must be on or before to', 400);

    const toEnd = new Date(toDay);
    toEnd.setHours(23, 59, 59, 999);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    if (productId) {
      const [product, storeProduct] = await Promise.all([
        prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, cost: true, basePrice: true },
        }),
        prisma.storeProduct.findUnique({
          where: { storeId_productId: { storeId, productId } },
          select: { weeklyRemainingQty: true },
        }),
      ]);

      if (!product) throw new AppError('Product not found', 404);

      const [allLogsSinceFrom, logsBeforeFrom] = await Promise.all([
        prisma.stockAuditLog.findMany({
          where: { storeId, productId, createdAt: { gte: fromDay } },
          orderBy: { createdAt: 'asc' },
          select: {
            qtyChange: true,
            createdAt: true,
            batchId: true,
          },
        }),
        prisma.stockAuditLog.findMany({
          where: { storeId, productId, createdAt: { lt: fromDay } },
          orderBy: { createdAt: 'asc' },
          select: { qtyChange: true, createdAt: true },
        }),
      ]);

      const batchIds = [...new Set(allLogsSinceFrom.map((log) => log.batchId).filter(Boolean) as string[])];
      const batchNumbers = batchIds.length
        ? await prisma.stockBatch.findMany({
            where: { id: { in: batchIds } },
            select: { id: true, batchNumber: true },
          })
        : [];
      const batchNumberMap = new Map(batchNumbers.map((batch) => [batch.id, batch.batchNumber]));

      const mapLedgerLog = (log: {
        qtyChange: number;
        createdAt: Date;
        batchId?: string | null;
      }): LedgerLog => ({
        qtyChange: log.qtyChange,
        createdAt: log.createdAt,
        batchNumber: log.batchId ? batchNumberMap.get(log.batchId) ?? null : null,
      });

      const built = buildSingleProductLedger(
        fromDay,
        toDay,
        toEnd,
        to,
        product.cost,
        product.basePrice,
        storeProduct?.weeklyRemainingQty ?? 0,
        allLogsSinceFrom.map(mapLedgerLog),
        logsBeforeFrom,
      );

      const [batchesByDay, salesMetrics] = await Promise.all([
        fetchLedgerDayBatches(storeId, fromDay, toEnd, productId),
        fetchDailySalesMetrics(storeId, fromDay, toEnd, productId),
      ]);
      built.rows = attachSalesMetricsToLedgerRows(
        attachBatchesToLedgerRows(built.rows, batchesByDay),
        salesMetrics.discounts,
        salesMetrics.lkrIn,
      );
      recalculateLkrMargin(built.opening, built.rows, built.broughtForward);

      return success(res, {
        store,
        product: {
          id: product.id,
          name: product.name,
          cost: product.cost,
          basePrice: product.basePrice,
        },
        from,
        to,
        ...built,
      });
    }

    const inventoryRows = await prisma.storeProduct.findMany({
      where: { storeId },
      select: {
        productId: true,
        weeklyRemainingQty: true,
      },
    });

    const productIds = inventoryRows.map((row) => row.productId);
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, cost: true, basePrice: true },
        })
      : [];
    const productMap = new Map(products.map((product) => [product.id, product]));

    const inventory = inventoryRows
      .map((row) => {
        const product = productMap.get(row.productId);
        if (!product) return null;
        return {
          productId: row.productId,
          weeklyRemainingQty: row.weeklyRemainingQty,
          product,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const inventoryProductIds = inventory.map((row) => row.productId);
    const [allLogsSinceFrom, logsBeforeFrom] = await Promise.all([
      inventoryProductIds.length
        ? prisma.stockAuditLog.findMany({
            where: { storeId, productId: { in: inventoryProductIds }, createdAt: { gte: fromDay } },
            orderBy: { createdAt: 'asc' },
            select: {
              productId: true,
              qtyChange: true,
              createdAt: true,
              batchId: true,
            },
          })
        : Promise.resolve([] as {
            productId: string;
            qtyChange: number;
            createdAt: Date;
            batchId: string | null;
          }[]),
      inventoryProductIds.length
        ? prisma.stockAuditLog.findMany({
            where: { storeId, productId: { in: inventoryProductIds }, createdAt: { lt: fromDay } },
            orderBy: { createdAt: 'asc' },
            select: { productId: true, qtyChange: true, createdAt: true },
          })
        : Promise.resolve([] as { productId: string; qtyChange: number; createdAt: Date }[]),
    ]);

    const batchIds = [...new Set(allLogsSinceFrom.map((log) => log.batchId).filter(Boolean) as string[])];
    const batchNumbers = batchIds.length
      ? await prisma.stockBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, batchNumber: true },
        })
      : [];
    const batchNumberMap = new Map(batchNumbers.map((batch) => [batch.id, batch.batchNumber]));

    const logsByProduct = new Map<string, LedgerLog[]>();
    for (const log of allLogsSinceFrom) {
      if (!logsByProduct.has(log.productId)) logsByProduct.set(log.productId, []);
      logsByProduct.get(log.productId)!.push({
        qtyChange: log.qtyChange,
        createdAt: log.createdAt,
        batchNumber: log.batchId ? batchNumberMap.get(log.batchId) ?? null : null,
      });
    }

    const logsBeforeByProduct = new Map<string, LedgerLog[]>();
    for (const log of logsBeforeFrom) {
      if (!logsBeforeByProduct.has(log.productId)) logsBeforeByProduct.set(log.productId, []);
      logsBeforeByProduct.get(log.productId)!.push({ qtyChange: log.qtyChange, createdAt: log.createdAt });
    }

    const perProductLedgers = inventory.map((row) =>
      buildSingleProductLedger(
        fromDay,
        toDay,
        toEnd,
        to,
        row.product.cost,
        row.product.basePrice,
        row.weeklyRemainingQty,
        logsByProduct.get(row.productId) ?? [],
        logsBeforeByProduct.get(row.productId) ?? [],
      ),
    );

    const built = aggregateBuiltLedgers(perProductLedgers, fromDay, toDay, to);
    const [batchesByDay, salesMetrics] = await Promise.all([
      fetchLedgerDayBatches(storeId, fromDay, toEnd),
      fetchDailySalesMetrics(storeId, fromDay, toEnd),
    ]);
    built.rows = attachSalesMetricsToLedgerRows(
      attachBatchesToLedgerRows(built.rows, batchesByDay),
      salesMetrics.discounts,
      salesMetrics.lkrIn,
    );
    recalculateLkrMargin(built.opening, built.rows, built.broughtForward);

    return success(res, {
      store,
      product: {
        id: 'all',
        name: 'All Products',
        cost: 0,
        basePrice: 0,
      },
      from,
      to,
      ...built,
    });
  } catch (err) {
    next(err);
  }
}
