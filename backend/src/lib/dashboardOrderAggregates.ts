import { Prisma } from '@prisma/client';
import { orderCommissionChannel } from './commission';
import { prisma } from './prisma';

export type PaidSalesScope = {
  storeId?: string;
  createdAtGte: Date;
  createdAtLte: Date;
};

export function paidSalesPrismaWhere(scope: PaidSalesScope) {
  return {
    paymentStatus: 'PAID' as const,
    status: { not: 'CANCELLED' as const },
    createdAt: { gte: scope.createdAtGte, lte: scope.createdAtLte },
    ...(scope.storeId ? { storeId: scope.storeId } : {}),
  };
}

function paidSalesSqlWhere(scope: PaidSalesScope): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`o."paymentStatus" = 'PAID'`,
    Prisma.sql`o."status" <> 'CANCELLED'`,
    Prisma.sql`o."createdAt" >= ${scope.createdAtGte}`,
    Prisma.sql`o."createdAt" <= ${scope.createdAtLte}`,
  ];
  if (scope.storeId) {
    parts.push(Prisma.sql`o."storeId" = ${scope.storeId}`);
  }
  return Prisma.join(parts, ' AND ');
}

type AddonPaymentRow = {
  payment_method: string | null;
  amount_cents: bigint | number | null;
};

async function loadAddonPaymentsByMethod(scope: PaidSalesScope): Promise<AddonPaymentRow[]> {
  return prisma.$queryRaw<AddonPaymentRow[]>`
    SELECT wt."paymentMethod" AS payment_method,
           COALESCE(SUM(wt.amount), 0) AS amount_cents
    FROM wallet_transactions wt
    INNER JOIN orders o ON o.id = wt."orderId"
    WHERE wt.type = 'ORDER_ADDON_PAYMENT'
      AND ${paidSalesSqlWhere(scope)}
    GROUP BY wt."paymentMethod"
  `;
}

function applyAddonPaymentsToPickupCashAndCard(
  addonRows: AddonPaymentRow[],
  add: (cash: number, card: number) => void,
): void {
  for (const row of addonRows) {
    const addonAmount = Number(row.amount_cents ?? 0) / 100;
    if (addonAmount <= 0) continue;
    const method = row.payment_method ?? 'CASH_AT_COUNTER';
    if (method === 'CARD' || method === 'LOYALTY_POINTS') {
      add(0, addonAmount);
    } else {
      add(addonAmount, 0);
    }
  }
}

/** Matches chartBucketKey day/month keys using the Node server local calendar date. */
function bucketKeySql(granularity: 'day' | 'month'): Prisma.Sql {
  if (granularity === 'day') {
    return Prisma.sql`to_char(o."createdAt", 'YYYY-MM-DD')`;
  }
  return Prisma.sql`to_char(o."createdAt", 'YYYY-MM')`;
}

export async function aggregatePaidRevenueByBucket(
  scope: PaidSalesScope,
  granularity: 'day' | 'month',
): Promise<Map<string, { revenue: number; orders: number }>> {
  const bucketExpr = bucketKeySql(granularity);
  const rows = await prisma.$queryRaw<
    Array<{ bucket: string; revenue: bigint | number | null; orders: bigint | number }>
  >`
    SELECT ${bucketExpr} AS bucket,
           COALESCE(SUM(o."total"), 0) AS revenue,
           COUNT(*)::bigint AS orders
    FROM orders o
    WHERE ${paidSalesSqlWhere(scope)}
    GROUP BY 1
  `;
  const map = new Map<string, { revenue: number; orders: number }>();
  for (const row of rows) {
    map.set(row.bucket, {
      revenue: Number(row.revenue ?? 0),
      orders: Number(row.orders ?? 0),
    });
  }
  return map;
}

