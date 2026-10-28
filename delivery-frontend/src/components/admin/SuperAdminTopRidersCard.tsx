'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import AdminRiderKpiDetailModal from '@/components/admin/AdminRiderKpiDetailModal';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import {
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import { RiderAvatar } from '@/components/admin/deliveryAnalyticsUi';
import { formatDurationMinutes } from '@/lib/datetime';

export type SuperAdminTopDeliveryRider = {
  rank: number;
  riderId: string;
  riderName: string;
  profilePhotoUrl?: string | null;
  completedJobs: number;
  distinctOrders: number;
  totalDistanceKm: number;
  onlineTimeMinutes: number;
};

type Props = {
  riders: SuperAdminTopDeliveryRider[];
  periodLabel: string;
  period: DashboardPeriod;
  customRange?: DateRange;
  loading?: boolean;
};

const CARD_CLASS =
  'card flex h-full min-h-[380px] flex-col overflow-hidden !rounded-[20px] border-[#E5EAF2] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.05)] sm:p-6';

const STAR_FILL: Record<number, string> = {
  1: '#F5C518',
  2: '#C5D0DC',
  3: '#E39B4A',
};

function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

const VISIBLE_RIDER_COUNT = 2;

function RankStar({ rank }: { rank: number }) {
  const fill = STAR_FILL[rank] ?? '#9BB6D4';

  return (
    <span className="relative inline-flex h-11 w-11 items-center justify-center" aria-hidden>
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 h-full w-full"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(15, 23, 42, 0.18))' }}
      >
        <path
          fill={fill}
          d="M12 1.85 14.94 8.4l7.16.74-5.38 4.86 1.54 7.04L12 17.72 5.74 21.04l1.54-7.04L1.9 9.14l7.16-.74L12 1.85Z"
        />
      </svg>
      <span className="relative text-[10px] font-bold leading-none tracking-tight text-white">
        {rank}
      </span>
    </span>
  );
}

