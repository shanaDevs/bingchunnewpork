'use client';

import { useMemo } from 'react';

import InteractiveDonutChart, {
  type InteractiveDonutSlice,
} from '@/components/admin/InteractiveDonutChart';
import type { ChartConfig } from '@/components/ui/chart';

const SALES_COLOR = '#307ef2';
const JASON_COLOR = '#36ADA3';

const chartConfig = {
  amount: {
    label: 'Amount',
  },
  sales: {
    label: 'Sales amount',
    color: SALES_COLOR,
  },
  jason: {
    label: 'Jason invested',
    color: JASON_COLOR,
  },
} satisfies ChartConfig;

type SliceKey = 'sales' | 'jason';

type Props = {
  salesAmount: number;
  jasonInvestedAmount: number;
  periodLabel?: string;
  loading?: boolean;
};

export default function SalesVsJasonInvestmentChart({
  salesAmount,
  jasonInvestedAmount,
  periodLabel,
  loading,
}: Props) {
  const total = salesAmount + jasonInvestedAmount;

  const slices = useMemo<InteractiveDonutSlice<SliceKey>[]>(() => {
    const share = (amount: number) => (total > 0 ? Math.round((amount / total) * 100) : 0);
    return [
      {
        key: 'sales',
        label: 'Sales amount',
        amount: salesAmount,
        percent: share(salesAmount),
        fill: SALES_COLOR,
      },
      {
        key: 'jason',
        label: 'Jason invested',
        amount: jasonInvestedAmount,
        percent: share(jasonInvestedAmount),
        fill: JASON_COLOR,
      },
    ];
  }, [salesAmount, jasonInvestedAmount, total]);

  return (
    <InteractiveDonutChart
      title="Sales vs Jason Investment"
      subtitle={
        periodLabel ? `${periodLabel} · paid sales compared with Jason investments` : undefined
      }
      loading={loading}
      empty={total <= 0}
      emptyLabel="No paid sales or investments"
      skeletonRows={2}
      compact
      slices={slices}
      pieSlices={slices.filter((row) => row.amount > 0)}
      chartConfig={chartConfig}
      defaultKey="sales"
      paddingAngle={slices.filter((row) => row.amount > 0).length > 1 ? 3 : 0}
      strokeWidth={0}
      useCells
      centerCaption={(slice) => `${slice.percent}%`}
      centerCaptionClassName="fill-muted-foreground text-[10px]"
    />
  );
}
