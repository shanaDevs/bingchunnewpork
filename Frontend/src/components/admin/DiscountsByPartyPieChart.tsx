'use client';

import { useMemo } from 'react';

import InteractiveDonutChart, {
  type InteractiveDonutSlice,
} from '@/components/admin/InteractiveDonutChart';
import type { ChartConfig } from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

export type DiscountsByPartyBreakdown = {
  branch: number;
  jason: number;
  platform: number;
  total: number;
  branchPercent: number;
  jasonPercent: number;
  platformPercent: number;
};

type PartyKey = 'branch' | 'jason' | 'platform';

const BRANCH_COLOR = '#121358';
const JASON_COLOR = '#36ADA3';
const PLATFORM_COLOR = '#2F578A';

const chartConfig = {
  amount: {
    label: 'Discount',
  },
  branch: {
    label: 'Branch',
    color: BRANCH_COLOR,
  },
  jason: {
    label: 'Jason',
    color: JASON_COLOR,
  },
  platform: {
    label: 'Platform',
    color: PLATFORM_COLOR,
  },
} satisfies ChartConfig;

type Props = {
  data: DiscountsByPartyBreakdown | null | undefined;
  periodLabel?: string;
  loading?: boolean;
  compact?: boolean;
};

export default function DiscountsByPartyPieChart({
  data,
  periodLabel,
  loading,
  compact = false,
}: Props) {
  const slices = useMemo<InteractiveDonutSlice<PartyKey>[]>(() => {
    if (!data) return [];
    return [
      {
        key: 'branch' as const,
        label: 'Branch',
        amount: data.branch,
        percent: data.branchPercent,
        fill: BRANCH_COLOR,
      },
      {
        key: 'jason' as const,
        label: 'Jason',
        amount: data.jason,
        percent: data.jasonPercent,
        fill: JASON_COLOR,
      },
      {
        key: 'platform' as const,
        label: 'Platform',
        amount: data.platform,
        percent: data.platformPercent,
        fill: PLATFORM_COLOR,
      },
    ].filter((item) => item.amount > 0);
  }, [data]);

  const total = data?.total ?? 0;

  return (
    <InteractiveDonutChart
      title="Discounts by Party"
      subtitle={periodLabel ? `${periodLabel} · promo discounts by funding party` : undefined}
      loading={loading}
      empty={slices.length === 0}
      emptyLabel="No promo discount data"
      skeletonRows={3}
      compact={compact}
      slices={slices}
      chartConfig={chartConfig}
      defaultKey="branch"
      footer={
        <p className="pt-1 text-[11px] text-muted">{formatMoney(total)} total discounts</p>
      }
    />
  );
}
