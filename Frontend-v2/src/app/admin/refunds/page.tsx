'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { getApiBaseUrl } from '@/lib/apiBase';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueries } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Inbox,
  List,
  Loader2,
  Percent,
  RefreshCw,
  Search,
  Store,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import DateRangePicker from '@/components/admin/DateRangePicker';
import CancelReasonConfigPanel from '@/components/admin/CancelReasonConfigPanel';
import OrderStatusRefundConfigPanel from '@/components/admin/OrderStatusRefundConfigPanel';
import RefundProcessModal from '@/components/admin/RefundProcessModal';
import RefundAnalyticsPanel from '@/components/admin/RefundAnalyticsPanel';
import SparklineKpiCard from '@/components/admin/SparklineKpiCard';
import { RefundRequestTypeBadge, RefundStatusBadge } from '@/components/admin/RefundStatusBadge';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { getAdminSession, isCashier, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import { adminBadgeClass, ORDER_STATUS_BADGE } from '@/lib/adminBadges';
import { formatDateTime } from '@/lib/datetime';
import { getStatusLabel } from '@/lib/orderStatus';
import { buildPageList } from '@/lib/pagination';
import { formatMoney } from '@/lib/receipt';
import { formatLkr } from '@/components/admin/reports/reportUtils';
import { shortBranchName } from '@/lib/branchName';
import {
  cancelledAtStatusOf,
  customerDisplayName,
  exportRefundsExcel,
  fetchAllRefundsForExport,
  formatReason,
  refundsExportFilename,
} from '@/lib/refundsExport';
import type { OrderStatus } from '@/types';
import toast from 'react-hot-toast';

const PAGE_SIZE = 20;

type RefundMainTab = 'process' | 'analytics';

type RefundStatusTab = 'RECEIVED' | 'COMPLETE' | 'REJECTED' | 'ALL';

const STATUS_TABS: Array<{
  id: RefundStatusTab;
  label: string;
  icon: typeof Inbox;
}> = [
  { id: 'RECEIVED', label: 'Received', icon: Inbox },
  { id: 'COMPLETE', label: 'Complete', icon: CheckCircle2 },
  { id: 'REJECTED', label: 'Rejected', icon: XCircle },
  { id: 'ALL', label: 'All', icon: List },
];

const MAIN_TABS: Array<{
  id: RefundMainTab;
  label: string;
  icon: typeof Inbox;
}> = [
  { id: 'process', label: 'Process', icon: Inbox },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

type RefundSummary = {
  count: number;
  customerReceiveTotalLkr: number;
  branchReceiveTotalLkr: number;
  deliveryReceiveTotalLkr: number;
  platformReceiveTotalLkr: number;
};

type RefundRow = {
  id: string;
  orderId: string;
  customerName?: string | null;
  cancellationReason: string;
  customReasonText?: string | null;
  cancelledWithinWindow: boolean;
  salesTotal: number;
  deliveryFee: number;
  convenienceFee: number;
  orderTotal: number;
  refundPercentage?: number | null;
  refundAmount?: number | null;
  notReturningSubtotal?: number | null;
  nonRefundableDeliveryFee?: number | null;
  nonRefundableConvenienceFee?: number | null;
  additionalGatewayFee?: number | null;
  exceededRange?: boolean;
  exceededRangeReason?: string | null;
  configuredMinPercentage?: number | null;
  configuredMaxPercentage?: number | null;
  cancelledAtStatus?: string | null;
  status: string;
  submittedBy?: string | null;
  adminNotes?: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    paymentMethod: string;
    paymentStatus: string;
    orderMode: string;
    storeId: string;
    guestName?: string | null;
    guestPhone?: string | null;
    store?: { id: string; name: string; city?: string | null } | null;
    user?: { id: string; name?: string | null; phone?: string | null } | null;
    statusEvents?: Array<{ status: string; createdAt: string }> | null;
  };
};

type PaginatedRefunds = {
  data: RefundRow[];
  meta: { total: number; page: number; limit: number; pages: number };
};

async function adminFetch(endpoint: string) {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json as PaginatedRefunds;
}

async function adminFetchSummary(endpoint: string): Promise<RefundSummary> {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json.data as RefundSummary;
}

function CancelledAtStatusBadge({ refund }: { refund: RefundRow }) {
  const status = cancelledAtStatusOf(refund);
  if (!status) return <span className="text-muted">—</span>;
  return (
    <span className={adminBadgeClass(ORDER_STATUS_BADGE[status] ?? 'neutral')}>
      {getStatusLabel(status, refund.order.orderMode as 'DELIVERY' | 'TAKEAWAY')}
    </span>
  );
}

function RefundTableSkeleton({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-navy-border animate-pulse">
          {Array.from({ length: colSpan }).map((__, j) => (
            <td key={j} className="px-4 py-4">
              <div className="h-3.5 rounded bg-white/5" style={{ width: j === 0 ? '72%' : '55%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function AdminRefundsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchDebounceInit = useRef(true);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [statusTab, setStatusTab] = useState<RefundStatusTab>('RECEIVED');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedRefundId, setSelectedRefundId] = useState<string | null>(null);
  const [pageView, setPageView] = useState<'refunds' | 'reasons' | 'status-refunds'>('refunds');
  const [mainTab, setMainTab] = useState<RefundMainTab>('process');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const admin = getAdminSession();
    setSession(admin);
    if (isCashier(admin)) {
      router.replace('/admin/orders');
    }
  }, [router]);

  useEffect(() => {
    const refundId = searchParams.get('refundId');
    if (refundId) {
      setSelectedRefundId(refundId);
    }
  }, [searchParams]);

  const closeRefundModal = () => {
    setSelectedRefundId(null);
    if (searchParams.get('refundId')) {
      router.replace('/admin/refunds');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      if (!searchDebounceInit.current) setPage(1);
      searchDebounceInit.current = false;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const showStoreColumn = isSuperAdmin(session);
  const superAdmin = showStoreColumn;
  const colSpan = showStoreColumn ? 11 : 10;

  const tableHeaders = [
    'Requested date',
    'Request type',
    'Order',
    'Customer',
    'Total order amount',
    ...(showStoreColumn ? ['Branch'] : []),
    'Cancel at',
    'Reason',
    'Refund amount',
    'Status',
  ] as const;

  const storesQuery = useQuery({
    queryKey: ['admin-stores-refunds'],
    queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/stores`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      const json = await res.json();
      const rows = json.data ?? json;
      return Array.isArray(rows) ? rows as Array<{ id: string; name: string }> : [];
    },
    enabled: showStoreColumn,
  });

  const appSettingsQuery = useQuery({
    queryKey: ['app-settings-cancel-window'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/settings/app`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load settings');
      return json.data as { cancelWindowMinutes?: number };
    },
    staleTime: 5 * 60 * 1000,
  });

  const cancelWindowMinutes = appSettingsQuery.data?.cancelWindowMinutes ?? 10;

  const filterParamsBase = useMemo(() => {
    const params = new URLSearchParams({ page: '1', limit: '1' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (showStoreColumn && storeFilter) params.set('storeId', storeFilter);
    if (dateRange?.from) params.set('startDate', format(dateRange.from, 'yyyy-MM-dd'));
    if (dateRange?.to) params.set('endDate', format(dateRange.to, 'yyyy-MM-dd'));
    return params;
  }, [debouncedSearch, showStoreColumn, storeFilter, dateRange]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams(filterParamsBase);
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (statusTab !== 'ALL') params.set('status', statusTab);
    return params.toString();
  }, [page, statusTab, filterParamsBase]);

  const countQueries = useQueries({
    queries: STATUS_TABS.map((tab) => ({
      queryKey: ['admin-refunds-count', tab.id, filterParamsBase.toString()],
      queryFn: async () => {
        const params = new URLSearchParams(filterParamsBase);
        if (tab.id !== 'ALL') params.set('status', tab.id);
        const res = await adminFetch(`/refunds?${params}`);
        return res.meta?.total ?? 0;
      },
      refetchInterval: 30000,
    })),
  });

  const tabCounts = useMemo(
    () =>
      STATUS_TABS.reduce(
        (acc, tab, index) => {
          acc[tab.id] = countQueries[index]?.data ?? 0;
          return acc;
        },
        {} as Record<RefundStatusTab, number>,
      ),
    [countQueries],
  );

  const refundsQuery = useQuery({
    queryKey: ['admin-refunds', queryParams],
    queryFn: () => adminFetch(`/refunds?${queryParams}`),
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });

  const summaryQueryParams = useMemo(() => filterParamsBase.toString(), [filterParamsBase]);

  const summaryQuery = useQuery({
    queryKey: ['admin-refunds-summary', summaryQueryParams],
    queryFn: () => adminFetchSummary(`/refunds/summary?${summaryQueryParams}`),
    refetchInterval: 30000,
  });

  const refunds = refundsQuery.data?.data ?? [];
  const meta = refundsQuery.data?.meta ?? { total: 0, page: 1, limit: PAGE_SIZE, pages: 0 };
  const totalPages = Math.max(1, meta.pages);
  const totalItems = meta.total;
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalItems);
  const pageList = buildPageList(page, totalPages);

  const hasActiveFilters = Boolean(debouncedSearch || storeFilter || dateRange?.from || dateRange?.to);

  useEffect(() => {
    setPage(1);
  }, [statusTab, storeFilter, dateRange]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function clearSearch() {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  }

  function resetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setStoreFilter('');
    setDateRange(undefined);
    setPage(1);
  }

  async function handleExportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
      const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;
      const rows = await fetchAllRefundsForExport({
        search: debouncedSearch || undefined,
        storeId: showStoreColumn && storeFilter ? storeFilter : undefined,
        startDate,
        endDate,
      });
      if (rows.length === 0) {
        toast.error('No refund requests match the current filters.');
        return;
      }

      const selectedStore = (storesQuery.data ?? []).find((store) => store.id === storeFilter);
      const scopeLabel = showStoreColumn
        ? selectedStore
          ? shortBranchName(selectedStore.name)
          : 'All branches'
        : session?.storeName
          ? shortBranchName(session.storeName)
          : 'This branch';

      exportRefundsExcel({
        refunds: rows,
        includeBranch: showStoreColumn,
        scopeLabel,
        startDate,
        endDate,
        search: debouncedSearch || undefined,
        filename: refundsExportFilename(startDate, endDate),
      });
      toast.success(`Exported ${rows.length} refund request${rows.length === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export refunds');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <RefundProcessModal
        refundId={selectedRefundId}
        onClose={closeRefundModal}
        onUpdated={() => {
          void refundsQuery.refetch();
          void summaryQuery.refetch();
          void Promise.all(countQueries.map((q) => q.refetch()));
        }}
      />

      {mainTab !== 'analytics' && (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">Refunds</h1>
          <p className="text-muted text-sm mt-0.5">
            {pageView === 'reasons'
              ? 'Manage customer cancellation reasons'
              : pageView === 'status-refunds'
                ? 'Configure fixed refund percentages by order status'
                : `${totalItems} refund request${totalItems === 1 ? '' : 's'}${statusTab !== 'ALL' ? ` · ${STATUS_TABS.find((t) => t.id === statusTab)?.label}` : ''}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {mainTab === 'process' && superAdmin && (
            <div className="inline-flex rounded-lg border border-navy-border overflow-hidden">
              <button
                type="button"
                onClick={() => setPageView('refunds')}
                className={`px-3 py-2 text-sm ${pageView === 'refunds' ? 'bg-brand/15 text-brand' : 'text-muted hover:text-fg'}`}
              >
                Refund queue
              </button>
              <button
                type="button"
                onClick={() => setPageView('reasons')}
                className={`px-3 py-2 text-sm ${pageView === 'reasons' ? 'bg-brand/15 text-brand' : 'text-muted hover:text-fg'}`}
              >
                Cancel reasons
              </button>
              <button
                type="button"
                onClick={() => setPageView('status-refunds')}
                className={`px-3 py-2 text-sm ${pageView === 'status-refunds' ? 'bg-brand/15 text-brand' : 'text-muted hover:text-fg'}`}
              >
                Status refunds
              </button>
            </div>
          )}
          {mainTab === 'process' && pageView === 'refunds' && (
            <>
          <button
            type="button"
            onClick={() => {
              void refundsQuery.refetch();
              void summaryQuery.refetch();
              void Promise.all(countQueries.map((q) => q.refetch()));
            }}
            className="btn-outline p-2.5"
            aria-label="Refresh refunds"
          >
            <RefreshCw size={15} className={refundsQuery.isFetching ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleExportExcel();
            }}
            disabled={exporting}
            className="btn-outline px-3 py-2.5 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export
          </button>
            </>
          )}
        </div>
      </div>
      )}

      <div className="flex gap-2 mb-6" role="tablist" aria-label="Refund views">
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMainTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                isActive ? 'bg-brand text-white' : 'bg-navy-light text-muted'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon size={14} />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {mainTab === 'analytics' ? (
        <RefundAnalyticsPanel
          showBranchFilter={showStoreColumn}
          onBackToProcess={() => setMainTab('process')}
        />
      ) : superAdmin && pageView === 'reasons' ? (
        <CancelReasonConfigPanel />
      ) : superAdmin && pageView === 'status-refunds' ? (
        <OrderStatusRefundConfigPanel />
      ) : (
      <>
      <div className="mb-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:items-stretch">
          <SparklineKpiCard
            label="Customer receive"
            value={summaryQuery.data ? formatMoney(summaryQuery.data.customerReceiveTotalLkr) : '—'}
            icon={User}
            tone="green"
            loading={summaryQuery.isLoading}
          />
          <SparklineKpiCard
            label="Branch receive"
            value={summaryQuery.data ? formatMoney(summaryQuery.data.branchReceiveTotalLkr) : '—'}
            icon={Store}
            tone="blue"
            loading={summaryQuery.isLoading}
          />
          <SparklineKpiCard
            label="Delivery receive"
            value={summaryQuery.data ? formatMoney(summaryQuery.data.deliveryReceiveTotalLkr) : '—'}
            icon={Truck}
            tone="orange"
            loading={summaryQuery.isLoading}
          />
          <SparklineKpiCard
            label="Platform receive"
            value={summaryQuery.data ? formatMoney(summaryQuery.data.platformReceiveTotalLkr) : '—'}
            icon={Percent}
            tone="purple"
            loading={summaryQuery.isLoading}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Settled refunds only · respects date, branch, and search filters
        </p>
      </div>

      <div className="orders-table-shell">
        <div className="orders-capsule-tabs-row">
          <div className="orders-capsule-tabs" role="tablist" aria-label="Refund status">
            {STATUS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = statusTab === tab.id;
              const count = tabCounts[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setStatusTab(tab.id)}
                  className={`orders-capsule-tab${isActive ? ' orders-capsule-tab--active' : ''}`}
                >
                  <span className="orders-capsule-tab__icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="orders-capsule-tab__label">{tab.label}</span>
                  <span
                    className={`orders-capsule-tab__badge${
                      tab.id === 'RECEIVED' && count > 0 ? ' orders-capsule-tab__badge--alert' : ''
                    }`}
                    aria-label={`${count} ${tab.label.toLowerCase()}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="admin-orders-toolbar refunds-toolbar border-b border-navy-border p-4 sm:p-5">
            <div className={`input-icon-wrap admin-orders-toolbar__search flex-1 min-w-[12rem]${searchInput ? ' input-icon-wrap--end' : ''}`}>
              <Search size={16} className="input-icon" aria-hidden />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by order number…"
                className="search-bar"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="input-action p-1 text-muted hover:text-fg"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {showStoreColumn && (
              <div className="admin-orders-toolbar__branch">
                <SearchableBranchSelect
                  stores={storesQuery.data ?? []}
                  value={storeFilter || undefined}
                  onChange={(id) => {
                    setStoreFilter(id);
                    setPage(1);
                  }}
                  formatName={shortBranchName}
                  placeholder="All branches"
                  className="filter-select w-full"
                />
              </div>
            )}

            <div className="admin-orders-toolbar__actions refunds-toolbar__date-actions">
              <DateRangePicker
                value={dateRange}
                onChange={(range) => {
                  setDateRange(range);
                  setPage(1);
                }}
                showClear={false}
                className="admin-orders-toolbar__date-range"
              />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn-outline admin-orders-toolbar__reset text-xs"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {refundsQuery.isLoading ? (
            <div className="overflow-x-auto">
              <table className="admin-table w-full text-sm">
                <thead>
                  <tr>
                    {tableHeaders.map((h) => (
                      <th key={h} className={`px-4 py-3 text-left text-muted text-xs font-medium whitespace-nowrap${
                        h === 'Refund amount' || h === 'Total order amount' ? ' text-right' : ''
                      }`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <RefundTableSkeleton colSpan={colSpan} />
                </tbody>
              </table>
            </div>
          ) : refundsQuery.isError ? (
            <div className="p-8 text-center text-red-400 text-sm">Failed to load refunds. Please try again.</div>
          ) : refunds.length === 0 ? (
            <div className="p-12 text-center">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                style={{ background: 'rgba(48,126,242,0.12)' }}
              >
                <Clock3 size={28} className="text-muted" />
              </div>
              <h3 className="text-lg font-semibold text-fg mb-2">No Refunds Found</h3>
              <p className="text-muted text-sm max-w-sm mx-auto">
                {debouncedSearch
                  ? `No refunds match "${debouncedSearch}". Try a different search term.`
                  : statusTab !== 'ALL'
                    ? `No ${STATUS_TABS.find((t) => t.id === statusTab)?.label?.toLowerCase()} refunds yet.`
                    : 'No refund requests have been submitted yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table w-full text-sm">
                <thead>
                  <tr>
                    {tableHeaders.map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-left text-muted text-xs font-medium whitespace-nowrap${
                          h === 'Refund amount' || h === 'Total order amount' ? ' text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((refund) => (
                    <tr
                      key={refund.id}
                      onClick={() => setSelectedRefundId(refund.id)}
                      className="border-b border-navy-border hover:bg-navy-light/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="text-sm text-fg tabular-nums">
                          {formatDateTime(refund.createdAt, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-xs text-muted tabular-nums mt-0.5">
                          {formatDateTime(refund.createdAt, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <RefundRequestTypeBadge
                          refund={refund}
                          cancelWindowMinutes={cancelWindowMinutes}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="admin-table__order-num">
                          {refund.order.orderNumber}
                        </span>
                        <div className="text-xs text-muted mt-0.5">
                          {refund.order.orderMode === 'DELIVERY' ? 'Delivery' : 'Pick up'}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-fg">{customerDisplayName(refund)}</div>
                        {(refund.order.user?.phone || refund.order.guestPhone) && (
                          <div className="text-xs text-muted mt-0.5">
                            {refund.order.user?.phone || refund.order.guestPhone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top admin-table__amount whitespace-nowrap tabular-nums">
                        LKR {formatLkr(refund.orderTotal)}
                      </td>
                      {showStoreColumn && (
                        <td className="px-4 py-3 text-muted text-xs align-top">
                          {refund.order.store?.name ? shortBranchName(refund.order.store.name) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <CancelledAtStatusBadge refund={refund} />
                      </td>
                      <td className="px-4 py-3 text-xs text-fg align-top max-w-[220px]">
                        <span className="line-clamp-2" title={formatReason(refund)}>
                          {formatReason(refund)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right align-top admin-table__amount whitespace-nowrap tabular-nums">
                        {refund.refundAmount != null ? `LKR ${formatLkr(refund.refundAmount)}` : '—'}
                        {refund.refundPercentage != null && (
                          <div className="text-[11px] text-muted">{refund.refundPercentage}%</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <RefundStatusBadge status={refund.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="admin-table-pagination">
          <p className="admin-table-pagination__summary text-xs text-muted">
            Showing{' '}
            <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
            <span className="text-fg font-semibold tabular-nums">{totalItems.toLocaleString()}</span> refunds
          </p>
          <nav className="admin-table-pagination__nav" aria-label="Refunds pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="admin-table-pagination__arrow"
              aria-label="Previous page"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="admin-table-pagination__pages">
              {pageList.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="admin-table-pagination__ellipsis" aria-hidden>
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === page ? 'page' : undefined}
                    className={`admin-table-pagination__page${item === page ? ' admin-table-pagination__page--active' : ''}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="admin-table-pagination__arrow"
              aria-label="Next page"
            >
              <ChevronRight size={20} />
            </button>
          </nav>
        </div>
      )}
      </>
      )}
    </div>
  );
}
