'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Wallet,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Printer,
  PlusCircle,
  X,
  RefreshCw,
  Filter,
  AlertCircle,
  Banknote,
} from 'lucide-react';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import BranchWalletSummaryCards, {
  type BranchWalletDashboard,
} from '@/components/admin/BranchWalletSummaryCards';
import WalletWithdrawalModal from '@/components/admin/WalletWithdrawalModal';
import WalletApproveWithdrawalModal from '@/components/admin/WalletApproveWithdrawalModal';
import WalletRejectWithdrawalModal from '@/components/admin/WalletRejectWithdrawalModal';
import WalletPendingWithdrawals from '@/components/admin/WalletPendingWithdrawals';
import WalletWithdrawalTable, {
  WITHDRAWAL_PAGE_SIZE,
  type WithdrawalPagination,
  type WithdrawalRow,
} from '@/components/admin/WalletWithdrawalTable';
import { withdrawalStatusLabel } from '@/components/admin/withdrawalStatusUi';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import AdminInitiatePayoutModal from '@/components/admin/AdminInitiatePayoutModal';
import BranchPayoutPeriodsSection from '@/components/admin/BranchPayoutPeriodsSection';
import type { DuePeriodFocus } from '@/components/admin/payoutPeriodView';
import AdminPrintCanvas, { printScopedAdminReport } from '@/components/admin/AdminPrintCanvas';
import AdminReportPdf, { type ReportStatCard } from '@/components/admin/AdminReportPdf';
import ReportOptionsBar from '@/components/admin/ReportOptionsBar';
import { formatPrintCents } from '@/components/admin/AdminPrintReport';
import toast from 'react-hot-toast';
import type { BranchPayoutCompletedMeta } from '@/lib/branchPayoutsDue';

interface WalletInfo {
  id: string;
  storeId: string;
  balance: number;
  totalEarnings?: number;
  netTransferableEarnings?: number;
  totalWithdrawn?: number;
  currentBalance?: number;
  availableBalance?: number;
  lastSettledAt?: string | null;
  updatedAt: string;
  store: { id: string; name: string; city: string; addressLine: string; phone: string | null };
}

interface Transaction {
  id: string;
  type: string;
  direction: string;
  amount: number;
  description: string | null;
  orderId: string | null;
  createdAt: string;
  createdBy: string | null;
  settledAt?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  reference?: string | null;
}

interface Summary {
  totalIn: number;
  deliveryIn: number;
  pickupOnlineIn: number;
  pickupStoreIn: number;
  totalOut: number;
}

