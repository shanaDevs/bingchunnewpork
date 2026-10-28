import { AppError } from '../middleware/errorHandler';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type PromoDiscountUsageRow = {
  storeId: string;
  storeName: string;
  promoCode: string;
  promoCodeId: string | null;
  promoTitle: string | null;
  ownership: string;
  totalDiscountAmount: number;
  branchShareAmount: number;
  platformShareAmount: number;
  orderSubtotal: number;
};

export type BranchSalesRow = {
  storeId: string;
  storeName: string;
  orderCount: number;
  grossSales: number;
};

export type PromoDiscountMoneyRow = {
  usageCount: number;
  totalDiscount: number;
  branchShare: number;
  platformShare: number;
  orderSales: number;
  discountPct: number;
};

export type PromoDiscountPromoLine = PromoDiscountMoneyRow & {
  promoCode: string;
  promoCodeId: string | null;
  title: string | null;
  ownership: string;
};

export type PromoDiscountBranchLine = PromoDiscountMoneyRow & {
  storeId: string;
  storeName: string;
  orderCount: number;
  grossSales: number;
};

export type PromoDiscountTotals = PromoDiscountMoneyRow & {
  orderCount: number;
  grossSales: number;
};

export type PromoDiscountReport = {
  from: string;
  to: string;
  totals: PromoDiscountTotals;
  byBranch: Array<PromoDiscountBranchLine & { promos: PromoDiscountPromoLine[] }>;
  byPromo: Array<PromoDiscountPromoLine & { branches: PromoDiscountBranchLine[] }>;
};

export function parsePromoReportRange(from: string, to: string): { fromDate: Date; toDate: Date } {
  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to)) {
    throw new AppError('Invalid date format', 400);
  }
  if (from > to) {
    throw new AppError('Start date must be on or before end date', 400);
  }
  return {
    fromDate: new Date(`${from}T00:00:00.000+05:30`),
    toDate: new Date(`${to}T23:59:59.999+05:30`),
  };
}

export function discountPct(discount: number, sales: number): number {
  if (sales <= 0) return 0;
  return Math.round((discount / sales) * 10000) / 100;
}

function emptyMoney(): Omit<PromoDiscountMoneyRow, 'discountPct'> {
  return { usageCount: 0, totalDiscount: 0, branchShare: 0, platformShare: 0, orderSales: 0 };
}

function withPct(
  row: Omit<PromoDiscountMoneyRow, 'discountPct'>,
  sales: number,
): PromoDiscountMoneyRow {
  return { ...row, discountPct: discountPct(row.totalDiscount, sales) };
}

function withPctPreserve<T extends Omit<PromoDiscountMoneyRow, 'discountPct'>>(
  row: T,
  sales: number,
): T & { discountPct: number } {
  return { ...row, discountPct: discountPct(row.totalDiscount, sales) };
}

function addUsage(target: Omit<PromoDiscountMoneyRow, 'discountPct'>, usage: PromoDiscountUsageRow) {
  target.usageCount += 1;
  target.totalDiscount += usage.totalDiscountAmount;
  target.branchShare += usage.branchShareAmount;
  target.platformShare += usage.platformShareAmount;
  target.orderSales += usage.orderSubtotal;
}

function normalizeOwnership(ownership: string | null | undefined): string {
  const normalized = (ownership ?? 'PLATFORM').toUpperCase();
  if (normalized === 'BRANCH' || normalized === 'SHARED' || normalized === 'PLATFORM') {
    return normalized;
  }
  return 'PLATFORM';
}

function promoKey(usage: PromoDiscountUsageRow): string {
  return usage.promoCodeId || `code:${usage.promoCode}`;
}

