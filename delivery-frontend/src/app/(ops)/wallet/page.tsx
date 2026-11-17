'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  Bike,
  Calendar,
  CircleDollarSign,
  Download,
  FileText,
  History,
  ImageIcon,
  Loader2,
  Percent,
  RefreshCw,
  Search,
  Truck,
  Undo2,
  Wallet,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { deliveryWalletFetch, unlockDeliveryWallet } from '@/lib/deliveryWalletApi';
import {
  clearDeliveryWalletUnlockToken,
  readDeliveryWalletUnlockToken,
  writeDeliveryWalletUnlockToken,
} from '@/lib/deliveryWalletSession';
import { DeliveryWalletUnlockProvider } from '@/components/admin/DeliveryWalletUnlockContext';
import DeliveryWalletPinOverlay from '@/components/admin/DeliveryWalletPinOverlay';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import { hasMenuReadAccess } from '@/lib/adminPermissions';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { KPI_BOLD } from '@/lib/dashboardTheme';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import DateRangePicker from '@/components/admin/DateRangePicker';
import DeliveryApprovePayoutModal from '@/components/admin/DeliveryApprovePayoutModal';
import DeliveryPayoutPaymentCell from '@/components/admin/DeliveryPayoutPaymentCell';
import DeliveryPayoutPayModal from '@/components/admin/DeliveryPayoutPayModal';
import CurrentDeliveryPayoutCycleCard from '@/components/admin/CurrentDeliveryPayoutCycleCard';
import DeliveryPayoutsDuePanel from '@/components/admin/DeliveryPayoutsDuePanel';
import { openPayoutProofById } from '@/lib/adminProtectedFile';
import {
  parseDeliveryPayoutBreakdown,
  type DeliveryCurrentPayoutCycle,
  type DeliveryPayoutDueRow,
  type DeliveryPayoutHistoryRow,
  type DeliveryWalletSummary,
} from '@/lib/deliveryPayoutTypes';
import {
  DELIVERY_PAYOUT_STATEMENT_ZIP_MAX,
  deliveryPayoutStatementFilename,
  downloadDeliveryPayoutStatement,
  downloadDeliveryPayoutStatementZip,
} from '@/lib/deliveryPayoutStatementDownload';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/store/confirmStore';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import { cn } from '@/lib/utils';

function toDateParam(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

type PresetPeriod = 'today' | 'month';
type WalletPeriod = 'live' | 'all' | PresetPeriod | 'custom';

const PERIOD_LABELS: Record<PresetPeriod, string> = {
  today: 'Today',
  month: 'This Month',
};

function getPresetRange(period: PresetPeriod): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') {
    return { from: today, to: today };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: today };
}

function PeriodPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '6px 16px',
        borderRadius: 999,
        background: active ? 'var(--color-brand, #307ef2)' : 'var(--color-navy-card,#1e293b)',
        color: active ? '#fff' : 'var(--color-text-muted)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        transition: 'all 0.15s',
        boxShadow: active ? '0 0 12px rgba(48, 126, 242, 0.35)' : 'none',
        border: active
          ? '2px solid var(--color-brand, #307ef2)'
          : '1px solid var(--color-navy-border,#334155)',
      }}
    >
      {label}
    </button>
  );
}

type DeliveryPayoutRow = DeliveryPayoutHistoryRow & {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string;
};

type PayoutListResponse = {
  items: DeliveryPayoutRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

type DeliveryWalletTab = 'wallet' | 'history' | 'due';

const BASE_TABS: Array<{
  id: DeliveryWalletTab;
  label: string;
  icon: typeof Wallet;
}> = [
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'history', label: 'Payout History', icon: History },
];

const PAYOUTS_DUE_TAB: (typeof BASE_TABS)[number] = {
  id: 'due',
  label: 'Payouts due',
  icon: CircleDollarSign,
};

function statusLabel(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'Paid';
    case 'PENDING':
      return 'Pending';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'admin-status-badge--green';
    case 'PENDING':
      return 'admin-status-badge--amber';
    case 'REJECTED':
      return 'admin-status-badge--red';
    case 'CANCELLED':
      return 'admin-status-badge--neutral';
    default:
      return 'admin-status-badge--neutral';
  }
}

function formatPeriodDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function kpiMoney(amount: number) {
  return (
    <>
      <span className="mr-1 align-baseline text-[9px] font-semibold tracking-wide opacity-75">LKR</span>
      {formatMoneyAmount(amount)}
    </>
  );
}

function PlatformGatewayKpiCard({
  platformFee,
  gatewayFee,
  platformPercent,
  gatewayPercent,
  loading,
}: {
  platformFee: number;
  gatewayFee: number;
  platformPercent: number;
  gatewayPercent: number;
  loading: boolean;
}) {
  const bold = KPI_BOLD.navy;
  return (
    <div
      className="admin-dash-stat relative flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border-0 p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ background: bold.bg, color: bold.fg }}
    >
      <div className="relative z-[1] flex items-start gap-2">
        <div
          className="admin-dash-stat__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: bold.iconBg, color: bold.iconColor }}
        >
          <Percent size={17} strokeWidth={2.25} />
        </div>
        <p
          className="min-w-0 text-sm font-bold uppercase leading-snug tracking-[0.06em] line-clamp-2"
          style={{ color: bold.label }}
        >
          Platform & gateway
        </p>
      </div>
      <div className="relative z-[1] mt-4 grid flex-1 grid-cols-2 items-start gap-0">
        <div className="min-w-0 pr-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: bold.muted }}>
            Platform ({platformPercent}%)
          </p>
          <p className="mt-1 text-[clamp(0.95rem,1.2vw,1.25rem)] font-extrabold leading-none tracking-tight tabular-nums whitespace-nowrap">
            {loading ? '…' : kpiMoney(platformFee)}
          </p>
        </div>
        <div className="min-w-0 border-l border-white/20 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: bold.muted }}>
            Gateway ({gatewayPercent}%)
          </p>
          <p className="mt-1 text-[clamp(0.95rem,1.2vw,1.25rem)] font-extrabold leading-none tracking-tight tabular-nums whitespace-nowrap">
            {loading ? '…' : kpiMoney(gatewayFee)}
          </p>
        </div>
      </div>
      <span
        className="relative z-[1] mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-[10px] font-bold leading-snug"
        style={{ background: bold.badgeBg, color: bold.muted }}
      >
        Platform of gross · gateway after platform
      </span>
      <Percent
        size={76}
        className="pointer-events-none absolute bottom-1.5 right-1.5 opacity-[0.14]"
        strokeWidth={1.15}
        style={{ color: bold.iconColor }}
        aria-hidden
      />
    </div>
  );
}

function formatDateOnly(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return new Date(year, month - 1, day).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const PAYOUT_HISTORY_PAGE_SIZE = 25;

async function fetchDeliveryPayouts(
  unlockToken: string,
  page: number,
  limit: number,
): Promise<PayoutListResponse> {
  return deliveryWalletFetch(
    `/admin/delivery-wallet/payouts?page=${page}&limit=${limit}`,
    unlockToken,
  );
}

async function fetchAllDeliveryPayoutRows(unlockToken: string): Promise<DeliveryPayoutRow[]> {
  const limit = 50;
  const first = await fetchDeliveryPayouts(unlockToken, 1, limit);
  const rows = [...first.items];
  for (let p = 2; p <= first.pagination.pages; p += 1) {
    const next = await fetchDeliveryPayouts(unlockToken, p, limit);
    rows.push(...next.items);
  }
  return rows;
}

async function fetchPayoutPreviewInfo(unlockToken: string): Promise<{
  today: string;
  maxEndDate?: string;
  liveFrom?: string | null;
  liveTo?: string | null;
  liveAfterApproved?: boolean;
  currentPayoutCycle?: DeliveryCurrentPayoutCycle | null;
}> {
  return deliveryWalletFetch('/admin/delivery-wallet/payout-preview', unlockToken);
}

async function fetchDeliveryPayoutsDue(unlockToken: string): Promise<DeliveryPayoutDueRow[]> {
  return deliveryWalletFetch('/admin/delivery-wallet/payouts-due', unlockToken);
}

async function fetchDeliveryWallet(
  unlockToken: string,
  from?: string,
  to?: string,
  scope?: 'all',
): Promise<DeliveryWalletSummary> {
  const params = new URLSearchParams();
  if (scope === 'all') params.set('scope', 'all');
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return deliveryWalletFetch(`/admin/delivery-wallet${qs ? `?${qs}` : ''}`, unlockToken);
}

export default function DeliveryWalletPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-muted">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading delivery wallet…
        </div>
      }
    >
      <DeliveryWalletPageContent />
    </Suspense>
  );
}

function DeliveryWalletPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<DeliveryWalletTab>('wallet');
  const [period, setPeriod] = useState<WalletPeriod>('live');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [historyViewRow, setHistoryViewRow] = useState<DeliveryPayoutHistoryRow | null>(null);
  const [viewDueTarget, setViewDueTarget] = useState<DeliveryPayoutDueRow | null>(null);
  const [branchSearchQuery, setBranchSearchQuery] = useState('');
  const [branchPage, setBranchPage] = useState(1);
  const [branchPageSize, setBranchPageSize] = useState(25);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(PAYOUT_HISTORY_PAGE_SIZE);
  const [pageReady, setPageReady] = useState(false);
  const [liveBounds, setLiveBounds] = useState<{ from: string; to: string } | null>(null);
  const [liveBoundsResolved, setLiveBoundsResolved] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockToken, setUnlockToken] = useState('');

  useEffect(() => {
    const saved = readDeliveryWalletUnlockToken();
    if (!saved) return;
    setUnlockToken(saved);
    setUnlocked(true);
  }, []);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    setPageReady(true);
  }, []);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    if (isSuperAdmin(session)) {
      setSuperAdmin(true);
      setReady(true);
      return;
    }

        fetch(`${getApiBaseUrl()}/admin/me/permissions`, {
      headers: adminAuthHeaders(),
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        const list = res.data ?? res;
        const map: Record<string, { canRead: boolean }> = {};
        if (Array.isArray(list)) {
          list.forEach((p: { menu?: string; canRead?: boolean }) => {
            if (p.menu) map[p.menu] = { canRead: Boolean(p.canRead) };
          });
        }
        if (!hasMenuReadAccess(map, 'DELIVERY_WALLET')) {
          router.replace('/');
          return;
        }
        setReady(true);
      })
      .catch(() => {
        router.replace('/');
      });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const tab = searchParams.get('tab');
    if (tab === 'due' && !isSuperAdmin(getAdminSession())) {
      router.replace('/wallet', { scroll: false });
      setActiveTab('wallet');
      return;
    }
    if (tab === 'history' || tab === 'wallet' || tab === 'due') {
      setActiveTab(tab);
      return;
    }
    if (tab === 'requests') {
      router.replace('/wallet', { scroll: false });
      setActiveTab('wallet');
    }
  }, [ready, searchParams, router]);

  function selectTab(tab: DeliveryWalletTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'wallet') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `/wallet?${qs}` : '/wallet', { scroll: false });
  }

  const from = dateRange?.from ? toDateParam(dateRange.from) : undefined;
  const to = dateRange?.to
    ? toDateParam(dateRange.to)
    : dateRange?.from
      ? toDateParam(dateRange.from)
      : undefined;
  const rangeReady = !dateRange?.from || Boolean(from && to);
  const hasDateRange = Boolean(from && to);

  const { data: payoutInfo } = useQuery({
    queryKey: ['delivery-payout-preview-info'],
    queryFn: () => fetchPayoutPreviewInfo(unlockToken),
    enabled: pageReady && ready && unlocked,
    retry: false,
  });

  useEffect(() => {
    if (payoutInfo === undefined) return;
    const from = payoutInfo.liveFrom ?? null;
    const to = payoutInfo.liveTo ?? payoutInfo.today ?? null;
    setLiveBounds(from && to ? { from, to } : null);
    setLiveBoundsResolved(true);
  }, [payoutInfo]);

  const liveFrom = liveBounds?.from ?? null;
  const liveTo = liveBounds?.to ?? null;
  const liveRangeReady = Boolean(liveFrom && liveTo);
  const liveEmpty = liveBoundsResolved && !liveRangeReady;

  const liveQueryEnabled = pageReady && ready && unlocked && activeTab === 'wallet';

  const {
    data: liveData,
    isLoading: liveLoading,
    isFetching: liveFetching,
    error: liveError,
  } = useQuery({
    queryKey: ['delivery-wallet', 'live'],
    queryFn: () => fetchDeliveryWallet(unlockToken),
    enabled: liveQueryEnabled,
    retry: false,
  });

  const walletFrom = period === 'all' || period === 'live' ? undefined : from;
  const walletTo = period === 'all' || period === 'live' ? undefined : to;
  const filteredQueryEnabled =
    pageReady &&
    ready &&
    unlocked &&
    activeTab === 'wallet' &&
    period !== 'live' &&
    (period === 'all' || (rangeReady && hasDateRange));

  const {
    data: periodData,
    isLoading: periodLoading,
    isFetching: periodFetching,
    error: periodError,
  } = useQuery({
    queryKey: ['delivery-wallet', period, walletFrom ?? null, walletTo ?? null],
    queryFn: () =>
      fetchDeliveryWallet(
        unlockToken,
        walletFrom,
        walletTo,
        period === 'all' ? 'all' : undefined,
      ),
    enabled: filteredQueryEnabled,
    retry: false,
  });

  const displayData = period === 'live' ? (liveEmpty ? undefined : liveData) : periodData;
  const displayLoading =
    period === 'live' ? liveQueryEnabled && liveLoading : filteredQueryEnabled && periodLoading;
  const walletError = period === 'live' ? liveError : periodError;

  useEffect(() => {
    const message = walletError instanceof Error ? walletError.message : '';
    if (!message || !/pin required/i.test(message)) return;
    clearDeliveryWalletUnlockToken();
    setUnlockToken('');
    setUnlocked(false);
  }, [walletError]);

  const {
    data: payouts,
    isLoading: payoutsLoading,
    isFetching: payoutsFetching,
  } = useQuery({
    queryKey: ['delivery-wallet-payouts', historyPage, historyPageSize],
    queryFn: () => fetchDeliveryPayouts(unlockToken, historyPage, historyPageSize),
    enabled: pageReady && ready && unlocked && activeTab === 'history',
    retry: false,
  });

  const {
    data: deliveryDue = [],
    isLoading: deliveryDueLoading,
    isFetching: deliveryDueFetching,
  } = useQuery({
    queryKey: ['delivery-payouts-due', unlockToken],
    queryFn: () => fetchDeliveryPayoutsDue(unlockToken),
    enabled: pageReady && ready && unlocked && superAdmin && activeTab === 'due',
    retry: false,
  });

  const branches = displayData?.branches ?? [];
  const payoutRows = payouts?.items ?? [];
  const payoutHistoryTotal = payouts?.pagination.total ?? 0;
  const payoutHistoryTotalPages = payouts?.pagination.pages ?? 1;
  const payoutHistorySafePage = Math.min(historyPage, payoutHistoryTotalPages);
  const payoutHistoryRangeStart =
    payoutHistoryTotal === 0 ? 0 : (payoutHistorySafePage - 1) * historyPageSize + 1;
  const payoutHistoryRangeEnd = Math.min(payoutHistorySafePage * historyPageSize, payoutHistoryTotal);

  const filteredBranches = useMemo(() => {
    const q = branchSearchQuery.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((row) => row.storeName.toLowerCase().includes(q));
  }, [branches, branchSearchQuery]);

  const branchTotalPages = Math.max(1, Math.ceil(filteredBranches.length / branchPageSize));
  const branchSafePage = Math.min(branchPage, branchTotalPages);
  const paginatedBranches = filteredBranches.slice(
    (branchSafePage - 1) * branchPageSize,
    branchSafePage * branchPageSize,
  );
  const branchRangeStart =
    filteredBranches.length === 0 ? 0 : (branchSafePage - 1) * branchPageSize + 1;
  const branchRangeEnd = Math.min(branchSafePage * branchPageSize, filteredBranches.length);

  useEffect(() => {
    setBranchPage((page) => (page === 1 ? page : 1));
  }, [branchSearchQuery, walletFrom, walletTo, period]);

  useEffect(() => {
    setBranchPage((page) => (page === 1 ? page : 1));
  }, [branchPageSize]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyPageSize]);

  const walletTabs = useMemo(
    () => (superAdmin ? [...BASE_TABS, PAYOUTS_DUE_TAB] : BASE_TABS),
    [superAdmin],
  );

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Loading delivery wallet…
      </div>
    );
  }

  async function submitPin() {
    const value = pin.trim();
    if (!value || pinSubmitting) return;
    setPinSubmitting(true);
    setPinError('');
    try {
      const token = await unlockDeliveryWallet(value);
      writeDeliveryWalletUnlockToken(token);
      setPin('');
      setUnlockToken(token);
      setUnlocked(true);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setPinSubmitting(false);
    }
  }

  if (!unlocked || !unlockToken) {
    return (
      <DeliveryWalletPinOverlay
        password={pin}
        showPassword={showPin}
        error={pinError}
        submitting={pinSubmitting}
        onPasswordChange={(value) => {
          setPin(value);
          setPinError('');
        }}
        onToggleShow={() => setShowPin((value) => !value)}
        onSubmit={() => void submitPin()}
        onBack={() => router.push('/')}
      />
    );
  }

  const refreshing =
    activeTab === 'wallet'
      ? liveFetching || periodFetching
      : activeTab === 'due'
        ? deliveryDueFetching
        : payoutsFetching;
  const sessionId = getAdminSession()?.id;

  function handleRefresh() {
    if (activeTab === 'wallet') {
      void queryClient.invalidateQueries({ queryKey: ['delivery-wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['delivery-payout-preview-info'] });
      return;
    }
    if (activeTab === 'due') {
      void queryClient.invalidateQueries({ queryKey: ['delivery-payouts-due'] });
      void queryClient.invalidateQueries({ queryKey: ['delivery-payout-preview-info'] });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['delivery-wallet-payouts'] });
    void queryClient.invalidateQueries({ queryKey: ['delivery-payout-preview-info'] });
  }

  function payoutStatementAvailable(row: DeliveryPayoutRow): boolean {
    if (row.status === 'APPROVED') return true;
    if (row.status === 'PENDING' && parseDeliveryPayoutBreakdown(row.breakdown)) return true;
    return false;
  }

  async function downloadPayoutPdf(row: DeliveryPayoutRow) {
    if (!payoutStatementAvailable(row)) return;
    setDownloadBusyId(row.id);
    try {
      await downloadDeliveryPayoutStatement(
        row.id,
        unlockToken,
        deliveryPayoutStatementFilename(row.periodFrom, row.periodTo),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the payout statement');
    } finally {
      setDownloadBusyId(null);
    }
  }

  async function openPayoutProof(row: DeliveryPayoutRow) {
    try {
      await openPayoutProofById('deliveryPayout', row.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open payment proof');
    }
  }

  async function downloadAllApprovedPayouts() {
    setDownloadingAll(true);
    try {
      const allRows = await fetchAllDeliveryPayoutRows(unlockToken);
      const approved = allRows.filter((row) => row.status === 'APPROVED');
      if (approved.length === 0) {
        toast.error('No paid payouts to download.');
        return;
      }
      if (approved.length > DELIVERY_PAYOUT_STATEMENT_ZIP_MAX) {
        toast.error(
          `Download all is limited to ${DELIVERY_PAYOUT_STATEMENT_ZIP_MAX} payouts. Contact support if you need more.`,
        );
        return;
      }
      await downloadDeliveryPayoutStatementZip(
        approved.map((row) => row.id),
        unlockToken,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download payout statements');
    } finally {
      setDownloadingAll(false);
    }
  }

  async function cancelOwnPayout(row: DeliveryPayoutRow) {
    if (cancellingId) return;
    const confirmed = await confirmDialog({
      title: 'Cancel payout request?',
      message: `Cancel this pending delivery payout of ${formatMoney(row.amount)}? The period can be requested again.`,
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep',
      variant: 'danger',
    });
    if (!confirmed) return;
    setCancellingId(row.id);
    try {
      await deliveryWalletFetch(`/admin/delivery-wallet/payouts/${row.id}/cancel`, unlockToken, {
        method: 'POST',
      });
      toast.success('Payout request cancelled');
      void queryClient.invalidateQueries({ queryKey: ['delivery-wallet-payouts'] });
      void queryClient.invalidateQueries({ queryKey: ['delivery-payout-preview-info'] });
      void queryClient.invalidateQueries({ queryKey: ['delivery-wallet'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel payout');
    } finally {
      setCancellingId(null);
    }
  }

  function handleLive() {
    setPeriod('live');
    setDateRange(undefined);
  }

  function handlePreset(next: PresetPeriod) {
    setPeriod(next);
    setDateRange(getPresetRange(next));
  }

  function handleAllTime() {
    setPeriod('all');
    setDateRange(undefined);
  }

  function handleCustomRangeChange(range: DateRange | undefined) {
    setDateRange(range);
    if (range?.from && range?.to) {
      setPeriod('custom');
    }
  }

  function handleCustomRangeClear() {
    setPeriod('live');
    setDateRange(undefined);
  }

  const liveNetHint =
    liveFrom && liveTo
      ? `${
          payoutInfo?.liveAfterApproved
            ? `${formatDateOnly(liveFrom)} – ${formatDateOnly(liveTo)}`
            : `First delivery – ${formatDateOnly(liveTo)}`
        }. Includes today (not yet payable).${
          payoutInfo?.maxEndDate
            ? ` Payable through ${formatDateOnly(payoutInfo.maxEndDate)}.`
            : ''
        }`
      : 'After last approved payout. Includes today (not yet payable).';

  const periodCaption =
    period === 'live'
      ? liveEmpty
        ? 'No delivery fees yet.'
        : 'Gross, fees, and branches for the live window.'
      : period === 'all'
        ? 'All-time totals. Refunds use complete or reject time.'
        : walletFrom && walletTo
          ? `${formatDateOnly(walletFrom)} – ${formatDateOnly(walletTo)}.`
          : null;

  const currentCycle = payoutInfo?.currentPayoutCycle ?? null;

  return (
    <DeliveryWalletUnlockProvider token={unlockToken}>
    <div className="admin-dashboard mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Bike size={22} className="text-brand" />
            <h1 className="text-2xl font-bold text-white">Delivery Wallet</h1>
          </div>
          <p className="text-sm text-muted">
            {activeTab === 'wallet'
              ? 'Delivery fees from all branches, minus platform fee then payment gateway fee.'
              : activeTab === 'due'
                ? 'View the current 30-day cycle (not payable until it closes) and completed periods due for payout. Pay from main admin Wallet → Payouts Due → Delivery.'
                : 'Paid delivery payouts on a 30-day cycle (super admin). Pending rows can be cancelled; proof can be uploaded after pay.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-navy-border px-3 py-2 text-sm text-muted hover:text-white"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Delivery wallet views">
        {walletTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
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

      {currentCycle && <CurrentDeliveryPayoutCycleCard cycle={currentCycle} />}

      {activeTab === 'wallet' && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--color-navy-border,#334155)] bg-[var(--color-navy-card,#1e293b)] px-4 py-2.5">
            <Calendar size={15} className="shrink-0 text-[var(--color-brand,#307ef2)]" />
            <span className="mr-1 text-[13px] font-semibold text-[var(--color-text-muted)]">Period:</span>
            <PeriodPill label="Live" active={period === 'live'} onClick={handleLive} />
            {(['today', 'month'] as PresetPeriod[]).map((p) => (
              <PeriodPill
                key={p}
                label={PERIOD_LABELS[p]}
                active={period === p}
                onClick={() => handlePreset(p)}
              />
            ))}
            <div
              className={cn(
                'rounded-full transition-all',
                period === 'custom' &&
                  'ring-2 ring-[var(--color-brand,#307ef2)] ring-offset-1 ring-offset-[var(--color-navy-card,#1e293b)]',
              )}
            >
              <DateRangePicker
                value={period === 'custom' ? dateRange : undefined}
                onChange={handleCustomRangeChange}
                onClear={handleCustomRangeClear}
                showClear={period === 'custom'}
              />
            </div>
            {superAdmin && (
              <PeriodPill label="All time" active={period === 'all'} onClick={handleAllTime} />
            )}
          </div>
          {periodCaption && <p className="text-xs text-muted">{periodCaption}</p>}

          {liveError && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {liveError instanceof Error ? liveError.message : 'Failed to load live delivery wallet'}
            </div>
          )}
          {period !== 'live' && periodError && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {periodError instanceof Error ? periodError.message : 'Failed to load delivery wallet'}
            </div>
          )}

          <div className="space-y-2">
            <div
              className={
                period === 'live'
                  ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
                  : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-5'
              }
            >
        <DashboardKpiCard
          label="Live net"
          value={kpiMoney(liveEmpty ? 0 : (liveData?.netForDelivery ?? 0))}
          hint={liveNetHint}
          icon={Wallet}
          loading={liveQueryEnabled && liveLoading}
          tone="greenDark"
        />
        <DashboardKpiCard
          label="Gross delivery fees"
          value={kpiMoney(displayData?.grossDeliveryFee ?? 0)}
          hint={`${displayData?.orderCount ?? 0} orders · ${displayData?.lateCancelCount ?? 0} late cancels`}
          icon={Truck}
          loading={displayLoading}
        />
        <DashboardKpiCard
          label="Delivery refunds"
          value={kpiMoney(displayData?.fromLateCancels ?? 0)}
          hint={`${displayData?.lateCancelCount ?? 0} non-returning`}
          icon={Undo2}
          loading={displayLoading}
          tone="orange"
        />
        <PlatformGatewayKpiCard
          platformFee={displayData?.platformFee ?? 0}
          gatewayFee={displayData?.gatewayFee ?? 0}
          platformPercent={displayData?.platformFeePercent ?? 0}
          gatewayPercent={displayData?.gatewayFeePercent ?? 0}
          loading={displayLoading}
        />
        {period !== 'live' && (
          <DashboardKpiCard
            label="Net"
            value={kpiMoney(displayData?.netForDelivery ?? 0)}
            hint="After platform then gateway"
            icon={Wallet}
            loading={displayLoading}
            tone="green"
          />
        )}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-border px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-white">By branch</h2>
              {!displayLoading && branches.length > 0 && (
                <div className="input-icon-wrap w-full max-w-sm sm:w-auto">
                  <Search size={14} className="input-icon" aria-hidden />
                  <input
                    className="search-bar text-sm"
                    placeholder="Search branches..."
                    value={branchSearchQuery}
                    onChange={(e) => setBranchSearchQuery(e.target.value)}
                    aria-label="Search branches"
                  />
                </div>
              )}
            </div>
            {walletError ? (
              <div className="px-4 py-3 text-sm text-red-300">
                {walletError instanceof Error ? walletError.message : 'Failed to load branch totals'}
              </div>
            ) : displayLoading ? (
              <div className="flex items-center justify-center py-16 text-muted">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading branch totals…
              </div>
            ) : branches.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-muted">
                No delivery fees in this period.
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-muted">
                {branchSearchQuery.trim()
                  ? `No branches match "${branchSearchQuery}"`
                  : 'No delivery fees in this period.'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-4 py-3 font-medium sm:px-5">Branch</th>
                        <th className="px-4 py-3 font-medium">Active orders</th>
                        <th className="px-4 py-3 font-medium">Late cancels</th>
                        <th className="px-4 py-3 font-medium">Gross</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">
                          Platform fee
                          {displayData?.platformFeePercent != null
                            ? ` (${displayData.platformFeePercent}%)`
                            : ''}
                        </th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">
                          Gateway fee
                          {displayData?.gatewayFeePercent != null
                            ? ` (${displayData.gatewayFeePercent}%)`
                            : ''}
                        </th>
                        <th className="px-4 py-3 font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBranches.map((row) => (
                        <tr key={row.storeId} className="border-b border-navy-border/60 last:border-0">
                          <td className="px-4 py-3 font-medium text-white sm:px-5">{row.storeName}</td>
                          <td className="px-4 py-3 text-muted">
                            {formatMoney(row.fromActiveOrders)}
                            <span className="ml-1 text-xs">({row.orderCount})</span>
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {formatMoney(row.fromLateCancels)}
                            <span className="ml-1 text-xs">({row.lateCancelCount})</span>
                          </td>
                          <td className="px-4 py-3 text-white">{formatMoney(row.grossDeliveryFee)}</td>
                          <td className="px-4 py-3 text-muted">{formatMoney(row.platformFee)}</td>
                          <td className="px-4 py-3 text-muted">{formatMoney(row.gatewayFee)}</td>
                          <td className="px-4 py-3 font-medium text-white">{formatMoney(row.netForDelivery)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <AdminTablePagination
                  pageSize={branchPageSize}
                  onPageSizeChange={setBranchPageSize}
                  rangeStart={branchRangeStart}
                  rangeEnd={branchRangeEnd}
                  totalItems={filteredBranches.length}
                  safePage={branchSafePage}
                  totalPages={branchTotalPages}
                  pageList={buildPageList(branchSafePage, branchTotalPages)}
                  onPageChange={setBranchPage}
                  itemLabel="branches"
                  ariaLabel="Branch table pagination"
                  className="border-t border-navy-border"
                />
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'due' && superAdmin && (
        <DeliveryPayoutsDuePanel
          rows={deliveryDue}
          loading={deliveryDueLoading}
          allowPay={false}
          onView={(row) => setViewDueTarget(row)}
        />
      )}

      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-border px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <History size={18} className="text-brand" />
              <div>
                <h2 className="text-sm font-semibold text-white">Payout history</h2>
                <p className="text-xs text-muted">Paid delivery payout periods</p>
              </div>
            </div>
            {payoutRows.length > 0 && (
              <button
                type="button"
                disabled={downloadingAll || payoutsLoading}
                onClick={() => void downloadAllApprovedPayouts()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-navy-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloadingAll ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}
                Download all
              </button>
            )}
          </div>
          {payoutsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading payouts…
            </div>
          ) : payoutRows.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-muted">
              No delivery payouts yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium sm:px-5">Period</th>
                    <th className="px-4 py-3 font-medium">Net amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Paid</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Proof</th>
                    <th className="px-4 py-3 font-medium">Receipt</th>
                    <th className="px-4 py-3 font-medium">Remarks</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRows.map((row) => (
                    <tr key={row.id} className="border-b border-navy-border/60 last:border-0">
                      <td className="px-4 py-3 text-white sm:px-5">
                        {formatPeriodDate(row.periodFrom)} – {formatPeriodDate(row.periodTo)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">{formatMoney(row.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`admin-status-badge ${statusBadgeClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{formatPeriodDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <DeliveryPayoutPaymentCell row={row} />
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'APPROVED' && row.hasProof ? (
                          <button
                            type="button"
                            onClick={() => void openPayoutProof(row)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                          >
                            <ImageIcon size={13} />
                            View
                          </button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {payoutStatementAvailable(row) ? (
                          <button
                            type="button"
                            disabled={downloadBusyId === row.id}
                            onClick={() => void downloadPayoutPdf(row)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {downloadBusyId === row.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <FileText size={13} />
                            )}
                            View receipt
                          </button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-muted">
                        {row.remarks?.trim() || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {row.status === 'PENDING' && row.requestedById === sessionId && (
                            <button
                              type="button"
                              onClick={() => void cancelOwnPayout(row)}
                              disabled={cancellingId === row.id}
                              className="inline-flex items-center rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                            >
                              {cancellingId === row.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                'Cancel'
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setHistoryViewRow(row)}
                            className="inline-flex items-center rounded-lg border border-navy-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-light"
                          >
                            Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payoutHistoryTotal > 0 && (
            <AdminTablePagination
              pageSize={historyPageSize}
              onPageSizeChange={setHistoryPageSize}
              rangeStart={payoutHistoryRangeStart}
              rangeEnd={payoutHistoryRangeEnd}
              totalItems={payoutHistoryTotal}
              safePage={payoutHistorySafePage}
              totalPages={payoutHistoryTotalPages}
              pageList={buildPageList(payoutHistorySafePage, payoutHistoryTotalPages)}
              onPageChange={setHistoryPage}
              itemLabel="payouts"
              ariaLabel="Payout history pagination"
              className="border-t border-navy-border"
            />
          )}
        </div>
      )}

      {historyViewRow && (
        <DeliveryApprovePayoutModal
          open
          payout={historyViewRow}
          readOnly
          onClose={() => setHistoryViewRow(null)}
          onDownloadReceipt={
            payoutStatementAvailable(historyViewRow as DeliveryPayoutRow)
              ? () => downloadPayoutPdf(historyViewRow as DeliveryPayoutRow)
              : undefined
          }
          receiptDownloading={downloadBusyId === historyViewRow.id}
        />
      )}

      {viewDueTarget && (
        <DeliveryPayoutPayModal
          open
          due={viewDueTarget}
          readOnly
          onClose={() => setViewDueTarget(null)}
        />
      )}
    </div>
    </DeliveryWalletUnlockProvider>
  );
}
