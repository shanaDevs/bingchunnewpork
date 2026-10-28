'use client';

import { useQuery } from '@tanstack/react-query';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { adminFetch, branchDisplayName, reportScopeLabel } from '@/components/admin/reports/reportUtils';

type Props = {
  value?: string;
  onChange: (storeId: string) => void;
  /** Stacked label (date-filter style) vs inline label (chip-filter style). */
  layout?: 'stacked' | 'inline';
  className?: string;
  placeholder?: string;
};

export function useReportStores() {
  return useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: () => adminFetch<Array<{ id: string; name: string }>>('/stores'),
  });
}

export function useReportScopeLabel(storeId?: string, lockedStoreName?: string) {
  const { data: stores = [] } = useReportStores();
  return reportScopeLabel({ storeId, lockedStoreName, stores });
}

export default function ReportBranchFilter({
  value,
  onChange,
  layout = 'inline',
  className = '',
  placeholder = 'All Branches',
}: Props) {
  const { data: stores = [] } = useReportStores();

  if (stores.length === 0) return null;

  const select = (
    <SearchableBranchSelect
      stores={stores}
      value={value || undefined}
      onChange={onChange}
      formatName={branchDisplayName}
      allowAll
      placeholder={placeholder}
      className={`h-[32px] min-w-[10rem] text-sm rounded-lg ${className}`.trim()}
    />
  );

  if (layout === 'stacked') {
    return (
      <div>
        <p className="text-xs text-muted mb-1">Branch</p>
        {select}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Branch</span>
      {select}
    </div>
  );
}