export function buildPromoDiscountReport(
  usages: PromoDiscountUsageRow[],
  from: string,
  to: string,
  branchSales: BranchSalesRow[] = [],
): PromoDiscountReport {
  const totalsMoney = emptyMoney();
  const branchMap = new Map<
    string,
    PromoDiscountBranchLine & { promoMap: Map<string, PromoDiscountPromoLine> }
  >();
  const promoMap = new Map<
    string,
    PromoDiscountPromoLine & { branchMap: Map<string, PromoDiscountBranchLine> }
  >();

  function ensureBranch(storeId: string, storeName: string) {
    let branch = branchMap.get(storeId);
    if (!branch) {
      branch = {
        storeId,
        storeName,
        orderCount: 0,
        grossSales: 0,
        ...emptyMoney(),
        discountPct: 0,
        promoMap: new Map(),
      };
      branchMap.set(storeId, branch);
    }
    return branch;
  }

  for (const sale of branchSales) {
    const branch = ensureBranch(sale.storeId, sale.storeName);
    branch.orderCount = sale.orderCount;
    branch.grossSales = sale.grossSales;
    if (sale.storeName) branch.storeName = sale.storeName;
  }

  for (const usage of usages) {
    addUsage(totalsMoney, usage);
    const ownership = normalizeOwnership(usage.ownership);
    const pKey = promoKey(usage);

    const branch = ensureBranch(usage.storeId, usage.storeName);
    addUsage(branch, usage);
    let branchPromo = branch.promoMap.get(pKey);
    if (!branchPromo) {
      branchPromo = {
        promoCode: usage.promoCode,
        promoCodeId: usage.promoCodeId,
        title: usage.promoTitle,
        ownership,
        ...emptyMoney(),
        discountPct: 0,
      };
      branch.promoMap.set(pKey, branchPromo);
    }
    addUsage(branchPromo, usage);
    if (!branchPromo.title && usage.promoTitle) branchPromo.title = usage.promoTitle;

    let promo = promoMap.get(pKey);
    if (!promo) {
      promo = {
        promoCode: usage.promoCode,
        promoCodeId: usage.promoCodeId,
        title: usage.promoTitle,
        ownership,
        ...emptyMoney(),
        discountPct: 0,
        branchMap: new Map(),
      };
      promoMap.set(pKey, promo);
    }
    addUsage(promo, usage);
    if (!promo.title && usage.promoTitle) promo.title = usage.promoTitle;
    let promoBranch = promo.branchMap.get(usage.storeId);
    if (!promoBranch) {
      promoBranch = {
        storeId: usage.storeId,
        storeName: usage.storeName,
        orderCount: 0,
        grossSales: 0,
        ...emptyMoney(),
        discountPct: 0,
      };
      promo.branchMap.set(usage.storeId, promoBranch);
    }
    addUsage(promoBranch, usage);
  }

  let totalOrderCount = 0;
  let totalGrossSales = 0;
  for (const branch of branchMap.values()) {
    totalOrderCount += branch.orderCount;
    totalGrossSales += branch.grossSales;
  }

  const byBranch = Array.from(branchMap.values())
    .map(({ promoMap: nested, ...row }) => ({
      ...withPctPreserve(row, row.grossSales),
      promos: Array.from(nested.values())
        .map((promo) => withPctPreserve(promo, promo.orderSales))
        .sort((a, b) => b.totalDiscount - a.totalDiscount),
    }))
    .sort(
      (a, b) =>
        b.grossSales - a.grossSales
        || b.totalDiscount - a.totalDiscount
        || a.storeName.localeCompare(b.storeName),
    );

  const byPromo = Array.from(promoMap.values())
    .map(({ branchMap: nested, ...row }) => ({
      ...withPctPreserve(row, row.orderSales),
      branches: Array.from(nested.values())
        .map((branch) => withPctPreserve(branch, branch.orderSales))
        .sort((a, b) => b.totalDiscount - a.totalDiscount),
    }))
    .sort((a, b) => b.totalDiscount - a.totalDiscount || a.promoCode.localeCompare(b.promoCode));

  return {
    from,
    to,
    totals: {
      ...withPct(totalsMoney, totalGrossSales),
      orderCount: totalOrderCount,
      grossSales: totalGrossSales,
    },
    byBranch,
    byPromo,
  };
}
