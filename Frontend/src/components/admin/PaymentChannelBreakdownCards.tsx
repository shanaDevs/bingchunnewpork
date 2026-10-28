'use client';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import DashboardTabularAmount from '@/components/admin/DashboardTabularAmount';
import type {
  PaymentChannelBreakdown,
  PaymentChannelCardDef,
} from '@/components/admin/paymentChannelCardConfig';
import { BRAND_ACCENT_ICON_CLASS } from '@/lib/brandSalesChartColors';
import { formatMoney } from '@/lib/receipt';

type Props = {
  cards: PaymentChannelCardDef[];
  breakdown?: PaymentChannelBreakdown;
  loading?: boolean;
};

export default function PaymentChannelBreakdownCards({ cards, breakdown, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-hidden>
        {cards.map((channel) => (
          <div
            key={channel.key}
            className="flex items-center gap-2 rounded-lg border border-[#e2e8f0] px-2.5 py-2"
          >
            <DashSkel className="h-[13px] w-[13px] shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <DashSkel className="h-3 w-20 max-w-full" />
              <DashSkel className="h-3.5 w-28 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cards.map((channel) => {
        const Icon = channel.icon;
        const total = breakdown?.[channel.totalKey] ?? 0;
        const count = breakdown?.[channel.countKey] ?? 0;
        return (
          <div
            key={channel.key}
            className="flex items-center gap-2 rounded-lg border border-[#e2e8f0] px-2.5 py-2"
          >
            <Icon size={13} className={`shrink-0 ${BRAND_ACCENT_ICON_CLASS}`} />
            <div className="min-w-0">
              <p className="truncate text-[11px] text-muted">{channel.label}</p>
              <p className="text-xs font-semibold tabular-nums text-fg">
                <DashboardTabularAmount>{formatMoney(total)}</DashboardTabularAmount>
                <span className="ml-1 font-normal text-muted">
                  · <DashboardTabularAmount>{count}</DashboardTabularAmount>
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
