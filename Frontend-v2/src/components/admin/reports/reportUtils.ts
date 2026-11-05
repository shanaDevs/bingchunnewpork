import { adminAuthHeaders } from '@/lib/adminSession';
import { format, startOfMonth } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type { DashboardPeriod } from '@/components/admin/DashboardPeriodFilter';
import { getApiBaseUrl } from '@/lib/apiBase';
import { formatDate as formatAppDate, formatDateTime as formatAppDateTime } from '@/lib/datetime';
import { formatBranchName } from '@/lib/deliveryDisplay';
import { formatOrderPaymentMethodLabel } from '@/lib/paymentMethodLabels';

export { ReportFooterTotalCell } from '@/components/admin/reports/ReportFooterTotalCell';

export function adminFetch<T = unknown>(endpoint: string): Promise<T> {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  })
    .then((r) => r.json())
    .then((d) => (d.data ?? d) as T);
}

export function formatLkr(amount: number) {
  return Number(amount || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDateShort(value?: string | Date | null) {
  if (!value) return '—';
  return formatAppDate(value);
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return formatAppDateTime(value, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function branchDisplayName(name?: string | null) {
  return formatBranchName(name);
}

/** When set, branch-scoped report pages hide the branch picker and force this store. */
export type LockedStoreReportProps = {
  lockedStoreId?: string;
  lockedStoreName?: string;
};

export function reportScopeLabel(opts: {
  storeId?: string;
  lockedStoreName?: string;
  stores?: Array<{ id: string; name: string }>;
}): string {
  if (opts.lockedStoreName) return branchDisplayName(opts.lockedStoreName);
  if (!opts.storeId) return 'All Branches';
  const match = opts.stores?.find((store) => store.id === opts.storeId);
  return match ? branchDisplayName(match.name) : 'Selected Branch';
}

export function buildPeriodQuery(
  period: DashboardPeriod | 'all',
  customRange?: DateRange,
): string {
  if (period === 'all') return 'period=all';
  if (period === 'custom' && customRange?.from && customRange?.to) {
    return `period=custom&from=${format(customRange.from, 'yyyy-MM-dd')}&to=${format(customRange.to, 'yyyy-MM-dd')}`;
  }
  return `period=${period === 'custom' ? 'month' : period}`;
}

/** Matches API default when report endpoints omit from/to (current calendar month). */
export function defaultReportMonthDateStrings(now = new Date()) {
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(now, 'yyyy-MM-dd'),
  };
}

export function buildDateQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function formatReportPeriodDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'd MMM yyyy');
}

/** Display-only label for from/to report filters. Does not affect queries. */
export function formatReportPeriodFromDates(
  from?: string,
  to?: string,
  emptyLabel = 'All time',
) {
  if (from && to) return `${formatReportPeriodDate(from)} – ${formatReportPeriodDate(to)}`;
  if (from) return `From ${formatReportPeriodDate(from)}`;
  if (to) return `Until ${formatReportPeriodDate(to)}`;
  return emptyLabel;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const body = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function paymentMethodLabel(method?: string) {
  return formatOrderPaymentMethodLabel(method);
}

export function orderModeLabel(mode?: string) {
  if (mode === 'DELIVERY') return 'Delivery';
  if (mode === 'TAKEAWAY') return 'Pickup';
  return mode || '—';
}

export function orderStatusLabel(status?: string) {
  const map: Record<string, string> = {
    RECEIVED: 'Pending',
    PREPARING: 'Preparing',
    READY: 'Ready for Pickup',
    OUT_FOR_DELIVERY: 'Dispatched',
    DELIVERED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return map[status ?? ''] ?? status ?? '—';
}