function RiderKpi({
  icon: Icon,
  iconClass,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={`min-w-0 px-3 py-2.5 ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={14} strokeWidth={2.1} className={`shrink-0 ${iconClass}`} aria-hidden />
        <span className="truncate text-[11px] font-medium text-slate-400">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-bold tabular-nums leading-tight text-slate-800">
        {value}
      </p>
    </div>
  );
}

function RiderCarouselCard({
  rider,
  onOpen,
}: {
  rider: SuperAdminTopDeliveryRider;
  onOpen: (riderId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`View KPI details for ${rider.riderName}`}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-[#E5EAF2] bg-white pt-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_rgba(15,23,42,0.04)] transition-colors hover:border-brand/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      onClick={() => onOpen(rider.riderId)}
    >
      <span className="absolute right-2.5 top-3 z-[1]">
        <RankStar rank={rider.rank} />
      </span>
      <div className="flex flex-col items-center px-4 pb-4">
        <RiderAvatar
          name={rider.riderName}
          seed={rider.riderId}
          photoUrl={rider.profilePhotoUrl}
          size="2xl"
        />
        <p className="mt-3 w-full truncate px-2 text-center text-[13px] font-bold leading-tight text-slate-800">
          {rider.riderName}
        </p>
      </div>
      <div className="mt-auto grid grid-cols-2 border-t border-[#E5EAF2]">
        <RiderKpi
          icon={Briefcase}
          iconClass="text-brand"
          label="Jobs"
          value={rider.completedJobs}
          className="border-r border-b border-[#E5EAF2]"
        />
        <RiderKpi
          icon={ShoppingCart}
          iconClass="text-emerald-500"
          label="Orders"
          value={rider.distinctOrders}
          className="border-b border-[#E5EAF2]"
        />
        <RiderKpi
          icon={MapPin}
          iconClass="text-violet-500"
          label="Distance"
          value={formatDistance(rider.totalDistanceKm)}
          className="border-r border-[#E5EAF2]"
        />
        <RiderKpi
          icon={Clock}
          iconClass="text-orange-500"
          label="Online"
          value={formatDurationMinutes(rider.onlineTimeMinutes)}
        />
      </div>
    </button>
  );
}

const NAV_BTN_CLASS =
  'absolute top-[38%] z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5EAF2] bg-white text-slate-400 shadow-[0_1px_4px_rgba(15,23,42,0.10)] transition enabled:hover:text-slate-600 disabled:opacity-35';

export default function SuperAdminTopRidersCard({
  riders,
  periodLabel,
  period,
  customRange,
  loading,
}: Props) {
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const visibleCount = VISIBLE_RIDER_COUNT;
  const dateFilters = useMemo(() => orderDateRange(period, customRange), [period, customRange]);
  const maxStart = Math.max(0, riders.length - visibleCount);
  const startIndex = Math.min(page, maxStart);
  const showNav = !loading && riders.length > visibleCount;
  const trackWidthPercent = riders.length > 0 ? (riders.length / visibleCount) * 100 : 100;
  const slidePercent = riders.length > 0 ? (startIndex / riders.length) * 100 : 0;
  const cardWidthPercent = riders.length > 0 ? 100 / riders.length : 100;

  return (
    <div className={CARD_CLASS}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E8F1FD] text-brand">
            <Users size={18} strokeWidth={2.1} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight text-slate-800">Top 5 delivery riders</h2>
            <p className="mt-1 text-[11px] leading-tight text-slate-400">
              {periodLabel} - click a row for KPIs
            </p>
          </div>
        </div>
        <Link
          href="/admin/delivery"
          className="mt-1 shrink-0 text-xs font-semibold text-brand hover:underline"
        >
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4" aria-hidden>
          {Array.from({ length: VISIBLE_RIDER_COUNT }, (_, index) => (
            <div
              key={index}
              className="flex flex-col items-center rounded-[18px] border border-[#E5EAF2] px-4 pb-0 pt-5"
            >
              <DashSkel className="h-20 w-20 rounded-full" />
              <DashSkel className="mt-3 h-3.5 w-24" />
              <DashSkel className="mt-5 h-px w-full" />
              <div className="grid w-full grid-cols-2">
                <DashSkel className="m-3 h-8" />
                <DashSkel className="m-3 h-8" />
                <DashSkel className="m-3 h-8" />
                <DashSkel className="m-3 h-8" />
              </div>
            </div>
          ))}
        </div>
      ) : riders.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-6 text-sm text-muted">
          No completed rider jobs in this period
        </p>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-w-0 flex-1">
            {showNav ? (
              <button
                type="button"
                aria-label="Previous riders"
                disabled={startIndex === 0}
                className={`${NAV_BTN_CLASS} left-0`}
                onClick={() => setPage(Math.max(0, startIndex - 1))}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
            ) : null}
            {showNav ? (
              <button
                type="button"
                aria-label="Next riders"
                disabled={startIndex >= maxStart}
                className={`${NAV_BTN_CLASS} right-0`}
                onClick={() => setPage(Math.min(maxStart, startIndex + 1))}
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            ) : null}

            <div className="h-full min-w-0 overflow-hidden">
              <div
                className="flex h-full transition-transform duration-300 ease-out"
                style={{
                  width: `${trackWidthPercent}%`,
                  transform: `translateX(-${slidePercent}%)`,
                }}
              >
                {riders.map((rider) => (
                  <div
                    key={rider.riderId}
                    className="h-full shrink-0 px-2"
                    style={{ width: `${cardWidthPercent}%` }}
                  >
                    <RiderCarouselCard rider={rider} onOpen={setSelectedRiderId} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {maxStart > 0 ? (
            <div className="mt-4 flex justify-center gap-2" role="tablist" aria-label="Rider pages">
              {Array.from({ length: maxStart + 1 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-label={`Show riders starting at ${index + 1}`}
                  aria-selected={index === startIndex}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    index === startIndex ? 'bg-brand' : 'bg-slate-200 hover:bg-slate-300'
                  }`}
                  onClick={() => setPage(index)}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {selectedRiderId ? (
        <AdminRiderKpiDetailModal
          riderId={selectedRiderId}
          filters={{
            dateFrom: dateFilters.startDate,
            dateTo: dateFilters.endDate,
          }}
          open
          onClose={() => setSelectedRiderId(null)}
        />
      ) : null}
    </div>
  );
}
