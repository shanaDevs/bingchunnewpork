export type OrderSummaryChartPoint = {
  label: string;
  delivery: number;
  pickupCash: number;
  pickupOnline: number;
  pickupCard: number;
  /** Product sales in period (excludes delivery & convenience fees). */
  productSales?: number;
};

export type RefundByMonthRow = {
  month: string;
  count?: number;
  amountLkr: number;
};

export type DiscountByMonthRow = {
  month: string;
  totalDiscount: number;
};

export type SalesOverviewPoint = {
  period: string;
  revenue: number;
  outflow: number;
};

export type SalesVsDiscountPoint = {
  period: string;
  revenue: number;
  discount: number;
};

export type BranchGrossRevenueBreakdown = {
  productSales: number;
  delivery: number;
  convenience: number;
  other: number;
};

function sumOrderSummaryRevenue(point: OrderSummaryChartPoint, pickupOnly: boolean): number {
  if (typeof point.productSales === 'number') {
    return point.productSales;
  }
  return (
    (pickupOnly ? 0 : point.delivery) +
    point.pickupCash +
    point.pickupOnline +
    point.pickupCard
  );
}

/** Revenue vs refund outflow per chart period, with fees/refunds allocated across periods. */
export function buildBranchSalesOverviewPoints(input: {
  orderSummaryChart: OrderSummaryChartPoint[];
  refundByMonth: RefundByMonthRow[];
  commissionFee: number;
  gatewayFee: number;
  pickupOnly: boolean;
}): SalesOverviewPoint[] {
  const { orderSummaryChart, refundByMonth, commissionFee, gatewayFee, pickupOnly } = input;
  const refundByLabel = new Map(refundByMonth.map((row) => [row.month, row.amountLkr]));
  const periodFees = commissionFee + gatewayFee;

  const points = orderSummaryChart.map((point) => {
    const revenue = sumOrderSummaryRevenue(point, pickupOnly);
    return {
      period: point.label,
      revenue,
      outflow: refundByLabel.get(point.label) ?? 0,
    };
  });

  const totalRevenue = points.reduce((sum, point) => sum + point.revenue, 0);
  const matchedRefund = points.reduce((sum, point) => sum + point.outflow, 0);
  const totalRefund = refundByMonth.reduce((sum, row) => sum + row.amountLkr, 0);
  const unmatchedOutflow = Math.max(0, totalRefund - matchedRefund) + periodFees;

  if (totalRevenue <= 0) return points;

  return points.map((point) => ({
    ...point,
    outflow:
      point.outflow +
      (unmatchedOutflow > 0
        ? Math.round((point.revenue / totalRevenue) * unmatchedOutflow * 100) / 100
        : 0),
  }));
}

export function buildSalesVsDiscountSeries(
  salesOverview: SalesOverviewPoint[],
  discountsByMonth: DiscountByMonthRow[],
): SalesVsDiscountPoint[] {
  const discountByLabel = new Map(discountsByMonth.map((row) => [row.month, row.totalDiscount]));
  return salesOverview.map((point) => ({
    period: point.period,
    revenue: point.revenue,
    discount: discountByLabel.get(point.period) ?? 0,
  }));
}

export function branchProductGrossSales(kpi: {
  productGrossSales?: number;
  grossSales: number;
  totalDeliveryRevenue: number;
  totalConvenienceRevenue: number;
}): number {
  if (typeof kpi.productGrossSales === 'number') {
    return kpi.productGrossSales;
  }
  const gross = kpi.grossSales ?? 0;
  const delivery = kpi.totalDeliveryRevenue ?? 0;
  const convenience = kpi.totalConvenienceRevenue ?? 0;
  return Math.max(0, gross - delivery - convenience);
}

export function buildBranchGrossRevenueBreakdown(
  kpi: {
    productGrossSales?: number;
    grossSales: number;
    totalDeliveryRevenue: number;
    totalConvenienceRevenue: number;
  },
  pickupOnly: boolean,
): BranchGrossRevenueBreakdown {
  const productSales = branchProductGrossSales(kpi);
  const gross = kpi.grossSales ?? 0;
  const delivery = pickupOnly ? 0 : (kpi.totalDeliveryRevenue ?? 0);
  const convenience = kpi.totalConvenienceRevenue ?? 0;
  const other = Math.max(0, gross - productSales - delivery - convenience);
  return { productSales, delivery, convenience, other };
}
