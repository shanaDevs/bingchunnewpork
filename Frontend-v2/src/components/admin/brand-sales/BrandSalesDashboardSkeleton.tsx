'use client';

import BrandCompactSection from '@/components/admin/brand-sales/BrandCompactSection';
import {
  brandOverviewCardHeaderClassName,
  brandOverviewCardShellClassName,
  brandOverviewKpiBodyClassName,
  brandOverviewKpiGridClassName,
} from '@/components/admin/brand-sales/BrandOverviewMetricTile';
import {
  ChartAreaSkeleton,
  ChartBarsSkeleton,
  DashSkel,
  DonutLegendSkeleton,
} from '@/components/admin/BranchDashboardSkeleton';

export function BrandCommandKpiCardSkeleton() {
  return (
    <div className="card flex h-full min-h-[92px] flex-col justify-between p-3" aria-hidden>
      <div className="flex items-start justify-between gap-2">
        <DashSkel className="h-3 w-24" />
        <DashSkel className="h-7 w-7 rounded-lg" />
      </div>
      <div className="space-y-2">
        <DashSkel className="h-7 w-32 max-w-full" />
        <DashSkel className="h-3 w-36 max-w-full" />
      </div>
    </div>
  );
}

export function BrandOverviewMetricGridSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className={brandOverviewKpiGridClassName} aria-hidden>
      {Array.from({ length: tiles }).map((_, index) => (
        <div key={index} className="flex min-w-0 items-start gap-2.5">
          <DashSkel className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <DashSkel className="h-3 w-[5.5rem] max-w-full" />
            <DashSkel className="h-5 w-20 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BrandOverviewPanelSkeleton({ titleWidth = '8rem' }: { titleWidth?: string }) {
  return (
    <div className={brandOverviewCardShellClassName} aria-hidden>
      <div className={brandOverviewCardHeaderClassName}>
        <DashSkel className="h-3.5" style={{ width: titleWidth }} />
      </div>
      <div className={brandOverviewKpiBodyClassName}>
        <BrandOverviewMetricGridSkeleton />
      </div>
    </div>
  );
}

export function BrandSalesHeroSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading sales overview">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <BrandCommandKpiCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="card flex h-full flex-col overflow-hidden" aria-hidden>
          <div className="border-b border-[#e2e8f0] px-4 py-2.5">
            <DashSkel className="h-3.5 w-32" />
          </div>
          <div className="flex flex-1 items-center px-4 py-3">
            <DonutLegendSkeleton rows={2} size={168} />
          </div>
        </div>
        <BrandOverviewPanelSkeleton titleWidth="9rem" />
        <BrandOverviewPanelSkeleton titleWidth="8.5rem" />
      </div>
    </div>
  );
}

function PaymentChannelCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
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

function BrandRankTableSkeleton() {
  return (
    <table className="w-full text-left text-xs" aria-hidden>
      <thead>
        <tr className="bg-slate-50">
          <th className="w-8 py-2 pl-2">
            <DashSkel className="h-3 w-3" />
          </th>
          <th className="py-2 pr-2">
            <DashSkel className="h-3 w-16" />
          </th>
          <th className="py-2 pr-2 text-right">
            <DashSkel className="ml-auto h-3 w-12" />
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 5 }).map((_, index) => (
          <tr key={index} className="border-b border-[#e2e8f0]/80 last:border-0">
            <td className="w-8 py-2 pl-2">
              <DashSkel className="h-3 w-3" />
            </td>
            <td className="py-2 pr-2">
              <DashSkel className="h-3.5 w-36 max-w-full" />
            </td>
            <td className="py-2 pr-2 text-right">
              <DashSkel className="ml-auto h-3.5 w-16" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BrandRankLeaderboardCardSkeleton({ titleWidth }: { titleWidth: string }) {
  return (
    <div className="card flex h-full flex-col overflow-hidden" aria-hidden>
      <div className="border-b border-[#e2e8f0] px-4 py-3">
        <DashSkel className="h-4" style={{ width: titleWidth }} />
        <div className="mt-3 flex gap-2">
          <DashSkel className="h-8 w-24 rounded-md" />
          <DashSkel className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="flex-1 p-3">
        <BrandRankTableSkeleton />
      </div>
      <div className="border-t border-[#e2e8f0] px-4 py-3">
        <DashSkel className="h-4 w-32" />
      </div>
    </div>
  );
}

export function BrandSalesOverviewTabSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading dashboard charts">
      <BrandCompactSection title="Total Revenue" subtitle="Loading…">
        <ChartAreaSkeleton height={220} />
      </BrandCompactSection>

      <BrandCompactSection title="Branch Sales Performance" subtitle="Loading…">
        <TopBranchesChannelTableSkeleton />
      </BrandCompactSection>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <BrandCompactSection title="Delivery vs Pickup by Branch" subtitle="Loading…">
          <ChartBarsSkeleton minHeight={220} />
        </BrandCompactSection>
        <BrandCompactSection title="Order Summary & Payment Channels" subtitle="Loading…">
          <ChartBarsSkeleton minHeight={180} />
          <div className="mt-3">
            <PaymentChannelCardsSkeleton />
          </div>
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <BrandCompactSection className="xl:col-span-2" title="Hourly Order Activity" subtitle="Loading…">
          <ChartBarsSkeleton minHeight={220} />
        </BrandCompactSection>
        <BrandCompactSection className="xl:col-span-2" title="Sales vs Discounts" subtitle="Loading…">
          <ChartAreaSkeleton height={220} />
        </BrandCompactSection>
        <BrandCompactSection className="xl:col-span-1" title="Order Status" subtitle="Loading…">
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-2">
            <DashSkel className="h-[160px] w-[160px] rounded-full" />
            <div className="w-full space-y-2 px-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <DashSkel key={index} className="h-3 w-full max-w-[12rem] mx-auto" />
              ))}
            </div>
          </div>
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-3">
        <BrandRankLeaderboardCardSkeleton titleWidth="10rem" />
        <BrandRankLeaderboardCardSkeleton titleWidth="8rem" />
        <BrandRankLeaderboardCardSkeleton titleWidth="11rem" />
      </div>
    </div>
  );
}