export async function aggregateSalesOverviewByBucket(
  scope: PaidSalesScope,
  granularity: 'day' | 'month',
): Promise<Map<string, { revenue: number; orders: number; discount: number }>> {
  const bucketExpr = bucketKeySql(granularity);
  const rows = await prisma.$queryRaw<
    Array<{
      bucket: string;
      revenue: bigint | number | null;
      orders: bigint | number;
      discount: bigint | number | null;
    }>
  >`
    SELECT ${bucketExpr} AS bucket,
           COALESCE(SUM(o."total"), 0) AS revenue,
           COUNT(*)::bigint AS orders,
           COALESCE(SUM(o."discount" + o."loyaltyDiscount"), 0) AS discount
    FROM orders o
    WHERE ${paidSalesSqlWhere(scope)}
    GROUP BY 1
  `;
  const map = new Map<string, { revenue: number; orders: number; discount: number }>();
  for (const row of rows) {
    map.set(row.bucket, {
      revenue: Number(row.revenue ?? 0),
      orders: Number(row.orders ?? 0),
      discount: Number(row.discount ?? 0),
    });
  }
  return map;
}

const COLOMBO_SHIFT = Prisma.sql`o."createdAt" + interval '5 hours 30 minutes'`;

export type HourlySalesAggregate = {
  peakHours: Array<{ hour: number; label: string; orders: number; revenue: number }>;
  hourlyHeatmap: Array<{ day: number; hour: number; orders: number; revenue: number }>;
};

function formatHourLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export async function aggregateHourlySales(scope: PaidSalesScope): Promise<HourlySalesAggregate> {
  const rows = await prisma.$queryRaw<
    Array<{
      hour: number;
      day: number;
      orders: bigint | number;
      revenue: bigint | number | null;
    }>
  >`
    SELECT
      EXTRACT(HOUR FROM ${COLOMBO_SHIFT})::int AS hour,
      EXTRACT(DOW FROM ${COLOMBO_SHIFT})::int AS day,
      COUNT(*)::bigint AS orders,
      COALESCE(SUM(o."total"), 0) AS revenue
    FROM orders o
    WHERE ${paidSalesSqlWhere(scope)}
    GROUP BY 1, 2
  `;

  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    orders: 0,
    revenue: 0,
  }));
  const heatmapCells = Array.from({ length: 7 * 24 }, (_, index) => ({
    day: Math.floor(index / 24),
    hour: index % 24,
    orders: 0,
    revenue: 0,
  }));

  for (const row of rows) {
    const hour = Number(row.hour);
    const day = Number(row.day);
    const orders = Number(row.orders ?? 0);
    const revenue = Number(row.revenue ?? 0);
    if (hour >= 0 && hour < 24) {
      peakHours[hour].orders += orders;
      peakHours[hour].revenue += revenue;
    }
    if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
      const cell = heatmapCells[day * 24 + hour];
      cell.orders += orders;
      cell.revenue += revenue;
    }
  }

  return { peakHours, hourlyHeatmap: heatmapCells };
}

type ChannelGroupRow = {
  orderMode: string;
  paymentMethod: string;
  /** CARD pickup paid through an online gateway, not collected as a counter card. */
  onlineCard: boolean;
  totalSum: number;
  addonSum: number;
  subtotalSum: number;
  discountSum: number;
  loyaltyDiscountSum: number;
  deliveryFeeSum: number;
  convenientFeeSum: number;
  deliveryItemSalesSum: number;
  orderCount: number;
};

