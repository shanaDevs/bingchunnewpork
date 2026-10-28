import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import type { DashboardPeriod } from '@/components/admin/DashboardPeriodFilter';

export { adminFetch } from '@/components/admin/reports/reportUtils';

function applyPeriodParams(
  params: URLSearchParams,
  period: DashboardPeriod,
  customRange?: DateRange,
) {
  params.set('period', period);
  if (period === 'custom' && customRange?.from && customRange?.to) {
    params.set('from', format(customRange.from, 'yyyy-MM-dd'));
    params.set('to', format(customRange.to, 'yyyy-MM-dd'));
  }
}

export function buildBrandAnalyticsUrl(
  period: DashboardPeriod,
  customRange?: DateRange,
  storeId?: string,
): string {
  const params = new URLSearchParams();
  applyPeriodParams(params, period, customRange);
  if (storeId) params.set('storeId', storeId);
  return `/admin/reports/brand-analytics?${params.toString()}`;
}

export function buildTierAnalyticsUrl(
  tier: 'top' | 'standard',
  period: DashboardPeriod,
  customRange?: DateRange,
  storeId?: string,
): string {
  const params = new URLSearchParams();
  params.set('tier', tier);
  applyPeriodParams(params, period, customRange);
  if (storeId) params.set('storeId', storeId);
  return `/admin/reports/branch-tier-analytics?${params.toString()}`;
}

export function buildBrandBranchPerformanceUrl(
  period: DashboardPeriod,
  customRange?: DateRange,
): string {
  const params = new URLSearchParams();
  applyPeriodParams(params, period, customRange);
  return `/admin/reports/brand-branch-performance?${params.toString()}`;
}

export function buildTopBranchesChannelBreakdownUrl(
  period: DashboardPeriod,
  customRange?: DateRange,
  tier?: 'all' | 'top' | 'standard',
): string {
  const params = new URLSearchParams();
  applyPeriodParams(params, period, customRange);
  if (tier && tier !== 'all') params.set('tier', tier);
  return `/admin/reports/top-branches-channel-breakdown?${params.toString()}`;
}

export function buildHourlyPeakHeatmapUrl(
  tier: 'top' | 'standard',
  monthKey: string,
  storeId?: string,
): string {
  const [year, month] = monthKey.split('-').map(Number);
  const from = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
  const to = format(new Date(year, month, 0), 'yyyy-MM-dd');
  const params = new URLSearchParams();
  params.set('tier', tier);
  params.set('period', 'custom');
  params.set('from', from);
  params.set('to', to);
  if (storeId) params.set('storeId', storeId);
  return `/admin/reports/hourly-peak-heatmap?${params.toString()}`;
}

export function buildMonthlyDeliveryOrdersUrl(tier: 'top' | 'standard', year: number): string {
  const params = new URLSearchParams();
  params.set('tier', tier);
  params.set('year', String(year));
  return `/admin/reports/monthly-delivery-orders?${params.toString()}`;
}

export function buildTopCustomersUrl(
  period: DashboardPeriod,
  customRange?: DateRange,
  storeId?: string,
): string {
  const params = new URLSearchParams();
  applyPeriodParams(params, period, customRange);
  if (storeId) params.set('storeId', storeId);
  return `/admin/reports/top-customers?${params.toString()}`;
}