export function BranchSalesTableSkeleton() {
  return <TopBranchesChannelTableSkeleton />;
}

export function TopBranchesChannelTableSkeleton({
  hideDeliveryOnline = false,
}: {
  hideDeliveryOnline?: boolean;
}) {
  const columnCount = hideDeliveryOnline ? 8 : 9;
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid w-full grid-cols-[minmax(160px,1fr)_auto] items-center gap-2">
        <DashSkel className="h-10 w-full rounded-md" />
        <DashSkel className="h-10 w-36 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-lg border border-[#e2e8f0]">
        <div className="flex gap-3 border-b border-[#e2e8f0] bg-slate-50 px-3 py-2.5">
          {Array.from({ length: columnCount }).map((_, index) => (
            <DashSkel
              key={index}
              className="h-3 shrink-0"
              style={{ width: index === 0 ? '6rem' : '4rem' }}
            />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex gap-3 border-b border-[#e2e8f0]/80 px-3 py-3 last:border-0">
            {Array.from({ length: columnCount }).map((_, col) => (
              <DashSkel
                key={col}
                className="h-3.5 shrink-0"
                style={{ width: col === 0 ? '28%' : col === 1 ? '12%' : '4.5rem' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BranchSalesCustomerListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <DashSkel className="h-7 w-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <DashSkel className="h-3.5 w-32 max-w-full" />
            <DashSkel className="h-3 w-24 max-w-full" />
          </div>
          <DashSkel className="h-3.5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function BranchSalesProductListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <DashSkel className="h-3 w-5 shrink-0" />
          <DashSkel className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <DashSkel className="h-3.5 w-36 max-w-full" />
            <DashSkel className="h-3 w-20 max-w-full" />
          </div>
          <DashSkel className="h-3 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function BranchSalesPageSkeleton() {
  return (
    <div className="admin-dashboard mx-auto max-w-[1680px] space-y-3 pb-10" aria-busy="true" aria-label="Loading sales overview">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <DashSkel className="h-5 w-72 max-w-full" />
          <DashSkel className="h-3 w-56 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashSkel className="h-9 w-64 rounded-md" />
          <DashSkel className="h-9 w-24 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <BrandCommandKpiCardSkeleton key={index} />
        ))}
      </div>

      <BrandCompactSection title="Total Revenue" subtitle="Loading…">
        <ChartAreaSkeleton height={220} />
      </BrandCompactSection>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BrandCompactSection title="Sales vs Discount" subtitle="Loading…">
          <ChartAreaSkeleton height={220} />
        </BrandCompactSection>
        <BrandCompactSection title="Revenue Breakdown" subtitle="Loading…">
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-2">
            <DashSkel className="h-[160px] w-[160px] rounded-full" />
            <div className="w-full space-y-2 px-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <DashSkel key={index} className="mx-auto h-3 w-full max-w-[12rem]" />
              ))}
            </div>
          </div>
        </BrandCompactSection>
        <BrandCompactSection title="Order Status" subtitle="Loading…" className="md:col-span-2 xl:col-span-1">
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-2">
            <DashSkel className="h-[160px] w-[160px] rounded-full" />
            <div className="w-full space-y-2 px-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <DashSkel key={index} className="mx-auto h-3 w-full max-w-[12rem]" />
              ))}
            </div>
          </div>
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <BrandCompactSection title="Delivery vs Pickup Orders" subtitle="Loading…">
          <ChartBarsSkeleton minHeight={220} />
        </BrandCompactSection>
        <BrandCompactSection title="Order Summary & Payment Channels" subtitle="Loading…">
          <ChartBarsSkeleton minHeight={220} />
          <div className="mt-3">
            <PaymentChannelCardsSkeleton />
          </div>
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BrandCompactSection title="Hourly Order Activity" subtitle="Loading…">
          <ChartBarsSkeleton minHeight={228} />
        </BrandCompactSection>
        <BrandCompactSection title="Top Customers" subtitle="Loading…">
          <BranchSalesCustomerListSkeleton />
        </BrandCompactSection>
        <BrandCompactSection
          title="Top Selling Products"
          subtitle="Loading…"
          className="md:col-span-2 xl:col-span-1"
        >
          <BranchSalesProductListSkeleton />
        </BrandCompactSection>
      </div>
    </div>
  );
}

export function BrandSalesPageShellSkeleton() {
  return (
    <div className="admin-dashboard mx-auto max-w-[1680px] space-y-3 pb-10" aria-busy="true">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <DashSkel className="h-5 w-72 max-w-full" />
          <DashSkel className="h-3 w-56 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashSkel className="h-9 w-64 rounded-md" />
          <DashSkel className="h-9 w-24 rounded-md" />
        </div>
      </div>

      <BrandSalesHeroSkeleton />

      <div className="flex flex-wrap gap-1 border-b border-[#e2e8f0] pb-px" aria-hidden>
        {Array.from({ length: 3 }).map((_, index) => (
          <DashSkel key={index} className="mb-2 h-9 w-40 rounded-sm" />
        ))}
      </div>

      <BrandSalesOverviewTabSkeleton />
    </div>
  );
}
