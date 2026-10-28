'use client';

import { CircleDollarSign, TrendingUp } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import {
  type RevenueChannelKey,
  type RevenueChannels,
} from '@/components/admin/BranchRevenueBreakdownDonut';
import { KPI_LIGHT, brandKpiCardStyle } from '@/lib/dashboardTheme';
import { formatMoney } from '@/lib/receipt';

type Props = {
  channels: RevenueChannels | null | undefined;
  totalRevenue?: number | null;
  paidOrderCount?: number | null;
  loading?: boolean;
  /** Neutral card surface without accent tint (branch admin dashboard). */
  plain?: boolean;
  /** Hide delivery online channel for pickup-only branches. */
  hideDelivery?: boolean;
};

const CHANNELS: Array<{ key: RevenueChannelKey; label: string }> = [
  { key: 'pickupCash', label: 'Pickup Cash' },
  { key: 'pickupCard', label: 'Pickup Card' },
  { key: 'pickupOnline', label: 'Pickup Online' },
  { key: 'deliveryCard', label: 'Delivery Online' },
];

const theme = KPI_LIGHT.green;

function fmtChannelAmount(n: number) {
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardRevenueChannels({
  channels,
  totalRevenue,
  paidOrderCount,
  loading,
  plain = false,
  hideDelivery = false,
}: Props) {
  const total = totalRevenue ?? 0;
  const paidCount = paidOrderCount ?? 0;
  const visibleChannels = hideDelivery
    ? CHANNELS.filter((channel) => channel.key !== 'deliveryCard')
    : CHANNELS;

  return (
    <div
      className={`brand-kpi-card mb-5 overflow-hidden rounded-2xl${plain ? ' brand-kpi-card--plain border' : ''}`}
      style={plain ? undefined : brandKpiCardStyle(theme)}
    >
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="relative flex flex-1 flex-col justify-center gap-3 p-5 sm:p-6 lg:max-w-[40%]">
          <BrandKpiCardHeader icon={CircleDollarSign} theme={theme} title="Total Revenue" />
          <p className="text-2xl font-bold tracking-tight text-fg sm:text-[1.75rem]">
            {loading ? '…' : formatMoney(total)}
          </p>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <TrendingUp size={14} style={{ color: theme.accent }} />
            <span>
              {loading
                ? '…'
                : `${paidCount.toLocaleString('en-LK')} paid order${paidCount !== 1 ? 's' : ''}`}
            </span>
          </div>
          <CircleDollarSign
            size={92}
            className="pointer-events-none absolute bottom-1 right-1 opacity-[0.08]"
            strokeWidth={1}
            style={{ color: theme.accent }}
          />
        </div>

        <div className="flex flex-1 items-stretch p-3 sm:p-4 lg:pl-0">
          <div
            className={`grid w-full grid-cols-2 gap-2 ${
              visibleChannels.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
            }`}
          >
            {visibleChannels.map((channel) => (
              <div
                key={channel.key}
                className="brand-kpi-channel-cell flex min-h-[5.25rem] flex-col justify-center rounded-xl px-4 py-4 sm:px-5"
                style={plain ? undefined : { background: theme.rowBg }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: theme.chipFg }}
                >
                  {channel.label}
                </p>
                <p className="mt-1.5 truncate text-base font-bold text-fg sm:text-lg">
                  {loading ? '…' : fmtChannelAmount(channels?.[channel.key] ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