// ─── Period helpers ───────────────────────────────────────────────────────────
function getTodayStr() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function fmt(cents: number) {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function withdrawalPeriodLabel(row: WithdrawalRow) {
  if (!row.periodFrom || !row.periodTo) return '—';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(row.periodFrom)} – ${fmt(row.periodTo)}`;
}

function exportPeriodLabel(
  periodFrom: string | null,
  periodTo: string | null,
  periodLabel: string | null,
) {
  if (periodFrom && periodTo) {
    return periodLabel?.trim() || `${periodFrom} → ${periodTo}`;
  }
  return 'All time';
}

type BranchWalletDetailProps = {
  storeId: string;
  embedded?: boolean;
  /** When provided (e.g. embedded branch modal), parent renders the approve/view payout modal. */
  onViewWithdrawal?: (row: WithdrawalRow) => void;
  /** Increment to refetch wallet + withdrawal history from a parent-controlled modal action. */
  withdrawalRefreshSignal?: number;
  /** Open Initiate Payout as soon as the branch wallet loads (Payouts Due queue). */
  autoInitiatePayout?: boolean;
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
  /** Payouts Due View: show oldest periods first and highlight the clicked due window. */
  duePeriodFocus?: DuePeriodFocus | null;
  /** Super Admin payout from this wallet — refresh Payouts Due / period lists on parent. */
  onBranchPayoutCompleted?: (meta: BranchPayoutCompletedMeta) => void;
};

/** Flip to true (with backend ENABLE_BRANCH_PAYOUT_REQUESTS) to restore Branch Admin requests. */
const BRANCH_PAYOUT_REQUESTS_ENABLED = false;

export default function BranchWalletDetail({
  storeId,
  embedded = false,
  onViewWithdrawal,
  withdrawalRefreshSignal = 0,
  autoInitiatePayout = false,
  periodFrom = null,
  periodTo = null,
  periodLabel = null,
  duePeriodFocus = null,
  onBranchPayoutCompleted,
}: BranchWalletDetailProps) {
  const router = useRouter();

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletDashboard, setWalletDashboard] = useState<BranchWalletDashboard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [superAdmin, setSuperAdmin] = useState(() => isSuperAdmin(getAdminSession()));
  const [syncing, setSyncing] = useState(false);
  const [showInitiatePayout, setShowInitiatePayout] = useState(false);
  const [printWithdrawals, setPrintWithdrawals] = useState<WithdrawalRow[]>([]);
  const [printPortalReady, setPrintPortalReady] = useState(false);
  const printReportId = useMemo(() => `branch-wallet-${storeId}`, [storeId]);
  const [pdfSections, setPdfSections] = useState({
    period: true,
    summaryStats: true,
    withdrawals: true,
  });
  // Filters (used for PDF export period)
  const [filterType, setFilterType] = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [filterFrom, setFilterFrom] = useState(getTodayStr());
  const [filterTo, setFilterTo] = useState(getTodayStr());

  // Adjust modal
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjType, setAdjType] = useState<'CREDIT' | 'DEBIT' | 'ADJUSTMENT' | 'REFUND'>('CREDIT');
  const [adjDir, setAdjDir] = useState<'IN' | 'OUT'>('IN');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDesc, setAdjDesc] = useState('');
  const [adjPin, setAdjPin] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalsError, setWithdrawalsError] = useState<string | null>(null);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [withdrawalPagination, setWithdrawalPagination] = useState<WithdrawalPagination | null>(null);
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [viewWithdrawalTarget, setViewWithdrawalTarget] = useState<WithdrawalRow | null>(null);
  const [approveWithdrawalTarget, setApproveWithdrawalTarget] = useState<WithdrawalRow | null>(null);
  const [rejectWithdrawalTarget, setRejectWithdrawalTarget] = useState<WithdrawalRow | null>(null);
  const [gatewayFeePercent, setGatewayFeePercent] = useState(1.9);

    const apiBase = getApiBaseUrl();

  useEffect(() => {
    setPrintPortalReady(true);
  }, []);

  const fetchWallet = useCallback(async () => {
    setError(null);
    try {
      const qs =
        periodFrom && periodTo
          ? `?${new URLSearchParams({ from: periodFrom, to: periodTo })}`
          : '';
      const res = await fetch(`${apiBase}/admin/wallet/${storeId}${qs}`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load wallet');
      const json = await res.json();
      const { dashboard, ...walletRow } = json.data as WalletInfo & {
        dashboard?: BranchWalletDashboard;
      };
      setWallet(walletRow);
      setWalletDashboard(dashboard ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error loading wallet');
    }
  }, [storeId, apiBase, periodFrom, periodTo]);

  const fetchGatewayFeePercent = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/settings/app`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.data?.gatewayFeePercent === 'number') {
        setGatewayFeePercent(json.data.gatewayFeePercent);
      }
    } catch {
      // keep default
    }
  }, [apiBase]);

  type TxnFilters = { from?: string; to?: string; type?: string; direction?: string };

  const fetchTransactions = useCallback(async (p = 1, overrides?: TxnFilters) => {
    const activeFrom = overrides?.from ?? filterFrom;
    const activeTo = overrides?.to ?? filterTo;
    const activeType = overrides?.type !== undefined ? overrides.type : filterType;
    const activeDirection = overrides?.direction !== undefined ? overrides.direction : filterDirection;
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '15',
        ...(activeType ? { type: activeType } : {}),
        ...(activeDirection ? { direction: activeDirection } : {}),
        ...(activeFrom ? { from: activeFrom } : {}),
        ...(activeTo ? { to: activeTo } : {}),
      });
      const res = await fetch(`${apiBase}/admin/wallet/${storeId}/transactions?${params}`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load transactions');
      const json = await res.json();
      setTransactions(json.data.transactions ?? []);
      setSummary(json.data.summary);
    } catch {
      // ignore — wallet error is already shown
    }
  }, [storeId, apiBase, filterType, filterDirection, filterFrom, filterTo]);

  const fetchWithdrawals = useCallback(async (page = 1) => {
    setWithdrawalsLoading(true);
    setWithdrawalsError(null);
    try {
      const params = new URLSearchParams({
        limit: String(WITHDRAWAL_PAGE_SIZE),
        page: String(page),
        storeId,
      });
      const res = await fetch(`${apiBase}/admin/wallet/withdrawals?${params}`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load withdrawal history');
      }
      const items = json.data?.items ?? [];
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
    } catch (e: unknown) {
      setWithdrawalsError(e instanceof Error ? e.message : 'Failed to load withdrawal history');
    } finally {
      setWithdrawalsLoading(false);
    }
  }, [apiBase, storeId]);

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((row) => row.status === 'PENDING'),
    [withdrawals],
  );

  const handleApproveWithdrawal = (row: WithdrawalRow) => {
    if (onViewWithdrawal) {
      onViewWithdrawal(row);
      return;
    }
    setApproveWithdrawalTarget(row);
  };

  const handleRejectWithdrawal = (row: WithdrawalRow) => {
    setRejectWithdrawalTarget(row);
  };

  const handleViewWithdrawal = useCallback(
    (row: WithdrawalRow) => {
      if (onViewWithdrawal) {
        onViewWithdrawal(row);
        return;
      }
      setApproveWithdrawalTarget(row);
    },
    [onViewWithdrawal],
  );

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { router.replace('/admin/login'); return; }
    if (session.role !== 'SYSTEM_ADMIN' && session.storeId !== storeId) {
      router.replace('/admin/wallet');
      return;
    }
    setSuperAdmin(isSuperAdmin(session));
  }, [storeId, router]);

  useEffect(() => {
    if (!withdrawalRefreshSignal) return;
    void Promise.all([fetchWallet(), fetchWithdrawals(withdrawalPage)]);
  }, [withdrawalRefreshSignal, fetchWallet, fetchWithdrawals, withdrawalPage]);

  const didAutoOpenPayout = useRef(false);
  useEffect(() => {
    didAutoOpenPayout.current = false;
  }, [storeId]);
  useEffect(() => {
    if (!autoInitiatePayout || !wallet || !superAdmin || didAutoOpenPayout.current) return;
    didAutoOpenPayout.current = true;
    setShowInitiatePayout(true);
  }, [autoInitiatePayout, wallet, superAdmin]);

  useEffect(() => {
    const todayStrVal = getTodayStr();
    setFilterFrom(todayStrVal);
    setFilterTo(todayStrVal);
    setFilterType('');
    setFilterDirection('');
    setWithdrawalPage(1);
    setLoading(true);
    Promise.all([
      fetchWallet(),
      fetchTransactions(1, { from: todayStrVal, to: todayStrVal, type: '', direction: '' }),
      fetchWithdrawals(1),
      fetchGatewayFeePercent(),
    ]).finally(() => setLoading(false));
    // Only reload when switching branches — not when filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, periodFrom, periodTo]);

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
      await Promise.all([fetchWallet(), fetchTransactions(1)]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleAdjust = async () => {
    setAdjError('');
    const amount = Math.round(parseFloat(adjAmount) * 100);
    if (isNaN(amount) || amount <= 0) { setAdjError('Enter a valid positive amount'); return; }
    if (!adjDesc.trim()) { setAdjError('Enter a reason for this adjustment'); return; }
    if (!adjPin.trim()) { setAdjError('Enter your PIN'); return; }
    setAdjLoading(true);
    try {
      const res = await fetch(`${apiBase}/admin/wallet/${storeId}/adjust`, {
        method: 'POST',
        headers: adminAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include',
        body: JSON.stringify({ type: adjType, direction: adjDir, amount, description: adjDesc.trim(), password: adjPin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Adjustment failed');
      setShowAdjust(false);
      setAdjAmount('');
      setAdjDesc('');
      setAdjPin('');
      await Promise.all([fetchWallet(), fetchTransactions(1)]);
    } catch (e: unknown) {
      setAdjError(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setAdjLoading(false);
    }
  };

  const storeName = wallet?.store.name.replace('Bing Chun - ', '') ?? 'Branch';

  const pdfPeriodLabel = exportPeriodLabel(periodFrom, periodTo, periodLabel);

  const handlePrint = async () => {
    let withdrawalRows = withdrawals;

    const scopedFrom = periodFrom ?? undefined;
    const scopedTo = periodTo ?? undefined;

    try {
      const withdrawalRes = await fetch(
        `${apiBase}/admin/wallet/withdrawals?${new URLSearchParams({
          page: '1',
          limit: '100',
          storeId,
          ...(scopedFrom ? { from: scopedFrom } : {}),
          ...(scopedTo ? { to: scopedTo } : {}),
        })}`,
        { headers: adminAuthHeaders(), credentials: 'include' },
      );

      if (withdrawalRes.ok) {
        const json = await withdrawalRes.json();
        withdrawalRows = json.data?.items ?? withdrawals;
      }
    } catch {
      /* use current page data */
    }

    flushSync(() => {
      setPrintWithdrawals(withdrawalRows);
    });
    printScopedAdminReport(printReportId, 'full');
  };

  const togglePdfSection = (key: string) => {
    setPdfSections((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  const withdrawalsForPrint = useMemo(
    () => (printWithdrawals.length > 0 ? printWithdrawals : withdrawals),
    [printWithdrawals, withdrawals],
  );

  const pdfStats = useMemo(() => {
    const allTimeHint = 'All-time';
    const payables = walletDashboard?.payablesBreakdown;
    const ch = payables?.channelRevenueCents;
    const pickupCash = ch?.pickupCashIn ?? 0;
    const pickupOnline = ch?.pickupOnlineIn ?? 0;
    const pickupCard = ch?.pickupCardIn ?? 0;
    const deliveryOnline = ch?.deliveryOnlineIn ?? 0;
    const totalRevenue = payables?.totalRevenueCents ?? 0;
    const totalExpenses = payables?.totalExpensesCents ?? 0;
    const availableBalance = payables?.allTimeAvailableBalanceCents ?? 0;

    const stat = (
      label: string,
      cents: number,
      tone: NonNullable<ReportStatCard['tone']>,
      sub = allTimeHint,
    ): ReportStatCard => ({
      label,
      value: formatPrintCents(cents),
      sub,
      tone,
    });

    return [
      stat('All-Time Available Balance', availableBalance, 'teal'),
      stat('Total Revenue (Net)', totalRevenue, 'green'),
      stat('Delivery Online Revenue', deliveryOnline, 'blue'),
      stat('Pickup Online Revenue', pickupOnline, 'blue'),
      stat('Pickup Cash Revenue', pickupCash, 'purple'),
      stat('Pickup Card Revenue', pickupCard, 'purple'),
      stat('Total Expenses', totalExpenses, 'orange'),
      stat('Net Platform Amount', payables?.platformCommissionCents ?? 0, 'yellow'),
      stat('Payment Gateway Fees', payables?.gatewayFeeCents ?? 0, 'yellow'),
      stat(
        'Branch Receivable',
        payables?.branchReceivableCents ?? 0,
        'yellow',
        'Paid 15-day payouts',
      ),
    ];
  }, [walletDashboard]);

  return (
    <div style={{ maxWidth: embedded ? 'none' : 1000, margin: embedded ? 0 : '0 auto' }}>
      <div className="no-print">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {!embedded && (
          <Link href="/admin/wallet" style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={18} />
          </Link>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ color: 'var(--color-text)', fontSize: 20, fontWeight: 700, margin: 0 }}>
            {storeName} Payables
          </h1>
          {!embedded && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: '2px 0 0' }}>
              {wallet?.store.city} · {wallet?.store.addressLine}
              {wallet && (
                <>
                  {' · '}Payable: <strong style={{ color: '#4ade80' }}>{fmt(wallet.balance)}</strong>
                  {wallet.lastSettledAt && (
                    <> · Last settled: <strong style={{ color: 'var(--color-text)' }}>{new Date(wallet.lastSettledAt).toLocaleDateString('en-LK', { dateStyle: 'medium' })}</strong></>
                  )}
                </>
              )}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--color-navy-border, #334155)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
          >
            <Printer size={14} /> Export PDF
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              border: '1px solid var(--color-brand, #307ef2)',
              background: 'transparent', color: 'var(--color-brand, #307ef2)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              opacity: syncing || loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing...' : 'Sync Payments'}
          </button>
          {superAdmin && (
            <>
              <button
                onClick={() => setShowInitiatePayout(true)}
                disabled={loading || !wallet || wallet.balance <= 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10,
                  border: '1px solid var(--color-brand, #307ef2)',
                  background: wallet && wallet.balance > 0 ? 'var(--color-brand-subtle, #307ef220)' : 'transparent',
                  color: wallet && wallet.balance > 0 ? 'var(--color-brand, #307ef2)' : 'var(--color-text-muted)',
                  cursor: wallet && wallet.balance > 0 ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <Banknote size={14} />
                Initiate Payout
              </button>
              {!embedded && (
                <button
                  onClick={() => setShowAdjust(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'var(--color-brand, #307ef2)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  <PlusCircle size={14} /> Adjust
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ReportOptionsBar
        options={[
          { key: 'period', label: 'Show period info' },
          { key: 'summaryStats', label: 'Show wallet summary' },
          { key: 'withdrawals', label: 'Show withdrawal history' },
        ]}
        values={pdfSections}
        onChange={togglePdfSection}
      />

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#7f1d1d30', border: '1px solid #7f1d1d', color: '#fca5a5', marginBottom: 20 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Wallet summary cards */}
      {embedded ? (
        <div className="branch-wallet-page mb-5">
          <BranchWalletSummaryCards
            dashboard={walletDashboard}
            loading={loading}
            allTimeBalanceCents={wallet?.currentBalance ?? wallet?.balance}
            periodFrom={periodFrom}
            periodTo={periodTo}
            periodLabel={periodLabel}
            storeId={storeId}
          />
        </div>
      ) : (
        !loading &&
        wallet && (
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardKpiCard
              label="Total Online Earnings"
              value={formatMoney((wallet.totalEarnings ?? 0) / 100)}
              icon={TrendingUp}
              tone="green"
              hint="Gross online revenue before deductions"
            />
            <DashboardKpiCard
              label="Net Transferable Earnings"
              value={formatMoney((wallet.netTransferableEarnings ?? 0) / 100)}
              icon={Filter}
              tone="purple"
              hint={
                superAdmin
                  ? `After delivery, commission & ${gatewayFeePercent}% gateway fees`
                  : 'After delivery, commission & convenience fees'
              }
            />
            <DashboardKpiCard
              label="Total Withdrawn"
              value={formatMoney((wallet.totalWithdrawn ?? 0) / 100)}
              icon={TrendingDown}
              tone="orange"
              hint="Approved payouts to branch"
            />
            <DashboardKpiCard
              label="Remaining Balance"
              value={formatMoney(
                Math.max(
                  0,
                  (wallet.netTransferableEarnings ?? 0) - (wallet.totalWithdrawn ?? 0),
                ) / 100,
              )}
              icon={Wallet}
              tone="blue"
              hint={`${formatMoney((wallet.availableBalance ?? 0) / 100)} available to withdraw`}
            />
          </div>
        )
      )}

      {!loading && wallet && superAdmin && embedded && (
        <div className="mb-7">
          <BranchPayoutPeriodsSection
            storeId={storeId}
            walletBalance={wallet.balance ?? wallet.currentBalance ?? 0}
            availableBalance={
              wallet.availableBalance ??
              Math.max(
                0,
                (wallet.netTransferableEarnings ?? 0) - (wallet.totalWithdrawn ?? 0),
              )
            }
            periodSort={duePeriodFocus ? 'oldest' : 'newest'}
            focusOldestPending={!!duePeriodFocus}
          />
        </div>
      )}

      {!loading && wallet && superAdmin && (
        <WalletPendingWithdrawals
          rows={pendingWithdrawals}
          loading={withdrawalsLoading}
          storeNames={{ [wallet.storeId]: storeName }}
          onApprove={handleApproveWithdrawal}
          onReject={handleRejectWithdrawal}
        />
      )}

      {!loading && wallet && superAdmin && (
        <div className="mb-7">
          <WalletWithdrawalTable
            rows={withdrawals}
            loading={withdrawalsLoading}
            error={withdrawalsError}
            storeNames={{ [wallet.storeId]: storeName }}
            showAdvance={false}
            pagination={withdrawalPagination}
            onPageChange={(p) => fetchWithdrawals(p)}
            onView={handleViewWithdrawal}
          />
        </div>
      )}

      {!loading && wallet && !superAdmin && (
        <>
          {BRANCH_PAYOUT_REQUESTS_ENABLED && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => setWithdrawalModalOpen(true)}
                disabled={
                  Math.max(
                    0,
                    (wallet.netTransferableEarnings ?? 0) - (wallet.totalWithdrawn ?? 0),
                  ) <= 0
                }
                className="btn-primary px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Request Payout
              </button>
            </div>
          )}
          <div className="mb-7">
            <WalletWithdrawalTable
              rows={withdrawals}
              loading={withdrawalsLoading}
              error={withdrawalsError}
              storeNames={wallet ? { [wallet.storeId]: storeName } : undefined}
              showAdvance={false}
              pagination={withdrawalPagination}
              onPageChange={(p) => fetchWithdrawals(p)}
              onView={(row) => setViewWithdrawalTarget(row)}
            />
          </div>
        </>
      )}

      </div>

      {superAdmin && !onViewWithdrawal && (
          <WalletApproveWithdrawalModal
            open={!!approveWithdrawalTarget}
            withdrawal={approveWithdrawalTarget}
            branchName={storeName}
            apiBase={apiBase}
            onClose={() => setApproveWithdrawalTarget(null)}
            onApproved={() => {
              void Promise.all([fetchWallet(), fetchWithdrawals(withdrawalPage)]);
            }}
          />
      )}

      {superAdmin && (
          <WalletRejectWithdrawalModal
            open={!!rejectWithdrawalTarget}
            withdrawal={rejectWithdrawalTarget}
            branchName={storeName}
            apiBase={apiBase}
            onClose={() => setRejectWithdrawalTarget(null)}
            onRejected={async () => {
              await Promise.all([fetchWallet(), fetchWithdrawals(withdrawalPage)]);
            }}
          />
      )}

      {!superAdmin && wallet && (
        <WalletWithdrawalModal
          open={withdrawalModalOpen || !!viewWithdrawalTarget}
          onClose={() => {
            setWithdrawalModalOpen(false);
            setViewWithdrawalTarget(null);
          }}
          viewWithdrawal={viewWithdrawalTarget}
          walletBalance={wallet.balance ?? 0}
          availableBalance={wallet.availableBalance ?? Math.max(
            0,
            (wallet.netTransferableEarnings ?? 0) - (wallet.totalWithdrawn ?? 0),
          )}
          storeId={wallet.storeId}
          apiBase={apiBase}
          onSubmitted={() => {
            void Promise.all([fetchWallet(), fetchWithdrawals(1)]);
          }}
          showGatewayFees={false}
        />
      )}

      {superAdmin && wallet && (
        <AdminInitiatePayoutModal
          open={showInitiatePayout}
          onClose={() => setShowInitiatePayout(false)}
          storeId={storeId}
          branchName={storeName}
          walletBalance={wallet.balance ?? 0}
          availableBalance={
            wallet.availableBalance ??
            Math.max(0, (wallet.netTransferableEarnings ?? 0) - (wallet.totalWithdrawn ?? 0))
          }
          apiBase={apiBase}
          onCompleted={(meta) => {
            void Promise.all([fetchWallet(), fetchWithdrawals(1)]);
            onBranchPayoutCompleted?.(meta);
          }}
        />
      )}

      {/* Manual Adjustment Modal (Super Admin full-page wallet only) */}
      {showAdjust && !embedded && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000080', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--color-navy-card, #1e293b)', border: '1px solid var(--color-navy-border, #334155)', borderRadius: 18, padding: '1.5rem', width: '100%', maxWidth: 440, margin: '0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 17, margin: 0 }}>Fulfill / Adjust Payable</h3>
              <button onClick={() => setShowAdjust(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {adjError && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#7f1d1d30', border: '1px solid #7f1d1d', color: '#fca5a5', marginBottom: 16, fontSize: 13 }}>
                {adjError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Transaction Type</label>
                <select value={adjType} onChange={(e) => setAdjType(e.target.value as typeof adjType)} style={modalInputStyle}>
                  <option value="CREDIT">Credit</option>
                  <option value="DEBIT">Debit / Payout (Fulfill Wallet)</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                  <option value="REFUND">Refund</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Direction</label>
                <select value={adjDir} onChange={(e) => setAdjDir(e.target.value as 'IN' | 'OUT')} style={modalInputStyle}>
                  <option value="IN">In (adds to balance)</option>
                  <option value="OUT">Out (subtracts from balance)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Amount (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="0.00"
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Reason</label>
                <input
                  type="text"
                  value={adjDesc}
                  onChange={(e) => setAdjDesc(e.target.value)}
                  placeholder="Reason for adjustment"
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Admin PIN</label>
                <input
                  type="password"
                  value={adjPin}
                  onChange={(e) => setAdjPin(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  style={modalInputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAdjust(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--color-navy-border, #334155)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjLoading}
                style={{ flex: 2, padding: '10px', borderRadius: 10, background: 'var(--color-brand, #307ef2)', color: '#fff', border: 'none', cursor: adjLoading ? 'wait' : 'pointer', fontWeight: 600 }}
              >
                {adjLoading ? 'Processing...' : 'Confirm Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printPortalReady &&
        createPortal(
          <AdminPrintCanvas variant="full" reportId={printReportId}>
            <AdminReportPdf
              reportTitle="Branch Payables Report"
              reference={`BW-${storeId.slice(-8).toUpperCase()}`}
              filterLabel={wallet ? `${storeName} · ${wallet.store.city}` : storeName}
              periodLabel={pdfPeriodLabel}
              showPeriod={pdfSections.period}
              showStats={pdfSections.summaryStats}
              showTable={pdfSections.withdrawals}
              stats={pdfStats}
              sections={
                pdfSections.withdrawals
                  ? [
                      {
                        title: 'Withdrawal history',
                        columns: ['Requested', 'Payout period', 'Status', 'Amount (LKR)', 'Payment', 'Notes'],
                        alignRightFromColumn: 3,
                        emptyMessage: 'No withdrawal requests for this branch in the selected scope.',
                        rows: withdrawalsForPrint.map((row) => ({
                          key: row.id,
                          cells: [
                            new Date(row.createdAt).toLocaleDateString('en-LK', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            }),
                            withdrawalPeriodLabel(row),
                            withdrawalStatusLabel(row.status),
                            formatMoneyAmount(row.amount / 100),
                            row.paymentMethod?.trim() || '—',
                            row.remarks?.trim() || row.rejectionReason?.trim() || '—',
                          ],
                        })),
                      },
                    ]
                  : []
              }
            />
          </AdminPrintCanvas>,
          document.body,
        )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-navy-border, #334155)',
  background: 'var(--color-input-bg)',
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
