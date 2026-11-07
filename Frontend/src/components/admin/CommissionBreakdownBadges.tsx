'use client';

import { Banknote, BarChart2, CreditCard, ShoppingBag, Smartphone, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { formatMoneyAmount } from '@/lib/receipt';
import {
  resolveCommissionSlabs,
  formatCommissionRate,
  getNextTierProgress,
  type SlabInfo,
} from '@/components/admin/commissionUtils';

type ChannelBreakdown = {
  revenueSubtotal: number;
  commission: number;
  rate: number;
  orderCount: number;
};

export type CommissionBreakdown = {
  pickupCash: ChannelBreakdown;
  pickupCard: ChannelBreakdown;
  pickupOnline: ChannelBreakdown;
  deliveryOnline: ChannelBreakdown;
};

type Props = {
  breakdown: CommissionBreakdown | null | undefined;
  loading?: boolean;
  slabInfo?: SlabInfo | null;
  periodLabel?: string;
  isCurrentMonth?: boolean;
  /** Branch-facing label on the active tier row; off for Super Admin views. */
  showActiveTierLabel?: boolean;
};

type ChannelConfig = {
  key: keyof CommissionBreakdown;
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
};

const CHANNELS: ChannelConfig[] = [
  {
    key: 'pickupCash',
    label: 'Pickup Cash',
    icon: Banknote,
    iconBg: 'bg-emerald-500/12',
    iconColor: 'text-emerald-500',
  },
  {
    key: 'pickupCard',
    label: 'Pickup Card',
    icon: CreditCard,
    iconBg: 'bg-violet-500/12',
    iconColor: 'text-violet-500',
  },
  {
    key: 'pickupOnline',
    label: 'Pickup Online',
    icon: Smartphone,
    iconBg: 'bg-sky-500/12',
    iconColor: 'text-sky-500',
  },
  {
    key: 'deliveryOnline',
    label: 'Delivery Online',
    icon: Truck,
    iconBg: 'bg-rose-500/12',
    iconColor: 'text-rose-500',
  },
];

function CardHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[rgba(48,126,242,0.1)] text-[var(--color-brand,#307ef2)]">
        <Icon size={13} strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

function SkeletonCell({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 animate-pulse rounded bg-[var(--color-input-bg)] ${className ?? 'w-16'}`}
    />
  );
}

export default function CommissionBreakdownBadges({
  breakdown,
  loading,
  slabInfo,
  periodLabel,
  isCurrentMonth = true,
  showActiveTierLabel = true,
}: Props) {
  const slabs = resolveCommissionSlabs(slabInfo?.slabs);
  const activeIndex = slabInfo?.slabIndex ?? 0;
  const effectiveRate = slabInfo?.effectiveRate;
  const next =
    slabInfo != null ? getNextTierProgress(slabInfo.monthlyBase, slabInfo.slabIndex, slabs) : null;

  const channelSubtitle = [
    isCurrentMonth ? 'This month' : periodLabel ? `Period: ${periodLabel}` : 'Selected period',
    effectiveRate
      ? `sales and commission by channel (same tier rate applies to all (${formatCommissionRate(effectiveRate)}))`
      : 'sales and commission by channel (same tier rate applies to all)',
  ].join(' – ');

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="card overflow-hidden !rounded-[10px] p-4">
        <CardHeading
          icon={ShoppingBag}
          title="Sales & Commission by Channel"
          subtitle={channelSubtitle}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-navy-border)]/70 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="!bg-transparent px-2 py-2 font-semibold">Channel</th>
                <th className="!bg-transparent px-2 py-2 text-right font-semibold">Sales</th>
                <th className="!bg-transparent px-2 py-2 text-right font-semibold">Rate</th>
                <th className="!bg-transparent px-2 py-2 text-right font-semibold">Commission</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((channel) => {
                const data = breakdown?.[channel.key];
                const sales = data?.revenueSubtotal ?? 0;
                const commission = data?.commission ?? 0;
                const rate = effectiveRate ?? data?.rate ?? 0;
                const Icon = channel.icon;

                return (
                  <tr
                    key={channel.key}
                    className="border-b border-[var(--color-navy-border)]/50 last:border-b-0"
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${channel.iconBg}`}
                        >
                          <Icon size={13} className={channel.iconColor} strokeWidth={2.25} />
                        </div>
                        <span className="font-medium text-[var(--color-text)]">
                          {channel.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--color-text)]">
                      {loading ? (
                        <SkeletonCell className="w-20" />
                      ) : (
                        <>LKR {formatMoneyAmount(sales)}</>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                      {loading ? (
                        <SkeletonCell className="w-10" />
                      ) : rate > 0 ? (
                        formatCommissionRate(rate)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-[var(--color-text)]">
                      {loading ? (
                        <SkeletonCell className="w-16" />
                      ) : (
                        <>LKR {formatMoneyAmount(commission)}</>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden !rounded-[10px] p-4">
        <CardHeading
          icon={BarChart2}
          title="Commission Tier"
          subtitle="Current commission rate and tier breakdown based on monthly sales"
        />

        {slabInfo ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-brand rounded-full px-2.5 py-0.5 text-[11px] font-bold !text-white">
                Tier {activeIndex + 1}
              </span>
              <span className="text-xs font-semibold text-[var(--color-brand)]">
                {formatCommissionRate(slabInfo.effectiveRate)} current rate
              </span>
            </div>

            {next && next.remaining > 0 ? (
              <>
                <p className="text-xs font-medium leading-snug text-[var(--color-text)]">
                  LKR {formatMoneyAmount(next.remaining)} more period sales to Tier{' '}
                  {next.nextTierNumber} ({formatCommissionRate(next.nextRate)})
                </p>
                <div className="h-1 overflow-hidden rounded-full bg-[var(--color-navy-border)]/40">
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)]"
                    style={{ width: `${Math.max(next.progressPercent, 2)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Best tier rate unlocked
              </p>
            )}

            <div className="overflow-x-auto pt-1">
              <table className="w-full min-w-[280px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-navy-border)]/70 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="!bg-transparent px-2 py-2 font-semibold">Tier</th>
                    <th className="!bg-transparent px-2 py-2 font-semibold">Period Sales Range</th>
                    <th className="!bg-transparent px-2 py-2 text-right font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((slab, index) => {
                    const isActive = index === activeIndex;
                    return (
                      <tr
                        key={slab.label}
                        className={[
                          'border-b border-[var(--color-navy-border)]/50 last:border-b-0',
                          isActive ? 'bg-[rgba(48,126,242,0.08)]' : '',
                        ].join(' ')}
                      >
                        <td
                          className={[
                            'px-2 py-2 text-[var(--color-text)]',
                            isActive ? 'font-semibold' : 'font-medium',
                          ].join(' ')}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            Tier {index + 1}
                            {isActive && showActiveTierLabel && (
                              <span className="rounded-full bg-[var(--color-brand)]/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--color-brand)]">
                                Yours
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[var(--color-text-muted)]">{slab.label}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-[var(--color-text)]">
                          {formatCommissionRate(slab.rate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <SkeletonCell className="h-5 w-28" />
            <SkeletonCell className="h-4 w-full max-w-xs" />
            <SkeletonCell className="h-1.5 w-full" />
            <SkeletonCell className="h-24 w-full" />
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            Tier details unavailable for this period.
          </p>
        )}
      </div>
    </div>
  );
}
