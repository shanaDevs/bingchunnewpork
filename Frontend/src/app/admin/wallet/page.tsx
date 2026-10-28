'use client';

import { getApiBaseUrl } from '@/lib/apiBase';
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Wallet, RefreshCw, AlertCircle, ArrowDownToLine, Shield } from 'lucide-react';
import { getAdminSession, isPickupOnlyBranchAdmin, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import BranchWalletDetailModal from '@/components/admin/BranchWalletDetailModal';
import AdminInitiatePayoutModal from '@/components/admin/AdminInitiatePayoutModal';
import WalletWithdrawalModal from '@/components/admin/WalletWithdrawalModal';
import {
  WITHDRAWAL_PAGE_SIZE,
  type WithdrawalPagination,
  type WithdrawalRow,
} from '@/components/admin/WalletWithdrawalTable';
import BranchWalletTabs from '@/components/admin/BranchWalletTabs';
import SuperAdminWalletTabs from '@/components/admin/SuperAdminWalletTabs';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import {
  duePeriodFocusFromRow,
  type DuePeriodFocus,
} from '@/components/admin/payoutPeriodView';
import type { BranchWalletDashboard } from '@/components/admin/BranchWalletSummaryCards';
import type { StoreWallet } from '@/components/admin/SuperAdminSystemWalletTab';
import WalletPeriodFilterBar from '@/components/admin/WalletPeriodFilterBar';
import { currentMonthPeriod, useWalletPeriodFilter } from '@/components/admin/useWalletPeriodFilter';
import {
  fetchPayoutPeriods,
  payoutPeriodsQueryKey,
} from '@/components/admin/BranchPayoutPeriodsSection';
import toast from 'react-hot-toast';
import { adminAuthHeaders } from '@/lib/adminSession';
import {
  normalizeStoreWalletFromApi,
  normalizeWalletSummaryFromApi,
  normalizeWithdrawalFromApi,
} from '@/lib/moneyString';
import {
  branchPayoutsDueQueryKey,
  fetchBranchPayoutsDue,
} from '@/lib/branchPayoutsDue';

type PeriodBranchReport = {
  storeId: string;
  storeName: string;
  totalIn: number;
  pickupOnlineIn: number;
  deliveryCardIn: number;
  totalOut: number;
  currentBalance: number;
};

interface WalletSummary {
  storeId: string;
  currentBalance: number;
  totalEarnings: number;
  netTransferableEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawalTotal: number;
  availableBalance: number;
}

function branchDisplayName(name: string) {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}

/** Flip to true (with backend ENABLE_BRANCH_PAYOUT_REQUESTS) to restore Branch Admin requests. */
const BRANCH_PAYOUT_REQUESTS_ENABLED = false;

const walletTabsFallback = (
  <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
    Loading wallet…
  </div>
);

export default function WalletOverviewPage() {
  return (
    <Suspense fallback={walletTabsFallback}>
      <WalletOverviewPageContent />
    </Suspense>
  );
}

function WalletOverviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const periodFilter = useWalletPeriodFilter();
  const isFiltered = periodFilter.isFiltered;
  const periodFrom = periodFilter.applied?.from ?? null;
  const periodTo = periodFilter.applied?.to ?? null;
  const periodLabel =
    isFiltered && periodFrom && periodTo
      ? periodFrom === periodTo
        ? periodFrom
        : `${periodFrom} → ${periodTo}`
      : null;
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [wallets, setWallets] = useState<StoreWallet[]>([]);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletDashboard, setWalletDashboard] = useState<BranchWalletDashboard | null>(null);
  const [periodBranchReports, setPeriodBranchReports] = useState<PeriodBranchReport[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRow[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [withdrawalPagination, setWithdrawalPagination] = useState<WithdrawalPagination | null>(null);
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [viewWithdrawalTarget, setViewWithdrawalTarget] = useState<WithdrawalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [branchWalletTarget, setBranchWalletTarget] = useState<StoreWallet | null>(null);
  const [duePeriodFocus, setDuePeriodFocus] = useState<DuePeriodFocus | null>(null);
  const [autoInitiatePayout, setAutoInitiatePayout] = useState(false);
  const [initiatePayoutTarget, setInitiatePayoutTarget] = useState<StoreWallet | null>(null);
  const [duePayouts, setDuePayouts] = useState<PayoutDueRow[]>([]);
  const [duePayoutsLoading, setDuePayoutsLoading] = useState(false);
  const [duePayoutsLoadingMore, setDuePayoutsLoadingMore] = useState(false);
  const [initiatePayoutPreset, setInitiatePayoutPreset] = useState<{
    periodFrom: string;
    periodTo: string;
    days: number;
  } | null>(null);
  const [payoutPeriodsRefresh, setPayoutPeriodsRefresh] = useState(0);
  const duePayoutsFetchStarted = useRef(false);
  const duePayoutsRequest = useRef(0);

  const apiBase = getApiBaseUrl();
  const dueTabActive = searchParams.get('tab') === 'due';

  async function readApiError(res: Response, fallback: string): Promise<string> {
    try {
      const json = (await res.json()) as { message?: string };
      const detail = json.message ? `${res.status}: ${json.message}` : String(res.status);
      return `${fallback} (${detail})`;
    } catch {
      return `${fallback} (${res.status})`;
    }
  }

  const fetchWallets = useCallback(async () => {
    setError(null);
    setPeriodLoading(isFiltered);
    try {
      const qs =
        isFiltered && periodFrom && periodTo
          ? `?${new URLSearchParams({ from: periodFrom, to: periodTo })}`
          : '';
      const res = await fetch(`${apiBase}/admin/wallet${qs}`, {
        headers: adminAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to load wallet data'));
      const json = await res.json();
      setWallets(json.data.wallets ?? []);
      setWalletSummary(json.data.summary ?? null);
      setWalletDashboard(json.data.dashboard ?? null);
      if (isFiltered) {
        setPeriodBranchReports((json.data.periodBranchReports ?? []) as PeriodBranchReport[]);
      } else {
        setPeriodBranchReports([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load wallets');
    } finally {
      setPeriodLoading(false);
    }
  }, [apiBase, isFiltered, periodFrom, periodTo]);

  const payoutsDuePeriod = useMemo(() => {
    if (isFiltered && periodFrom && periodTo) {
      return { from: periodFrom, to: periodTo };
    }
    return currentMonthPeriod();
  }, [isFiltered, periodFrom, periodTo]);

  const fetchDuePayouts = useCallback(async (opts?: { preserve?: boolean }) => {
    const preserve = opts?.preserve === true;
    const requestId = ++duePayoutsRequest.current;
    if (preserve) {
      setDuePayoutsLoading(false);
      setDuePayoutsLoadingMore(true);
    } else {
      setDuePayoutsLoading(true);
      setDuePayoutsLoadingMore(false);
      setDuePayouts([]);
    }
    const accumulated: PayoutDueRow[] = [];
    let cursor: string | null = null;
    let first = true;
    const sortDueRows = (rows: PayoutDueRow[]) =>
      [...rows].sort(
        (a, b) => a.periodTo.localeCompare(b.periodTo) || a.storeName.localeCompare(b.storeName),
      );
    try {
      for (;;) {
        if (duePayoutsRequest.current !== requestId) return;
        const qs = new URLSearchParams({
          from: payoutsDuePeriod.from,
          to: payoutsDuePeriod.to,
        });
        if (cursor) qs.set('cursor', cursor);
        const res = await fetch(`${apiBase}/admin/wallet/payouts-due?${qs}`, {
          headers: adminAuthHeaders(), credentials: 'include',
        });
        if (duePayoutsRequest.current !== requestId) return;
        if (!res.ok) return;
        const json = await res.json();
        const page = (json.data ?? {}) as {
          items?: PayoutDueRow[];
          nextCursor?: string | null;
          done?: boolean;
        };
        accumulated.push(...(page.items ?? []));
        if (duePayoutsRequest.current !== requestId) return;
        const incoming = sortDueRows(accumulated);
        const nextCursor = page.nextCursor ?? null;
        const done = page.done || !nextCursor || nextCursor === cursor;
        if (preserve && !done) {
          const seen = new Set(incoming.map((row) => `${row.storeId}|${row.periodFrom}|${row.periodTo}`));
          setDuePayouts((current) =>
            sortDueRows([
              ...current.filter((row) => !seen.has(`${row.storeId}|${row.periodFrom}|${row.periodTo}`)),
              ...incoming,
            ]),
          );
        } else {
          setDuePayouts(incoming);
        }
        if (first) {
          setDuePayoutsLoading(false);
          first = false;
        }
        if (done) {
          setDuePayoutsLoadingMore(false);
          return;
        }
        setDuePayoutsLoadingMore(true);
        cursor = nextCursor;
      }
    } catch {
      // non-critical
    } finally {
      if (duePayoutsRequest.current === requestId) {
        setDuePayoutsLoading(false);
        setDuePayoutsLoadingMore(false);
      }
    }
  }, [apiBase, payoutsDuePeriod.from, payoutsDuePeriod.to]);

  const loadDuePayoutsIfNeeded = useCallback(() => {
    duePayoutsFetchStarted.current = true;
    void fetchDuePayouts();
  }, [fetchDuePayouts]);

  useEffect(() => {
    if (!duePayoutsFetchStarted.current) return;
    void fetchDuePayouts();
    // Only refetch when the applied wallet period changes (not when fetchDuePayouts identity changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutsDuePeriod.from, payoutsDuePeriod.to]);

  const fetchWithdrawals = useCallback(async (page = 1) => {
    setWithdrawalsLoading(true);
    try {
      const historyQs = new URLSearchParams({
        page: String(page),
        limit: String(WITHDRAWAL_PAGE_SIZE),
      });
      const pendingQs = new URLSearchParams({
        status: 'PENDING',
        limit: '50',
      });
      if (isFiltered && periodFrom && periodTo) {
        historyQs.set('from', periodFrom);
        historyQs.set('to', periodTo);
        pendingQs.set('from', periodFrom);
        pendingQs.set('to', periodTo);
      }
      const [historyRes, pendingRes] = await Promise.all([
        fetch(`${apiBase}/admin/wallet/withdrawals?${historyQs}`, {
          headers: adminAuthHeaders(), credentials: 'include',
        }),
        fetch(`${apiBase}/admin/wallet/withdrawals?${pendingQs}`, {
          headers: adminAuthHeaders(), credentials: 'include',
        }),
      ]);
      if (historyRes.ok) {
        const json = await historyRes.json();
        const items = (json.data?.items ?? []).map((row: WithdrawalRow) =>
          normalizeWithdrawalFromApi(row),
        );
        setWithdrawals(items);
        setWithdrawalPagination(
          json.data?.pagination ?? {
            page,
            limit: WITHDRAWAL_PAGE_SIZE,
            total: items.length,
            pages: Math.max(1, Math.ceil(items.length / WITHDRAWAL_PAGE_SIZE)),
          },
        );
        setWithdrawalPage(page);
      }
      if (pendingRes.ok) {
        const json = await pendingRes.json();
        setPendingWithdrawals(json.data?.items ?? []);
      }
    } catch {
      // non-critical
    } finally {
      setWithdrawalsLoading(false);
    }
  }, [apiBase, isFiltered, periodFrom, periodTo]);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      router.replace('/admin/login');
      return;
    }
    if (isSuperAdmin(session) && !searchParams.get('from') && !searchParams.get('to')) {
      const { from, to } = currentMonthPeriod();
      const params = new URLSearchParams(searchParams.toString());
      params.set('from', from);
      params.set('to', to);
      router.replace(`/admin/wallet?${params.toString()}`, { scroll: false });
      return;
    }
    setAdmin(session);
    setLoading(true);
    void fetchWallets().finally(() => setLoading(false));
    void fetchWithdrawals(1);
  }, [fetchWallets, fetchWithdrawals, router, searchParams]);

  const superAdminSession = admin != null && isSuperAdmin(admin);
  const payoutsDuePeriod =
    periodFrom && periodTo ? { from: periodFrom, to: periodTo } : currentMonthPeriod();

  const branchPayoutsDueQuery = useQuery({
    queryKey: branchPayoutsDueQueryKey(payoutsDuePeriod.from, payoutsDuePeriod.to),
    queryFn: ({ signal }) =>
      fetchBranchPayoutsDue(apiBase, payoutsDuePeriod.from, payoutsDuePeriod.to, signal),
    enabled: superAdminSession && dueTabActive && Boolean(periodFrom && periodTo),
    staleTime: 45_000,
  });

  const duePayouts = branchPayoutsDueQuery.data ?? [];
  const duePayoutsLoading =
    branchPayoutsDueQuery.isLoading ||
    (branchPayoutsDueQuery.isFetching && !branchPayoutsDueQuery.isFetched);

  const invalidateBranchPayoutsDue = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['branch-payouts-due'] });
  }, [queryClient]);

  useEffect(() => {
    if (!admin || isSuperAdmin(admin)) return;
    const storeId = walletSummary?.storeId ?? wallets[0]?.storeId;
    if (!storeId) return;
    void queryClient.prefetchQuery({
      queryKey: payoutPeriodsQueryKey(storeId),
      queryFn: () => fetchPayoutPeriods(apiBase, storeId),
    });
  }, [admin, apiBase, queryClient, walletSummary?.storeId, wallets]);

  const systemWallets = useMemo(() => {
    if (!isFiltered || periodBranchReports.length === 0) return wallets;
    const byId = new Map(periodBranchReports.map((r) => [r.storeId, r]));
    return wallets.map((w) => {
      const report = byId.get(w.storeId);
      if (!report) return { ...w, totalEarnings: 0 };
      return { ...w, totalEarnings: report.totalIn };
    });
  }, [isFiltered, periodBranchReports, wallets]);

  const dashboardLoading = loading || periodLoading;

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/admin/wallet/sync`, {
        method: 'POST',
        headers: adminAuthHeaders(), credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Sync failed');
      const added = json.data?.ordersAdded ?? 0;
      toast.success(json.message || (added > 0 ? `Synced ${added} order(s)` : 'Wallet is up to date'));
      setLoading(true);
      await Promise.all([
        fetchWallets(),
        fetchWithdrawals(withdrawalPage),
        ...(isSuperAdmin(admin) && dueTabActive ? [queryClient.invalidateQueries({ queryKey: ['branch-payouts-due'] })] : []),
      ]).finally(() => {
        setLoading(false);
        if (!isSuperAdmin(admin)) {
          setPayoutPeriodsRefresh((n) => n + 1);
          const storeId = walletSummary?.storeId ?? wallets[0]?.storeId;
          if (storeId) {
            void queryClient.invalidateQueries({ queryKey: payoutPeriodsQueryKey(storeId) });
          }
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const superAdmin = isSuperAdmin(admin);
  const pickupOnly = isPickupOnlyBranchAdmin(admin);

  const branchSummary: WalletSummary | null =
    walletSummary ??
    (wallets[0]
      ? {
          storeId: wallets[0].storeId,
          currentBalance: wallets[0].currentBalance ?? wallets[0].balance,
          totalEarnings: wallets[0].totalEarnings ?? 0,
          netTransferableEarnings: wallets[0].netTransferableEarnings ?? 0,
          totalWithdrawn: wallets[0].totalWithdrawn ?? 0,
          pendingWithdrawalTotal: pendingWithdrawals
            .filter((w) => w.storeId === wallets[0].storeId || !w.storeId)
            .reduce((s, w) => s + w.amount, 0),
          availableBalance: wallets[0].availableBalance ?? wallets[0].balance,
        }
      : null);

  const netRemainingBalance =
    Math.max(
      0,
      (branchSummary?.netTransferableEarnings ?? 0) - (branchSummary?.totalWithdrawn ?? 0),
    ) - (branchSummary?.pendingWithdrawalTotal ?? 0);

  const storeNameMap = Object.fromEntries(
    wallets.map((w) => [w.storeId, branchDisplayName(w.store.name)]),
  );

  const walletFromDueRow = (row: PayoutDueRow): StoreWallet => {
    const existing = wallets.find((w) => w.storeId === row.storeId);
    return (
      existing ?? {
        id: row.storeId,
        storeId: row.storeId,
        balance: 0,
        updatedAt: '',
        store: { id: row.storeId, name: row.storeName, city: '', isActive: true },
        _count: { transactions: 0 },
      }
    );
  };

  const handleViewDuePayout = (row: PayoutDueRow) => {
    const oldest =
      duePayouts
        .filter((item) => item.storeId === row.storeId)
        .sort(
          (a, b) =>
            a.periodTo.localeCompare(b.periodTo) || a.periodFrom.localeCompare(b.periodFrom),
        )[0] ?? row;
    setAutoInitiatePayout(false);
    setDuePeriodFocus(duePeriodFocusFromRow(oldest));
    setBranchWalletTarget(walletFromDueRow(oldest));
  };

  const handleReviewDuePayout = (row: PayoutDueRow) => {
    setInitiatePayoutTarget(walletFromDueRow(row));
    setInitiatePayoutPreset({
      periodFrom: row.periodFrom,
      periodTo: row.periodTo,
      days: row.days,
    });
  };

  const actionBtnH = superAdmin ? 'h-8 px-3' : 'h-9 px-3.5';

  const walletTabActions = (
    <>
      {!superAdmin && BRANCH_PAYOUT_REQUESTS_ENABLED && (
        <button
          type="button"
          onClick={() => setWithdrawalModalOpen(true)}
          disabled={dashboardLoading || netRemainingBalance <= 0}
          className={`inline-flex ${actionBtnH} items-center gap-1.5 rounded-[10px] bg-[#307ef2] text-[13px] font-semibold !text-white shadow-sm disabled:opacity-50`}
        >
          <ArrowDownToLine size={15} />
          Request Payout
        </button>
      )}
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing || loading}
        className={`inline-flex ${actionBtnH} items-center gap-1.5 rounded-[10px] border border-[var(--color-brand,#307ef2)] ${superAdmin ? 'bg-transparent' : 'bg-[var(--color-navy-card,#fff)]'} text-[13px] font-semibold text-[var(--color-brand,#307ef2)] disabled:opacity-50`}
      >
        <RefreshCw
          size={14}
          style={{ animation: syncing || loading ? 'spin 1s linear infinite' : 'none' }}
        />
        {syncing ? 'Syncing...' : 'Sync Payments'}
      </button>
      {superAdmin ? (
        <>
          <Link
            href="/admin/wallet/security-audit"
            className={`inline-flex ${actionBtnH} items-center gap-1.5 rounded-[10px] border border-[var(--color-brand,#307ef2)] bg-transparent text-[13px] font-semibold text-[var(--color-brand,#307ef2)] no-underline disabled:opacity-50`}
          >
            <Shield size={14} /> Security audit
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <div className={`admin-dashboard mx-auto max-w-[1400px]${superAdmin ? ' admin-dashboard--super' : ' branch-wallet-page'}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {superAdmin ? (
            <p className="mb-1 text-[12px] font-medium leading-none text-muted">Wallet / Overview</p>
          ) : null}
          <h1 className="m-0 text-[1.55rem] font-bold leading-tight tracking-tight text-fg">
            {superAdmin ? (
              'System Wallet Overview'
            ) : (
              <span className="inline-flex items-center gap-2">
                <Wallet size={20} className="text-[var(--color-brand,#307ef2)]" />
                Branch Wallet
              </span>
            )}
          </h1>
          <p className="mt-1 mb-0 text-[13px] leading-snug text-muted">
            {superAdmin
              ? 'Total payables owed to branches from online payments'
              : 'Manage branch wallet, payouts and transaction history'}
          </p>
        </div>
        <WalletPeriodFilterBar filter={periodFilter} className="shrink-0" />
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-[#7f1d1d] bg-[#7f1d1d30] px-4 py-3 text-[#fca5a5]">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!superAdmin && (
        <Suspense fallback={walletTabsFallback}>
          <BranchWalletTabs
            dashboard={walletDashboard}
            loading={loading && !branchSummary}
            periodLoading={dashboardLoading}
            allTimeBalanceCents={branchSummary?.currentBalance}
            periodFrom={periodFrom}
            periodTo={periodTo}
            periodLabel={periodLabel}
            withdrawals={withdrawals}
            withdrawalsLoading={withdrawalsLoading}
            storeNames={storeNameMap}
            withdrawalPagination={withdrawalPagination}
            onPageChange={(p) => fetchWithdrawals(p)}
            onViewWithdrawal={(row) => setViewWithdrawalTarget(row)}
            hideDelivery={pickupOnly}
            tabActions={walletTabActions}
            storeId={branchSummary?.storeId}
            walletBalance={branchSummary?.currentBalance ?? 0}
            availableBalance={Math.max(0, netRemainingBalance)}
            payoutPeriodsRefresh={payoutPeriodsRefresh}
          />
        </Suspense>
      )}

      {superAdmin && (
        <Suspense fallback={walletTabsFallback}>
          <SuperAdminWalletTabs
            dashboard={walletDashboard}
            loading={dashboardLoading}
            walletListReady={!loading}
            periodFrom={periodFrom}
            periodTo={periodTo}
            periodLabel={periodLabel}
            wallets={systemWallets}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onBranchClick={(wallet) => {
              setAutoInitiatePayout(false);
              setDuePeriodFocus(null);
              setBranchWalletTarget(wallet);
            }}
            duePayouts={duePayouts}
            duePayoutsLoading={duePayoutsLoading}
            duePayoutsLoadingMore={duePayoutsLoadingMore}
            onViewDuePayout={handleViewDuePayout}
            onReviewDuePayout={handleReviewDuePayout}
            tabActions={walletTabActions}
          />
        </Suspense>
      )}

      {!superAdmin && (
        <WalletWithdrawalModal
          open={withdrawalModalOpen || !!viewWithdrawalTarget}
          onClose={() => {
            setWithdrawalModalOpen(false);
            setViewWithdrawalTarget(null);
          }}
          viewWithdrawal={viewWithdrawalTarget}
          walletBalance={branchSummary?.currentBalance ?? 0}
          availableBalance={Math.max(0, netRemainingBalance)}
          storeId={branchSummary?.storeId}
          apiBase={apiBase}
          onSubmitted={() => Promise.all([fetchWallets(), fetchWithdrawals(1)])}
        />
      )}

      {superAdmin && (
        <BranchWalletDetailModal
          open={!!branchWalletTarget}
          storeId={branchWalletTarget?.storeId ?? null}
          branchName={
            branchWalletTarget ? branchDisplayName(branchWalletTarget.store.name) : undefined
          }
          autoInitiatePayout={autoInitiatePayout}
          duePeriodFocus={duePeriodFocus}
          periodFrom={duePeriodFocus ? null : periodFrom}
          periodTo={duePeriodFocus ? null : periodTo}
          periodLabel={duePeriodFocus ? null : periodLabel}
          onClose={() => {
            setBranchWalletTarget(null);
            setDuePeriodFocus(null);
            setAutoInitiatePayout(false);
            if (dueTabActive) invalidateBranchPayoutsDue();
          }}
        />
      )}

      {superAdmin && initiatePayoutTarget && (
        <AdminInitiatePayoutModal
          open
          onClose={() => {
            setInitiatePayoutTarget(null);
            setInitiatePayoutPreset(null);
            invalidateBranchPayoutsDue();
          }}
          presetPeriodFrom={initiatePayoutPreset?.periodFrom ?? null}
          presetPeriodTo={initiatePayoutPreset?.periodTo ?? null}
          presetPeriodDays={initiatePayoutPreset?.days ?? null}
          storeId={initiatePayoutTarget.storeId}
          branchName={branchDisplayName(initiatePayoutTarget.store.name)}
          walletBalance={initiatePayoutTarget.balance ?? 0}
          availableBalance={
            initiatePayoutTarget.availableBalance ??
            Math.max(
              0,
              (initiatePayoutTarget.netTransferableEarnings ?? 0) -
                (initiatePayoutTarget.totalWithdrawn ?? 0),
            )
          }
          apiBase={apiBase}
          onCompleted={() => {
            setInitiatePayoutTarget(null);
            setInitiatePayoutPreset(null);
            void Promise.all([
              fetchWallets(),
              fetchWithdrawals(1),
              fetchDuePayouts({ preserve: true }),
              queryClient.invalidateQueries({ queryKey: ['branch-payouts-due'] }),
            ]);
          }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }
      `}</style>
    </div>
  );
}
