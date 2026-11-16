'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Building2,
  Clock,
  CreditCard,
  ChevronDown,
  ChevronUp,
  History,
  Percent,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WALLET_TAB_TRIGGER_CLASS } from '@/components/admin/useAdminWalletTab';

import toast from 'react-hot-toast';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { formatCommissionRate, type SlabInfo } from '@/components/admin/commissionUtils';
import CommissionBreakdownBadges, {
  type CommissionBreakdown,
} from '@/components/admin/CommissionBreakdownBadges';
import ProcessPaymentBulkModal from '@/components/admin/ProcessPaymentBulkModal';
import PlatformPayoutStatementView from '@/components/admin/PlatformPayoutStatementView';
import SettlementStatementView from '@/components/admin/SettlementStatementView';
import {
  hasWithdrawalInvoice,
  settlementStatusLabel,
  type SettlementStatement,
} from '@/components/admin/settlementTypes';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import {
  openCommissionSettlementReceipt,
  openPayoutProof,
  openPayoutProofById,
  openPlatformProviderSettlementInvoice,
  openWithdrawalInvoice,
} from '@/lib/adminProtectedFile';
import {
  platformPayoutBreakdownApiId,
  platformPayoutInvoiceSettlementId,
} from '@/lib/platformPayoutInvoice';
import {
  fetchPlatformPayoutStatement,
  type PlatformPayoutStatement,
} from '@/lib/platformPayoutStatement';
import {
  fetchPaymentHistoryPendingAll,
  paymentHistoryPendingAllQueryKey,
} from '@/lib/paymentHistoryPendingAll';
import { formatMoney } from '@/lib/receipt';
import { currentMonthKey } from '@/components/admin/MonthPickerSelect';
import {
  currentMonthPeriod,
  monthRange,
  todayDateStr,
} from '@/components/admin/useWalletPeriodFilter';
import {
  filterPayoutRowsForDisplay,
} from '@/components/admin/paymentHistoryPayoutFilter';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import PayoutInlineBreakdown from '@/components/admin/reports/PayoutInlineBreakdown';
import { buildAdminMetaPagination } from '@/lib/pagination';

type PayoutRow = {
  id: string;
  payoutSource?: 'commissionSettlement' | 'branchWithdrawal';
  statementRef: string;
  paidAt: string;
  amount: number;
  platformReceivable?: number;
  platformInvoiceUrl?: string;
  platformReceivableSettlementId?: string;
  paymentMethod: string;
  hasReceipt?: boolean;
  receiptUrl: string | null;
  invoiceUrl?: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  periodFrom: string;
  periodTo: string;
  storeWithdrawalId?: string;
  walletTransactionId?: string;
  isAdvance?: boolean;
  storeName?: string;
};

type PayoutHistoryView = 'commission' | 'platform';

type PayoutHistoryPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

const PAYOUT_HISTORY_PAGE_SIZE = 20;

type PaymentHistoryData = {
  pendingDues: number;
  totalSettled: number;
  thisMonthCommission: number;
  currentMonthBase?: number;
  currentMonthRate?: number;
  breakdown: CommissionBreakdown;
  monthlyBreakdown?: CommissionBreakdown;
  slabInfo?: SlabInfo;
  period?: { from: string; to: string; isCurrentMonth: boolean };
  payouts: PayoutRow[];
  platformPayouts?: PayoutRow[];
  payoutsPagination?: PayoutHistoryPagination;
  platformPayoutsPagination?: PayoutHistoryPagination;
};

function billingMonthOptions(count = 36) {
  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return options;
}

function formatMonthOption(ym: string) {
  const [year, month] = ym.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-LK', {
    month: 'long',
    year: 'numeric',
  });
}

function payoutPaidOn(row: PayoutRow): string {
  const d = new Date(row.paidAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatPeriodLabel(from: string, to: string) {
  return formatPeriod(from, to);
}

function formatBranchName(name: string) {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}

function adminApi<T>(endpoint: string): Promise<T> {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  })
    .then((r) => r.json())
    .then((d) => {
      if (!d.success) throw new Error(d.message || 'Request failed');
      return d.data as T;
    });
}

function formatPayoutDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPeriod(from: string, to: string) {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-LK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function payoutRowBreakdownAvailable(
  row: PayoutRow,
  view: PayoutHistoryView,
  platformTabEnabled: boolean,
): boolean {
  if (platformTabEnabled && view === 'platform') return true;
  if (row.payoutSource === 'branchWithdrawal') return !!row.walletTransactionId;
  return true;
}

function statusChipClass(status: PayoutRow['status']) {
  switch (status) {
    case 'VERIFIED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300';
    case 'REJECTED':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300';
  }
}

const TABLE_SKELETON_WIDTHS = [
  'w-24',
  'w-28',
  'w-36',
  'w-20',
  'w-24',
  'w-16',
  'w-20',
  'w-20',
  'w-16',
] as const;

function PaymentHistoryTableSkeleton({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, row) => (
        <tr key={row} className="border-b border-[var(--color-navy-border)]/60 last:border-b-0">
          {Array.from({ length: colSpan }).map((__, col) => (
            <td
              key={col}
              className={col >= colSpan - 2 ? 'px-4 py-3 text-right' : 'px-4 py-3'}
            >
              <Skeleton
                className={`h-3.5 bg-[var(--color-navy-light)]/70 ${TABLE_SKELETON_WIDTHS[col] ?? 'w-20'} ${col >= colSpan - 2 ? 'ml-auto' : ''}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function PaymentHistoryContent({
  title = 'Settlement Payouts',
  subtitle,
  headerIcon: HeaderIcon = History,
  embedded = false,
  periodFrom: controlledFrom,
  periodTo: controlledTo,
  actionsPortalId,
  processPortalId,
}: {
  title?: string;
  subtitle?: string;
  headerIcon?: typeof History;
  /** When true, omits page title wrapper for embedding inside Branch Wallet tabs. */
  embedded?: boolean;
  /** Shared wallet period (skips local billing-month controls when set with `to`). */
  periodFrom?: string;
  periodTo?: string;
  /** Host element id for the branch filter in the wallet tabs toolbar. */
  actionsPortalId?: string;
  /** Host element id for Process Payment in the wallet tabs toolbar. */
  processPortalId?: string;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId') ?? undefined;
  const [adminUser, setAdminUser] = useState<AdminSession | null>(() => getAdminSession());
  const [processOpen, setProcessOpen] = useState(false);
  const [statement, setStatement] = useState<SettlementStatement | null>(null);
  const [platformStatement, setPlatformStatement] = useState<PlatformPayoutStatement | null>(null);
  const [loadingStatementId, setLoadingStatementId] = useState<string | null>(null);
  const [periodFrom, setPeriodFrom] = useState(() => controlledFrom ?? currentMonthPeriod().from);
  const [periodTo, setPeriodTo] = useState(() => controlledTo ?? currentMonthPeriod().to);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [payoutMonth, setPayoutMonth] = useState('');
  const [payoutDateFrom, setPayoutDateFrom] = useState('');
  const [payoutDateTo, setPayoutDateTo] = useState('');
  const [payoutHistoryView, setPayoutHistoryView] = useState<PayoutHistoryView>('commission');
  const [payoutHistoryPage, setPayoutHistoryPage] = useState(1);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [processHost, setProcessHost] = useState<HTMLElement | null>(null);

  const periodControlled = !!controlledFrom && !!controlledTo;
  /** Embedded under Wallet uses the shared period bar — hide local month/date filters. */
  const hideLocalPeriodControls = embedded || periodControlled;

  useLayoutEffect(() => {
    setActionsHost(actionsPortalId ? document.getElementById(actionsPortalId) : null);
    setProcessHost(processPortalId ? document.getElementById(processPortalId) : null);
  }, [actionsPortalId, processPortalId]);

  useEffect(() => {
    setAdminUser(getAdminSession());
  }, []);

  useEffect(() => {
    if (!periodControlled) return;
    setPeriodFrom(controlledFrom);
    setPeriodTo(controlledTo);
    setSelectedPayoutId(null);
    setPayoutMonth('');
    setPayoutDateFrom('');
    setPayoutDateTo('');
  }, [periodControlled, controlledFrom, controlledTo]);

  const superAdmin = isSuperAdmin(adminUser);
  const queryClient = useQueryClient();

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: () => adminApi<Array<{ id: string; name: string }>>('/stores'),
    enabled: superAdmin,
  });

  const setSelectedStoreId = useCallback(
    (storeId: string) => {
      // Live location search — do not clobber ?tab= / period params from a stale snapshot.
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : searchParams.toString(),
      );
      if (storeId) {
        params.set('storeId', storeId);
      } else {
        params.delete('storeId');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const effectiveStoreId = superAdmin ? storeIdParam : adminUser?.storeId ?? undefined;

  const showBranchColumn = superAdmin && !effectiveStoreId;
  const payoutTableColSpan = showBranchColumn ? 9 : 8;
  const branchTierScoped = !superAdmin || Boolean(effectiveStoreId);

  useEffect(() => {
    setPayoutHistoryPage(1);
  }, [effectiveStoreId, periodFrom, periodTo, payoutHistoryView]);

  const queryKey = [
    'payment-history',
    effectiveStoreId,
    periodFrom,
    periodTo,
    payoutHistoryPage,
    PAYOUT_HISTORY_PAGE_SIZE,
  ];
  const endpoint = (() => {
    const qs = new URLSearchParams({
      from: periodFrom,
      to: periodTo,
      page: String(payoutHistoryPage),
      limit: String(PAYOUT_HISTORY_PAGE_SIZE),
    });
    if (effectiveStoreId) qs.set('storeId', effectiveStoreId);
    return `/admin/payment-history?${qs}`;
  })();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PaymentHistoryData>({
    queryKey,
    queryFn: () => adminApi<PaymentHistoryData>(endpoint),
    enabled: !!adminUser,
    placeholderData: keepPreviousData,
  });

  const tableLoading = isLoading || isFetching;

  const canProcessPayment = superAdmin && !!periodFrom && !!periodTo;

  useEffect(() => {
    if (!canProcessPayment) return;
    void queryClient.prefetchQuery({
      queryKey: paymentHistoryPendingAllQueryKey(periodFrom, periodTo),
      queryFn: () => fetchPaymentHistoryPendingAll(periodFrom, periodTo),
      staleTime: 60_000,
    });
  }, [canProcessPayment, periodFrom, periodTo, queryClient]);

  const processDisabledReason = !superAdmin
    ? undefined
    : !periodFrom || !periodTo
      ? 'Select a billing period first'
      : undefined;

  const openSettlement = useCallback(async (id: string) => {
    setLoadingStatementId(id);
    try {
      const result = await adminApi<SettlementStatement>(
        `/admin/payment-history/settlements/${encodeURIComponent(id)}`,
      );
      setStatement(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load settlement breakdown');
    } finally {
      setLoadingStatementId(null);
    }
  }, []);

  const viewingCurrentMonth = data?.period?.isCurrentMonth ?? (
    periodFrom === currentMonthPeriod().from && periodTo === currentMonthPeriod().to
  );

  const selectedBillingMonth = periodFrom.slice(0, 7);

  const selectBillingMonth = useCallback((ym: string) => {
    if (!ym || hideLocalPeriodControls) return;
    if (ym === currentMonthKey()) {
      const { from, to } = currentMonthPeriod();
      setPeriodFrom(from);
      setPeriodTo(to);
    } else {
      const { from, to } = monthRange(ym);
      setPeriodFrom(from);
      setPeriodTo(to);
    }
    setSelectedPayoutId(null);
  }, [hideLocalPeriodControls]);

  const openPlatformPayoutBreakdown = useCallback(async (apiId: string, rowId: string) => {
    setLoadingStatementId(rowId);
    try {
      const result = await fetchPlatformPayoutStatement(apiId);
      setPlatformStatement(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load platform payout breakdown');
      setSelectedPayoutId(null);
      setPlatformStatement(null);
    } finally {
      setLoadingStatementId(null);
    }
  }, []);

  const togglePayoutBreakdownForRow = useCallback(
    (row: PayoutRow) => {
      if (selectedPayoutId === row.id) {
        setSelectedPayoutId(null);
        setStatement(null);
        setPlatformStatement(null);
        return;
      }

      setSelectedPayoutId(row.id);

      if (superAdmin && payoutHistoryView === 'platform') {
        setStatement(null);
        void openPlatformPayoutBreakdown(platformPayoutBreakdownApiId(row), row.id);
        return;
      }

      setPlatformStatement(null);

      if (row.payoutSource === 'branchWithdrawal') {
        setStatement(null);
        if (!row.walletTransactionId) {
          toast.error('Payout breakdown is not available for this record');
          setSelectedPayoutId(null);
        }
        return;
      }

      void openSettlement(row.id);
    },
    [openPlatformPayoutBreakdown, openSettlement, payoutHistoryView, selectedPayoutId, superAdmin],
  );

  const selectPayoutPeriod = (row: PayoutRow) => {
    if (!hideLocalPeriodControls) {
      setPeriodFrom(row.periodFrom);
      setPeriodTo(row.periodTo);
    }
    togglePayoutBreakdownForRow(row);
  };

  const isPayoutBreakdownOpen = useCallback(
    (row: PayoutRow) => {
      if (selectedPayoutId !== row.id) return false;
      if (superAdmin && payoutHistoryView === 'platform') {
        return !!platformStatement || loadingStatementId === row.id;
      }
      if (row.payoutSource === 'branchWithdrawal') return !!row.walletTransactionId;
      return !!statement;
    },
  [loadingStatementId, payoutHistoryView, platformStatement, selectedPayoutId, superAdmin, statement],
  );

  const billingMonths = useMemo(() => billingMonthOptions(), []);

  const payoutMonths = useMemo(() => {
    const rows = [
      ...(data?.payouts ?? []),
      ...(superAdmin ? data?.platformPayouts ?? [] : []),
    ];
    if (rows.length === 0) return [];
    const months = new Set<string>();
    for (const row of rows) {
      months.add(payoutPaidOn(row).slice(0, 7));
    }
    return Array.from(months).sort().reverse();
  }, [data?.payouts, data?.platformPayouts, superAdmin]);

  const filteredPayouts = useMemo(() => {
    if (!data?.payouts) return [];
    return filterPayoutRowsForDisplay(data.payouts, {
      periodControlled,
      embedded,
      payoutMonth,
      payoutDateFrom,
      payoutDateTo,
      monthRange,
    });
  }, [
    data?.payouts,
    embedded,
    periodControlled,
    payoutMonth,
    payoutDateFrom,
    payoutDateTo,
  ]);

  const filteredPlatformPayouts = useMemo(() => {
    if (!data?.platformPayouts?.length) return [];
    return filterPayoutRowsForDisplay(data.platformPayouts, {
      periodControlled,
      embedded,
      payoutMonth,
      payoutDateFrom,
      payoutDateTo,
      monthRange,
    });
  }, [
    data?.platformPayouts,
    embedded,
    periodControlled,
    payoutMonth,
    payoutDateFrom,
    payoutDateTo,
  ]);

  const showPlatformPayoutHistoryTab = superAdmin;
  const activePayoutRows =
    showPlatformPayoutHistoryTab && payoutHistoryView === 'platform'
      ? filteredPlatformPayouts
      : filteredPayouts;
  const payoutAmountColumnLabel =
    showPlatformPayoutHistoryTab && payoutHistoryView === 'platform'
      ? 'Platform receivable'
      : 'Net branch payout';

  const payoutFiltersActive = hideLocalPeriodControls
    ? false
    : !!(payoutMonth || payoutDateFrom || payoutDateTo);

  const activePayoutPagination =
    showPlatformPayoutHistoryTab && payoutHistoryView === 'platform'
      ? data?.platformPayoutsPagination
      : data?.payoutsPagination;

  const payoutTablePagination = useMemo(() => {
    const meta = activePayoutPagination;
    if (!meta || meta.total <= 0) return null;
    return buildAdminMetaPagination(meta.total, meta.page, meta.limit, meta.pages);
  }, [activePayoutPagination]);

  const clearPayoutFilters = () => {
    setPayoutMonth('');
    setPayoutDateFrom('');
    setPayoutDateTo('');
  };

  const compactControlClass =
    'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold disabled:opacity-50';

  const branchSelect =
    superAdmin && stores.length > 0 ? (
      <div className="shrink-0 [&_button]:h-8 [&_button]:rounded-[10px] [&_button]:py-0 [&_button]:text-[13px]">
        <SearchableBranchSelect
          stores={stores}
          value={effectiveStoreId}
          onChange={setSelectedStoreId}
          formatName={formatBranchName}
          allowAll={false}
          placeholder="Select branch"
          className="w-auto"
        />
      </div>
    ) : null;

  const processPaymentButton = superAdmin ? (
    <button
      type="button"
      className={`${compactControlClass} shrink-0 border-0 bg-[var(--color-brand,#307ef2)] !text-white [&_svg]:!text-white`}
      disabled={!canProcessPayment}
      title={processDisabledReason}
      onClick={() => setProcessOpen(true)}
    >
      <CreditCard size={14} strokeWidth={2} />
      Process Payment
    </button>
  ) : null;

  const processAndBranchActions =
    superAdmin ? (
      <>
        {branchSelect}
        {processPaymentButton}
      </>
    ) : null;

  const headerBlock = embedded ? (
    <>
      {actionsHost && branchSelect ? createPortal(branchSelect, actionsHost) : null}
      {processHost && processPaymentButton ? createPortal(processPaymentButton, processHost) : null}
      {!actionsPortalId && !processPortalId && processAndBranchActions ? (
        <div className="mb-3 flex flex-nowrap items-center justify-end gap-2 max-sm:flex-wrap">
          {processAndBranchActions}
        </div>
      ) : null}
    </>
  ) : (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(48,126,242,0.1)] text-[var(--color-brand,#307ef2)]"
          aria-hidden
        >
          <HeaderIcon size={16} strokeWidth={2} />
        </div>
        <h1 className="m-0 text-lg font-bold tracking-tight text-fg">{title}</h1>
        {subtitle && (
          <p className="hidden min-w-0 max-w-[200px] truncate text-sm text-muted lg:block xl:max-w-[280px]">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-nowrap items-center justify-end gap-2 max-sm:flex-wrap">
        <select
          value={selectedBillingMonth}
          onChange={(e) => selectBillingMonth(e.target.value)}
          className="input-field h-8 w-auto min-w-[9.5rem] rounded-[10px] py-0 text-[13px]"
          aria-label="Billing month"
        >
          {billingMonths.map((ym) => (
            <option key={ym} value={ym}>
              {formatMonthOption(ym)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${compactControlClass} border border-[var(--color-navy-border)] bg-transparent text-fg`}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
        {processAndBranchActions}
      </div>
    </div>
  );

  const body = (
    <>
      {headerBlock}

      {isError && (
        <div className="card mb-3 flex items-start gap-3 border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Could not load settlement payouts</p>
            <p className="mt-1 text-xs opacity-90">
              {error instanceof Error ? error.message : 'Something went wrong'}
            </p>
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          variant="finance"
          label={viewingCurrentMonth ? 'Total Monthly Subtotal' : 'Period Subtotal'}
          value={formatMoney(data?.currentMonthBase ?? 0)}
          icon={Wallet}
          loading={isLoading}
          hint={
            viewingCurrentMonth
              ? 'Item subtotal this month (excl. delivery & convenience fees)'
              : `Sales in selected period · ${formatPeriodLabel(periodFrom, periodTo)}`
          }
        />
        <DashboardKpiCard
          variant="finance"
          label={viewingCurrentMonth ? 'Monthly Commission' : 'Period Commission'}
          value={formatMoney(data?.thisMonthCommission ?? 0)}
          icon={Percent}
          loading={isLoading}
          hint={
            branchTierScoped && data?.currentMonthRate != null && data.currentMonthRate > 0
              ? `Earned at ${formatCommissionRate(data.currentMonthRate)} tier rate`
              : viewingCurrentMonth
                ? branchTierScoped
                  ? 'Current calendar month (tiered rate)'
                  : 'Network commission — select a branch for tier rate'
                : branchTierScoped
                  ? 'Selected period (tiered rate)'
                  : 'Network commission — select a branch for tier rate'
          }
        />
        <DashboardKpiCard
          variant="finance"
          label="Total Settled"
          value={formatMoney(data?.totalSettled ?? 0)}
          icon={CreditCard}
          loading={isLoading}
          hint="Verified commission settlements paid to company"
        />
        <DashboardKpiCard
          variant="finance"
          label="Remaining Commission Due"
          value={formatMoney(data?.pendingDues ?? 0)}
          icon={Clock}
          loading={isLoading}
          hint="Outstanding commission owed (all time)"
        />
      </div>

      <div className="mb-3">
        <CommissionBreakdownBadges
          breakdown={data?.monthlyBreakdown ?? data?.breakdown}
          loading={isLoading}
          slabInfo={data?.slabInfo}
          periodLabel={formatPeriodLabel(periodFrom, periodTo)}
          isCurrentMonth={viewingCurrentMonth}
          showActiveTierLabel={!superAdmin}
          showCurrentTierStatus={branchTierScoped}
          branchTierFilter={
            superAdmin && stores.length > 0 ? (
              <SearchableBranchSelect
                stores={stores}
                value={effectiveStoreId}
                onChange={setSelectedStoreId}
                formatName={formatBranchName}
                allowAll={false}
                placeholder="Select branch"
                className="min-w-[10rem]"
              />
            ) : undefined
          }
        />
      </div>

      <div className="admin-orders-table card overflow-hidden !rounded-[10px]">
        <div className="border-b border-[var(--color-navy-border)] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              {showPlatformPayoutHistoryTab ? (
                <Tabs
                  value={payoutHistoryView}
                  onValueChange={(v) => setPayoutHistoryView(v as PayoutHistoryView)}
                  className="gap-2"
                >
                  <div className="flex items-start gap-2">
                    {payoutHistoryView === 'platform' ? (
                      <Building2 size={16} className="mt-0.5 shrink-0 text-[var(--color-brand)]" />
                    ) : (
                      <History size={16} className="mt-0.5 shrink-0 text-[var(--color-brand)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <TabsList className="mb-2 h-8 w-fit justify-start gap-0.5 bg-transparent p-0 shadow-none">
                        <TabsTrigger value="commission" className={WALLET_TAB_TRIGGER_CLASS}>
                          Branch Payout History
                        </TabsTrigger>
                        <TabsTrigger value="platform" className={WALLET_TAB_TRIGGER_CLASS}>
                          Platform Payout History
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="commission" className="mt-0 outline-none">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {hideLocalPeriodControls
                            ? `Click a row to view the branch payout breakdown · ${formatPeriodLabel(periodFrom, periodTo)}`
                            : 'Click a row to view the branch payout breakdown · filter by billing period or paid date'}
                        </p>
                      </TabsContent>
                      <TabsContent value="platform" className="mt-0 outline-none">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {hideLocalPeriodControls
                            ? `Click a row to view the platform receivable breakdown · ${formatPeriodLabel(periodFrom, periodTo)}`
                            : 'Click a row to view the platform receivable breakdown · filter by billing period or paid date'}
                        </p>
                      </TabsContent>
                    </div>
                  </div>
                </Tabs>
              ) : (
                <div className="flex items-center gap-2">
                  <History size={16} className="text-[var(--color-brand)]" />
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text)]">Payout History</h2>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {hideLocalPeriodControls
                        ? `Click a row to view the settlement breakdown · ${formatPeriodLabel(periodFrom, periodTo)}`
                        : 'Click a row to view the settlement breakdown · filter by settlement billing period'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {!hideLocalPeriodControls && (
            <div className="flex flex-wrap items-end gap-2 lg:justify-end">
              <div className="min-w-[140px]">
                <label
                  htmlFor="payout-month-filter"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                >
                  Month
                </label>
                <select
                  id="payout-month-filter"
                  value={payoutMonth}
                  onChange={(e) => {
                    setPayoutMonth(e.target.value);
                    setPayoutDateFrom('');
                    setPayoutDateTo('');
                  }}
                  className="input-field w-full text-xs"
                >
                  <option value="">All months</option>
                  {payoutMonths.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatMonthOption(ym)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="payout-from-filter"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                >
                  From
                </label>
                <input
                  id="payout-from-filter"
                  type="date"
                  value={payoutDateFrom}
                  max={payoutDateTo || todayDateStr()}
                  onChange={(e) => {
                    setPayoutMonth('');
                    setPayoutDateFrom(e.target.value);
                  }}
                  className="input-field w-full text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor="payout-to-filter"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                >
                  To
                </label>
                <input
                  id="payout-to-filter"
                  type="date"
                  value={payoutDateTo}
                  min={payoutDateFrom || undefined}
                  max={todayDateStr()}
                  onChange={(e) => {
                    setPayoutMonth('');
                    setPayoutDateTo(e.target.value);
                  }}
                  className="input-field w-full text-xs"
                />
              </div>
              {payoutFiltersActive && (
                <button
                  type="button"
                  onClick={clearPayoutFilters}
                  className="rounded-lg border border-[var(--color-navy-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)]"
                >
                  Clear
                </button>
              )}
            </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-navy-border)]/70 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="!bg-transparent px-4 py-2.5">Date</th>
                {showBranchColumn && <th className="!bg-transparent px-4 py-2.5">Branch</th>}
                <th className="!bg-transparent px-4 py-2.5">Period</th>
                <th className="!bg-transparent px-4 py-2.5">{payoutAmountColumnLabel}</th>
                <th className="!bg-transparent px-4 py-2.5">Payment Method</th>
                <th className="!bg-transparent px-4 py-2.5">Status</th>
                <th className="!bg-transparent px-4 py-2.5 text-right">Invoice</th>
                <th className="!bg-transparent px-4 py-2.5 text-right">Receipt</th>
                <th className="!bg-transparent px-4 py-2.5 text-right">Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading && <PaymentHistoryTableSkeleton colSpan={payoutTableColSpan} />}
              {!tableLoading && !isError && activePayoutRows.length === 0 && (
                <tr>
                  <td colSpan={payoutTableColSpan} className="px-4 py-8 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-[var(--color-text-muted)]">
                      <CreditCard size={28} className="opacity-40" />
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {payoutFiltersActive
                          ? 'No records match your filters'
                          : payoutHistoryView === 'platform'
                            ? hideLocalPeriodControls
                              ? 'No platform payouts recorded for this period'
                              : 'No platform payouts recorded yet'
                            : hideLocalPeriodControls
                              ? 'No settlements recorded for this period'
                              : 'No settlements recorded yet'}
                      </p>
                      <p className="text-xs leading-relaxed">
                        {payoutFiltersActive
                          ? 'Try a different month or date range, or clear the payout filters.'
                          : payoutHistoryView === 'platform'
                            ? hideLocalPeriodControls
                              ? 'Records appear here after you process platform provider payments for approved branch payout periods in this billing window.'
                              : 'Records appear here after platform provider payments are processed for approved branch payout periods.'
                            : hideLocalPeriodControls
                              ? 'Commission is calculated from paid orders. Payout records appear here once settlements are submitted for this billing period.'
                              : 'Commission is calculated from paid orders. Payout records will appear here once settlements are submitted.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {!tableLoading &&
                activePayoutRows.map((row) => {
                const isSelected =
                  selectedPayoutId === row.id ||
                  (row.periodFrom === periodFrom && row.periodTo === periodTo);
                const showBranchPayoutBreakdown =
                  payoutHistoryView === 'commission' &&
                  selectedPayoutId === row.id &&
                  row.payoutSource === 'branchWithdrawal' &&
                  !!row.walletTransactionId;
                return (
                  <Fragment key={row.id}>
                  <tr
                    className={[
                      'cursor-pointer border-b border-[var(--color-navy-border)]/60 hover:bg-[var(--color-input-bg)]/40',
                      showBranchPayoutBreakdown ? 'border-b-0' : 'last:border-b-0',
                      isSelected ? 'bg-[var(--color-brand-subtle)]/50' : '',
                    ].join(' ')}
                    onClick={() => selectPayoutPeriod(row)}
                  >
                    <td className="px-4 py-2.5 text-[var(--color-text)]">
                      {formatPayoutDate(row.paidAt)}
                    </td>
                    {showBranchColumn && (
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                        {row.storeName ? formatBranchName(row.storeName) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                      {formatPeriod(row.periodFrom, row.periodTo)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums text-[var(--color-text)]">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                      <span className="block max-w-[14rem] text-xs leading-snug">{row.paymentMethod}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChipClass(row.status)}`}
                      >
                        {loadingStatementId === row.id
                          ? 'Loading…'
                          : settlementStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {showPlatformPayoutHistoryTab && payoutHistoryView === 'platform' ? (
                        (() => {
                          const invoiceSettlementId = platformPayoutInvoiceSettlementId(row);
                          return invoiceSettlementId ? (
                            <button
                              type="button"
                              className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openPlatformProviderSettlementInvoice(invoiceSettlementId).catch(
                                  () => {
                                    toast.error('Could not open invoice');
                                  },
                                );
                              }}
                            >
                              View Invoice
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--color-text-muted)]">—</span>
                          );
                        })()
                      ) : hasWithdrawalInvoice(row.invoiceUrl) ? (
                        <button
                          type="button"
                          className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openWithdrawalInvoice(row.invoiceUrl).catch(() => {
                              toast.error('Could not open invoice');
                            });
                          }}
                        >
                          View Invoice
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.hasReceipt || row.receiptUrl ? (
                        <button
                          type="button"
                          className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            const open = row.receiptUrl
                              ? openPayoutProof(row.receiptUrl)
                              : row.payoutSource === 'branchWithdrawal'
                                ? openPayoutProofById('withdrawal', row.storeWithdrawalId ?? row.id)
                                : openCommissionSettlementReceipt(row.id);
                            void open.catch(() => {
                              toast.error('Could not open payment receipt');
                            });
                          }}
                        >
                          View Receipt
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {payoutRowBreakdownAvailable(row, payoutHistoryView, showPlatformPayoutHistoryTab) ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-end gap-1 text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePayoutBreakdownForRow(row);
                          }}
                        >
                          {loadingStatementId === row.id ? (
                            'Loading…'
                          ) : isPayoutBreakdownOpen(row) ? (
                            <>
                              <ChevronUp size={14} />
                              Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              View
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                  <PayoutInlineBreakdown
                    transactionId={row.walletTransactionId}
                    open={showBranchPayoutBreakdown}
                    colSpan={payoutTableColSpan}
                  />
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {payoutTablePagination && (
          <AdminTablePagination
            className="border-t border-[var(--color-navy-border)] px-4 py-3"
            pageSize={PAYOUT_HISTORY_PAGE_SIZE}
            showPageSizeSelect={false}
            rangeStart={payoutTablePagination.rangeStart}
            rangeEnd={payoutTablePagination.rangeEnd}
            totalItems={payoutTablePagination.totalItems}
            safePage={payoutTablePagination.safePage}
            totalPages={payoutTablePagination.totalPages}
            pageList={payoutTablePagination.pageList}
            onPageChange={setPayoutHistoryPage}
            itemLabel="payouts"
            ariaLabel="Payout history pagination"
          />
        )}
      </div>

      {superAdmin && (
        <ProcessPaymentBulkModal
          open={processOpen}
          onClose={() => setProcessOpen(false)}
          periodFrom={periodFrom}
          periodTo={periodTo}
          onCompleted={() => {
            void refetch();
            void queryClient.invalidateQueries({
              queryKey: ['payment-history-pending-all'],
            });
          }}
        />
      )}

      <SettlementStatementView
        statement={statement}
        onClose={() => {
          setStatement(null);
          setSelectedPayoutId(null);
        }}
      />
      <PlatformPayoutStatementView
        statement={platformStatement}
        onClose={() => {
          setPlatformStatement(null);
          setSelectedPayoutId(null);
        }}
      />
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <div className="admin-dashboard mx-auto max-w-[1400px]">
      {body}
    </div>
  );
}
