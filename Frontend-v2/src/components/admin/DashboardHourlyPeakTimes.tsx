'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Home } from 'lucide-react';

import BrandHourlyPeakHeatmap from '@/components/admin/BrandHourlyPeakHeatmap';
import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import type { HeatmapCell } from '@/components/admin/HourlySalesHeatmap';
import MonthPickerSelect, {
  currentMonthKey,
  formatMonthKeyLabel,
} from '@/components/admin/MonthPickerSelect';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { shortBranchName } from '@/lib/branchName';
import { adminFetch, buildHourlyPeakHeatmapUrl } from '@/lib/brandSalesReportApi';
import { KPI_LIGHT } from '@/lib/dashboardTheme';

type Store = {
  id: string;
  name: string;
  deliveryEnabled?: boolean;
  tier?: string;
};

type Props = {
  stores?: Store[];
  variant?: 'default' | 'superAdmin';
};

export default function DashboardHourlyPeakTimes({ stores = [], variant = 'default' }: Props) {
  const [hourlyPeakMonth, setHourlyPeakMonth] = useState(currentMonthKey);
  const [hourlyPeakStoreId, setHourlyPeakStoreId] = useState('');

  const deliveryStores = useMemo(
    () =>
      [...stores]
        .filter((store) => store.tier === 'top' || store.deliveryEnabled)
        .sort((a, b) => shortBranchName(a.name).localeCompare(shortBranchName(b.name))),
    [stores],
  );

  const hourlyPeakMonthLabel = formatMonthKeyLabel(hourlyPeakMonth);
  const allBranchesLabel = 'All delivery branches';
  const branchLabel = hourlyPeakStoreId
    ? shortBranchName(
        deliveryStores.find((store) => store.id === hourlyPeakStoreId)?.name ?? '',
      )
    : allBranchesLabel;

  const { data, isLoading } = useQuery<{ hourlyHeatmap: HeatmapCell[] }>({
    queryKey: ['hourly-peak-heatmap', 'top', hourlyPeakMonth, hourlyPeakStoreId || null],
    queryFn: () =>
      adminFetch(buildHourlyPeakHeatmapUrl('top', hourlyPeakMonth, hourlyPeakStoreId || undefined)),
  });

  const isSuperAdmin = variant === 'superAdmin';
  const theme = KPI_LIGHT.orange;

  return (
    <div className="card flex h-full min-h-[260px] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-border px-5 py-4">
        <div className="min-w-0">
          {isSuperAdmin ? (
            <BrandKpiCardHeader
              icon={Home}
              theme={theme}
              title="Hourly Peak Times"
              subtitle={`${branchLabel} · ${hourlyPeakMonthLabel}`}
              size="sm"
              accentTitle={false}
              titleClassName="text-sm font-semibold text-fg"
            />
          ) : (
            <>
              <h2 className="text-sm font-semibold text-fg">Hourly Peak Times</h2>
              <p className="mt-0.5 text-xs text-muted">
                {branchLabel} · {hourlyPeakMonthLabel}
              </p>
            </>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-nowrap items-center gap-2 sm:w-auto">
          <MonthPickerSelect
            value={hourlyPeakMonth}
            onChange={setHourlyPeakMonth}
            className="min-w-0 flex-1 sm:min-w-[8.5rem] sm:flex-none"
          />
          <SearchableBranchSelect
            stores={deliveryStores}
            value={hourlyPeakStoreId}
            onChange={setHourlyPeakStoreId}
            formatName={shortBranchName}
            allowAll
            placeholder={allBranchesLabel}
            className="min-w-0 flex-1 sm:min-w-[10.5rem] sm:flex-none"
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <BrandHourlyPeakHeatmap
          heatmap={data?.hourlyHeatmap ?? []}
          loading={isLoading}
        />
      </div>
    </div>
  );
}
