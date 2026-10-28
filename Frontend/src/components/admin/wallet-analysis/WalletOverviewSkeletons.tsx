'use client';

import type { ReactNode } from 'react';

import {
  ChartAreaSkeleton,
  ChartBarsSkeleton,
  DashSkel,
} from '@/components/admin/BranchDashboardSkeleton';
import AnalysisCard from '@/components/admin/wallet-analysis/AnalysisCard';

const FLOW_WIDTHS = ['78%', '62%', '48%', '36%'] as const;

function TrendLegend({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
        <span className="h-2 w-2 rounded-full bg-[#307ef2]" aria-hidden />
        Inflow
      </span>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
        <span className="h-2 w-2 rounded-full bg-[#ef4444]" aria-hidden />
        Outflow
      </span>
      {children}
    </div>
  );
}

function HorizontalFlowSkeleton() {
  return (
    <div className="flex h-full min-h-[168px] flex-col justify-center gap-5 px-1" aria-hidden>
      {FLOW_WIDTHS.map((width, index) => (
        <div key={index} className="flex items-center gap-3">
          <DashSkel className="h-3 w-[6.5rem] shrink-0 rounded" />
          <DashSkel className="h-3 rounded-full" style={{ width, maxWidth: '100%' }} />
        </div>
      ))}
    </div>
  );
}

export function WalletTrendChartSkeleton({ headerRight }: { headerRight?: ReactNode }) {
  return (
    <AnalysisCard
      title="Inflow vs Outflow Trend"
      subtitle="Daily amounts (LKR) for the selected month"
      minHeightClassName="min-h-[220px] lg:min-h-0"
      headerRight={<TrendLegend>{headerRight}</TrendLegend>}
    >
      <ChartAreaSkeleton height={180} />
    </AnalysisCard>
  );
}

export function BranchContributionChartSkeleton() {
  return (
    <AnalysisCard
      title="Branch Contribution"
      subtitle="How much each branch adds to the wallet"
    >
      <ChartBarsSkeleton minHeight={168} />
    </AnalysisCard>
  );
}

export function WalletFlowChartSkeleton({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <AnalysisCard title={title} subtitle={subtitle}>
      <HorizontalFlowSkeleton />
    </AnalysisCard>
  );
}

export function BranchWalletCardSkeleton() {
  return (
    <div
      className="super-admin-overview-card card flex h-[118px] flex-col gap-1.5 p-3"
      aria-hidden
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <DashSkel className="h-7 w-7 shrink-0 rounded-full" />
          <div className="min-w-0">
            <DashSkel className="h-3.5 w-24 rounded" />
            <DashSkel className="mt-1.5 h-3 w-16 rounded" />
          </div>
        </div>
        <DashSkel className="h-5 w-14 shrink-0 rounded-full" />
      </div>
      <DashSkel className="mt-auto h-4 w-28 rounded" />
      <DashSkel className="h-3 w-20 rounded" />
    </div>
  );
}
