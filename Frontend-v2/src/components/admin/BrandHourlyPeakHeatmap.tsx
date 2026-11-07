'use client';

import HourlySalesHeatmap, { type HeatmapCell } from '@/components/admin/HourlySalesHeatmap';

export type PeakHourPoint = {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
};

type Props = {
  heatmap: HeatmapCell[];
  loading?: boolean;
};

export default function BrandHourlyPeakHeatmap({
  heatmap,
  loading,
}: Props) {

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="min-h-0 min-w-0 flex-1">
        <HourlySalesHeatmap data={heatmap} loading={loading} />
      </div>
    </div>
  );
}
