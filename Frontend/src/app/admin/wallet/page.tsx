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
  type WithdrawalRow,
} from '@/components/admin/WalletWithdrawalTable';
import BranchWalletTabs from '@/components/admin/BranchWalletTabs';
import SuperAdminWalletTabs from '@/components/admin/SuperAdminWalletTabs';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import {
  duePeriodFocusFromRow,
  type DuePeriodFocus,
} from '@/components/admin/payoutPeriodView';
import type { StoreWallet } from '@/components/admin/SuperAdminSystemWalletTab';
import WalletPeriodFilterBar from '@/components/admin/WalletPeriodFilterBar';
import {
  adminWalletOverviewQueryKey,
  adminWalletWithdrawalsQueryKey,
  useWalletPeriodFilter,
} from '@/components/admin/useWalletPeriodFilter';
import {
  fetchAdminWalletOverview,
  fetchAdminWalletWithdrawals,
  type WalletSummary,
} from '@/lib/adminWalletOverview';
import {
  fetchPayoutPeriods,
  payoutPeriodsQueryKey,
} from '@/components/admin/BranchPayoutPeriodsSection';
import toast from 'react-hot-toast';
import { adminAuthHeaders } from '@/lib/adminSession';
import { normalizeWithdrawalFromApi } from '@/lib/moneyString';
import {
  branchPayoutsDueQueryKey,
  fetchBranchPayoutsDue,
  refreshBranchPayoutsDueQueries,
  removePaidBranchFromPayoutsDueCache,
  type BranchPayoutCompletedMeta,
} from '@/lib/branchPayoutsDue';

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
  const [admin] = useState<AdminSession | null>(() => getAdminSession());
  const withdrawalPeriodKey = `${periodFrom ?? ''}|${periodTo ?? ''}`;
  const [withdrawalPageByPeriod, setWithdrawalPageByPeriod] = useState<Record<string, number>>({});
  const withdrawalPage = withdrawalPageByPeriod[withdrawalPeriodKey] ?? 1;
  const setWithdrawalPage = useCallback(
    (page: number) => {
      setWithdrawalPageByPeriod((prev) => ({ ...prev, [withdrawalPeriodKey]: page }));
    },
    [withdrawalPeriodKey],
  );
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [viewWithdrawalTarget, setViewWithdrawalTarget] = useState<WithdrawalRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [branchWalletTarget, setBranchWalletTarget] = useState<StoreWallet | null>(null);
  const [duePeriodFocus, setDuePeriodFocus] = useState<DuePeriodFocus | null>(null);
  const [autoInitiatePayout, setAutoInitiatePayout] = useState(false);
  const [initiatePayoutTarget, setInitiatePayoutTarget] = useState<StoreWallet | null>(null);
  const [initiatePayoutPreset, setInitiatePayoutPreset] = useState<{
    periodFrom: string;
    periodTo: string;
    days: number;
  } | null>(null);
  const [payoutPeriodsRefresh, setPayoutPeriodsRefresh] = useState(0);

  const apiBase = getApiBaseUrl();
  const dueTabActive = searchParams.get('tab') === 'due';
  const urlFrom = searchParams.get('from');
  const urlTo = searchParams.get('to');

  useEffect(() => {
    if (!admin) {
      router.replace('/admin/login');
    }
  }, [admin, router]);

  const superAdminNeedsDefaultPeriod =
    admin != null && isSuperAdmin(admin) && !(urlFrom && urlTo);

  const walletOverviewQuery = useQuery({
    queryKey: adminWalletOverviewQueryKey(periodFrom, periodTo),
    queryFn: ({ signal }) => fetchAdminWalletOverview(apiBase, periodFrom, periodTo, signal),
    enabled: !!admin && !superAdminNeedsDefaultPeriod,
  });

  const branchAdminSession = admin != null && !isSuperAdmin(admin);

  const withdrawalsQuery = useQuery({
    queryKey: adminWalletWithdrawalsQueryKey(periodFrom, periodTo, withdrawalPage),
    queryFn: ({ signal }) =>
      fetchAdminWalletWithdrawals(
        apiBase,
        periodFrom,
        periodTo,
        withdrawalPage,
        normalizeWithdrawalFromApi,
        signal,
      ),
    enabled: branchAdminSession,
  });

  const overviewData = walletOverviewQuery.data;
  const wallets = useMemo(() => overviewData?.wallets ?? [], [overviewData?.wallets]);
  const walletSummary = overviewData?.summary ?? null;
  const walletDashboard = overviewData?.dashboard ?? null;
  const periodBranchReports = useMemo(
    () => overviewData?.periodBranchReports ?? [],
    [overviewData?.periodBranchReports],
  );
  const withdrawals = withdrawalsQuery.data?.withdrawals ?? [];
  const pendingWithdrawals = withdrawalsQuery.data?.pendingWithdrawals ?? [];
  const withdrawalPagination = withdrawalsQuery.data?.pagination ?? null;
  const withdrawalsLoading =
    withdrawalsQuery.isLoading || withdrawalsQuery.isFetching;

  const error =
    walletOverviewQuery.error instanceof Error
      ? walletOverviewQuery.error.message
      : walletOverviewQuery.error
        ? 'Failed to load wallets'
        : null;

  const loading = walletOverviewQuery.isLoading;
  const periodLoading = walletOverviewQuery.isFetching;
  const dashboardLoading = loading || periodLoading;

  const invalidateWalletData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-wallet-overview'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-wallet-withdrawals'] });
    void queryClient.invalidateQueries({ queryKey: ['payout-periods'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-analysis'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  }, [queryClient]);

  const superAdminSession = admin != null && isSuperAdmin(admin);

  const branchPayoutsDueQuery = useQuery({
    queryKey: branchPayoutsDueQueryKey(),
    queryFn: ({ signal }) => fetchBranchPayoutsDue(apiBase, signal),
    enabled: superAdminSession && dueTabActive && Boolean(periodFrom && periodTo),
    staleTime: 45_000,
  });

  const duePayouts = branchPayoutsDueQuery.data ?? [];
  const duePayoutsLoading =
    branchPayoutsDueQuery.isLoading ||
    (branchPayoutsDueQuery.isFetching && !branchPayoutsDueQuery.isFetched);
  const duePayoutsLoadingMore =
    branchPayoutsDueQuery.isFetching &&
    branchPayoutsDueQuery.isFetched &&
    !branchPayoutsDueQuery.isLoading;

  const invalidateBranchPayoutsDue = useCallback(() => {
    void refreshBranchPayoutsDueQueries(queryClient);
  }, [queryClient]);

  const handleBranchPayoutCompleted = useCallback(
    (meta: BranchPayoutCompletedMeta) => {
      setInitiatePayoutTarget(null);
      setInitiatePayoutPreset(null);
      removePaidBranchFromPayoutsDueCache(queryClient, meta);
      invalidateWalletData();
      void queryClient.invalidateQueries({ queryKey: payoutPeriodsQueryKey(meta.storeId) });
      refreshBranchPayoutsDueQueries(queryClient);
    },
    [queryClient, invalidateWalletData],
  );

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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${apiBase}/admin/wallet/sync`, {
        method: 'POST',
        headers: adminAuthHeaders(), credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Sync failed');
      const added = json.data?.ordersAdded ?? 0;
      toast.success(json.message || (added > 0 ? `Synced ${added} order(s)` : 'Wallet is up to date'));
      await Promise.all([
        invalidateWalletData(),
        ...(isSuperAdmin(admin) && dueTabActive
          ? [queryClient.invalidateQueries({ queryKey: ['branch-payouts-due'] })]
          : []),
      ]);
      if (!isSuperAdmin(admin)) {
        setPayoutPeriodsRefresh((n) => n + 1);
        const storeId = walletSummary?.storeId ?? wallets[0]?.storeId;
        if (storeId) {
          void queryClient.invalidateQueries({ queryKey: payoutPeriodsQueryKey(storeId) });
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const superAdmin = isSuperAdmin(admin);
  const pickupOnly = isPickupOnlyBranchAdmin(admin);

  const branchAllTimeAvailableCents =
    walletSummary?.allTimeAvailableBalanceCents ??
    wallets[0]?.allTimeAvailableBalanceCents ??
    walletDashboard?.payablesBreakdown?.allTimeAvailableBalanceCents ??
    null;

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
          allTimeAvailableBalanceCents:
            wallets[0].allTimeAvailableBalanceCents ??
            walletDashboard?.payablesBreakdown?.allTimeAvailableBalanceCents,
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
    setAutoInitiatePayout(false);
    setDuePeriodFocus(duePeriodFocusFromRow(row));
    setBranchWalletTarget(walletFromDueRow(row));
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
            allTimeBalanceCents={
              branchAllTimeAvailableCents ??
              branchSummary?.allTimeAvailableBalanceCents ??
              undefined
            }
            periodFrom={periodFrom}
            periodTo={periodTo}
            periodLabel={periodLabel}
            withdrawals={withdrawals}
            withdrawalsLoading={withdrawalsLoading}
            storeNames={storeNameMap}
            withdrawalPagination={withdrawalPagination}
            onPageChange={(p) => setWithdrawalPage(p)}
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
          onSubmitted={() => {
            invalidateWalletData();
            return Promise.resolve();
          }}
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
          onBranchPayoutCompleted={handleBranchPayoutCompleted}
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
          onCompleted={(meta) => {
            void handleBranchPayoutCompleted(meta);
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