async function loadChannelGroupRows(scope: PaidSalesScope): Promise<ChannelGroupRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      orderMode: string;
      paymentMethod: string;
      onlineCard: boolean | null;
      total_sum: bigint | number | null;
      addon_sum: bigint | number | null;
      subtotal_sum: bigint | number | null;
      discount_sum: bigint | number | null;
      loyalty_discount_sum: bigint | number | null;
      delivery_fee_sum: bigint | number | null;
      convenient_fee_sum: bigint | number | null;
      delivery_item_sales_sum: bigint | number | null;
      order_count: bigint | number;
    }>
  >`
    SELECT
      o."orderMode" AS "orderMode",
      o."paymentMethod" AS "paymentMethod",
      (
        o."paymentMethod" = 'CARD'
        AND (
          o."paymentGateway" IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(o."paymentRef", '')), '') IS NOT NULL
        )
      ) AS "onlineCard",
      COALESCE(SUM(o."total"), 0) AS total_sum,
      COALESCE(SUM(COALESCE(addon.addon_cents, 0)), 0) AS addon_sum,
      COALESCE(SUM(o."subtotal"), 0) AS subtotal_sum,
      COALESCE(SUM(o."discount"), 0) AS discount_sum,
      COALESCE(SUM(o."loyaltyDiscount"), 0) AS loyalty_discount_sum,
      COALESCE(SUM(o."deliveryFee"), 0) AS delivery_fee_sum,
      COALESCE(SUM(o."convenientFee"), 0) AS convenient_fee_sum,
      COALESCE(
        SUM(
          CASE
            WHEN o."orderMode" = 'DELIVERY'
              AND o."paymentMethod" IN ('CARD', 'PAYHERE', 'LOYALTY_POINTS')
            THEN GREATEST(0, o."subtotal" - o."discount" - o."loyaltyDiscount")
            ELSE 0
          END
        ),
        0
      ) AS delivery_item_sales_sum,
      COUNT(*)::bigint AS order_count
    FROM orders o
    LEFT JOIN (
      SELECT "orderId", SUM(amount) AS addon_cents
      FROM wallet_transactions
      WHERE type = 'ORDER_ADDON_PAYMENT' AND "orderId" IS NOT NULL
      GROUP BY "orderId"
    ) addon ON addon."orderId" = o.id
    WHERE ${paidSalesSqlWhere(scope)}
    GROUP BY o."orderMode", o."paymentMethod", "onlineCard"
  `;

  return rows.map((row) => ({
    orderMode: row.orderMode,
    paymentMethod: row.paymentMethod,
    onlineCard: row.onlineCard === true,
    totalSum: Number(row.total_sum ?? 0),
    addonSum: Number(row.addon_sum ?? 0) / 100,
    subtotalSum: Number(row.subtotal_sum ?? 0),
    discountSum: Number(row.discount_sum ?? 0),
    loyaltyDiscountSum: Number(row.loyalty_discount_sum ?? 0),
    deliveryFeeSum: Number(row.delivery_fee_sum ?? 0),
    convenientFeeSum: Number(row.convenient_fee_sum ?? 0),
    deliveryItemSalesSum: Number(row.delivery_item_sales_sum ?? 0),
    orderCount: Number(row.order_count ?? 0),
  }));
}

export async function summarizeRevenueChannelsForScope(scope: PaidSalesScope) {
  const groups = await loadChannelGroupRows(scope);
  let pickupCash = 0;
  let pickupCard = 0;
  let pickupOnline = 0;
  let deliveryCard = 0;

  for (const group of groups) {
    const primaryAmount = group.totalSum - group.addonSum;
    const channel = orderCommissionChannel(group.orderMode, group.paymentMethod, {
      onlineCard: group.onlineCard,
    });
    if (channel === 'pickupCash' && primaryAmount > 0) {
      pickupCash += primaryAmount;
    } else if (channel === 'pickupOnline' && primaryAmount > 0) {
      pickupOnline += primaryAmount;
    } else if (channel === 'pickupCard' && primaryAmount > 0) {
      pickupCard += primaryAmount;
    } else if (channel === 'deliveryOnline') {
      deliveryCard += group.totalSum;
    }
  }

  const addonRows = await loadAddonPaymentsByMethod(scope);
  applyAddonPaymentsToPickupCashAndCard(addonRows, (cash, card) => {
    pickupCash += cash;
    pickupCard += card;
  });

  return { pickupCash, pickupCard, pickupOnline, deliveryCard };
}

export type PaymentChannelTotals = {
  pickupCashTotal: number;
  pickupCashCount: number;
  pickupCardTotal: number;
  pickupCardCount: number;
  pickupOnlineTotal: number;
  pickupOnlineCount: number;
  deliveryOnlineTotal: number;
  deliveryOnlineCount: number;
};

