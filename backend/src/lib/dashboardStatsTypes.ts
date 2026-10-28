import type { PaidSalesScope } from './dashboardOrderAggregates';
import type { ChartRange } from './dashboardStatsDateRange';

export type DashboardPeriod = 'today' | 'month' | 'year' | 'custom';
export type DashboardStatsTier = 'all' | 'summary' | 'charts' | 'charts-wallet' | 'details';

export type DashboardStatsContext = {
  scope: { storeId?: string };
  isBranchAdmin: boolean;
  period: DashboardPeriod;
  from?: string;
  to?: string;
  now: Date;
  todayRange: { gte: Date; lte: Date };
  selectedRange: { gte: Date; lte: Date };
  periodWhere: { createdAt: { gte: Date; lte: Date } };
  monthlyChart: ChartRange;
  paidPeriodWhere: Record<string, unknown>;
  paidSalesScope: PaidSalesScope;
};
