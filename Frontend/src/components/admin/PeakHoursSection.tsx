'use client';

import { Clock3 } from 'lucide-react';

import HourlySalesHeatmap, { type HeatmapCell } from '@/components/admin/HourlySalesHeatmap';
import PeakHoursBarChart, { type PeakHourPoint } from '@/components/admin/PeakHoursBarChart';
import { STORE_HOURS_LABEL } from '@/lib/storeHours';

type Props = {
  peakHours: PeakHourPoint[];
  hourlyHeatmap: HeatmapCell[];
  periodLabel: string;
  loading?: boolean;
};

export default function PeakHoursSection({
  peakHours,
  hourlyHeatmap,
  periodLabel,
  loading,
}: Props) {
  return (
    <div className="card mb-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-navy-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Clock3 size={16} className="text-brand" />
          <div>
            <h2 className="text-sm font-semibold text-fg">Peak Hours</h2>
            <p className="text-xs text-muted">
              {periodLabel} · {STORE_HOURS_LABEL} daily
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-h-0 flex-col border-b border-navy-border px-5 py-4 lg:border-b-0 lg:border-r">
          <p className="mb-2 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">
            Hourly volume
          </p>
          <div className="min-h-0 flex-1">
            <PeakHoursBarChart data={peakHours} loading={loading} />
          </div>
        </div>
        <div className="flex min-h-0 flex-col px-5 py-4">
          <p className="mb-3 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">
            Sales heatmap
          </p>
          <HourlySalesHeatmap data={hourlyHeatmap} loading={loading} />
        </div>
      </div>
    </div>
  );
}