export async function summarizePaymentChannelBreakdownForScope(
  scope: PaidSalesScope,
): Promise<PaymentChannelTotals> {
  const groups = await loadChannelGroupRows(scope);
  const addonRows = await loadAddonPaymentsByMethod(scope);

  const totals: PaymentChannelTotals = {
    pickupCashTotal: 0,
    pickupCashCount: 0,
    pickupCardTotal: 0,
    pickupCardCount: 0,
    pickupOnlineTotal: 0,
    pickupOnlineCount: 0,
    deliveryOnlineTotal: 0,
    deliveryOnlineCount: 0,
  };

  for (const group of groups) {
    const primaryAmount = group.totalSum - group.addonSum;
    const primaryChannel = orderCommissionChannel(group.orderMode, group.paymentMethod, {
      onlineCard: group.onlineCard,
    });
    if (primaryChannel === 'pickupCash' && primaryAmount > 0) {
      totals.pickupCashTotal += primaryAmount;
      totals.pickupCashCount += group.orderCount;
    } else if (primaryChannel === 'pickupCard' && primaryAmount > 0) {
      totals.pickupCardTotal += primaryAmount;
      totals.pickupCardCount += group.orderCount;
    } else if (primaryChannel === 'pickupOnline' && primaryAmount > 0) {
      totals.pickupOnlineTotal += primaryAmount;
      totals.pickupOnlineCount += group.orderCount;
    } else if (primaryChannel === 'deliveryOnline') {
      totals.deliveryOnlineTotal += group.deliveryItemSalesSum;
      totals.deliveryOnlineCount += group.orderCount;
    }
  }

  applyAddonPaymentsToPickupCashAndCard(addonRows, (cash, card) => {
    totals.pickupCashTotal += cash;
    totals.pickupCardTotal += card;
  });

  return totals;
}

/** Commissionable base per store|period key (UTC half-month periods). */
export async function aggregatePeriodBaseLookup(
  scope: PaidSalesScope,
): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<
    Array<{ store_id: string; period_key: string; base: bigint | number | null }>
  >`
    SELECT
      o."storeId" AS store_id,
      CONCAT(
        to_char(o."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM'),
        '-P',
        CASE
          WHEN EXTRACT(DAY FROM o."createdAt" AT TIME ZONE 'UTC') <= 15 THEN '1'
          ELSE '2'
        END
      ) AS period_key,
      COALESCE(
        SUM(
          CASE
            WHEN (
              (o."orderMode" = 'TAKEAWAY' AND o."paymentMethod" IN ('CASH_AT_COUNTER', 'PAYHERE', 'CARD', 'LOYALTY_POINTS'))
              OR (o."orderMode" = 'DELIVERY' AND o."paymentMethod" IN ('CARD', 'PAYHERE', 'LOYALTY_POINTS'))
            )
            THEN GREATEST(0, o."subtotal" - o."discount" - o."loyaltyDiscount")
            ELSE 0
          END
        ),
        0
      ) AS base
    FROM orders o
    WHERE o."paymentStatus" = 'PAID'
      AND o."createdAt" >= ${scope.createdAtGte}
      AND o."createdAt" <= ${scope.createdAtLte}
      ${scope.storeId ? Prisma.sql`AND o."storeId" = ${scope.storeId}` : Prisma.empty}
    GROUP BY 1, 2
  `;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[`${row.store_id}|${row.period_key}`] = Number(row.base ?? 0);
  }
  return result;
}

export type CategorySalesRow = {
  categoryId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export async function aggregateCategorySales(scope: PaidSalesScope): Promise<CategorySalesRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      category_id: string;
      category_name: string;
      quantity: bigint | number | null;
      revenue: bigint | number | null;
    }>
  >`
    SELECT
      p."categoryId" AS category_id,
      c.name AS category_name,
      COALESCE(SUM(oi.quantity), 0) AS quantity,
      COALESCE(SUM(oi."totalPrice"), 0) AS revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    INNER JOIN products p ON p.id = oi."productId"
    INNER JOIN categories c ON c.id = p."categoryId"
    WHERE ${paidSalesSqlWhere(scope)}
    GROUP BY p."categoryId", c.name
  `;

  return rows.map((row) => ({
    categoryId: row.category_id,
    name: row.category_name,
    quantity: Number(row.quantity ?? 0),
    revenue: Number(row.revenue ?? 0),
  }));
}
