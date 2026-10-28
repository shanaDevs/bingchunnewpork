'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, Landmark, Loader2, RefreshCw, Wallet, Clock, CircleDollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import PlatformEarningsMonthDetail, {
  type PlatformEarningsBreakdown,
} from '@/components/admin/PlatformEarningsMonthDetail';
import PlatformSettleModal from '@/components/admin/PlatformSettleModal';
import { formatMoney } from '@/lib/receipt';
import { centsStringToNumber } from '@/lib/moneyString';

function centsFromApi(value: string | number): number {
  if (typeof value === 'number') return value;
  try {
    return centsStringToNumber(value);
  } catch {
    return Number(value) || 0;
  }
}

function normalizeSummaryResponse(data: SummaryResponse): SummaryResponse {
  return {
    months: data.months.map((row) => ({
      ...row,
      totalCommission: centsFromApi(row.totalCommission),
      totalConvenienceFee: centsFromApi(row.totalConvenienceFee),
      totalEarned: centsFromApi(row.totalEarned),
      pendingEarned: centsFromApi(row.pendingEarned),
    })),
    platformPosition: {
      ...data.platformPosition,
      lifetimeEarned: centsFromApi(data.platformPosition.lifetimeEarned),
      availableToSettle: centsFromApi(data.platformPosition.availableToSettle),
      settledWithdrawn: centsFromApi(data.platformPosition.settledWithdrawn),
    },
  };
}

type MonthlyEarningsStatus = 'OPEN' | 'SETTLED' | 'SETTLED_WITH_PENDING';

type MonthlySummaryRow = {
  calendarMonth: string;
  totalCommission: number | string;
  totalConvenienceFee: number | string;
  totalEarned: number | string;
  payoutCount: number;
  pendingCount: number;
  pendingEarned: number | string;
  status: MonthlyEarningsStatus;
  settledAt: string | null;
  notes: string | null;
  canSettle: boolean;
};

type PlatformPosition = {
  lifetimeEarned: number | string;
  availableToSettle: number | string;
  settledWithdrawn: number | string;
  totalPayoutsTracked: number;
};

type SummaryResponse = {
  months: MonthlySummaryRow[];
  platformPosition: PlatformPosition;
};

function formatMonthLabel(calendarMonth: string) {
  const [year, month] = calendarMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-LK', {
    month: 'long',
    year: 'numeric',
  });
}

function centsToMoney(cents: number | string) {
  return formatMoney(centsFromApi(cents) / 100);
}

async function fetchMonthlySummary(): Promise<SummaryResponse> {
  const res = await fetch(`${getApiBaseUrl()}/admin/platform-earnings`, {
    headers: adminAuthHeaders(), credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to load platform earnings');

  const data = json.data ?? json;
  if (Array.isArray(data)) {
    return {
      months: data,
      platformPosition: {
        lifetimeEarned: data.reduce(
          (sum: number, row: MonthlySummaryRow) => sum + centsFromApi(row.totalEarned),
          0,
        ),
        availableToSettle: data
          .filter((row: MonthlySummaryRow) => row.status === 'OPEN')
          .reduce((sum: number, row: MonthlySummaryRow) => sum + centsFromApi(row.totalEarned), 0),
        settledWithdrawn: data
          .filter((row: MonthlySummaryRow) => row.status === 'SETTLED')
          .reduce((sum: number, row: MonthlySummaryRow) => sum + centsFromApi(row.totalEarned), 0),
        totalPayoutsTracked: data.reduce(
          (sum: number, row: MonthlySummaryRow) => sum + row.payoutCount,
          0,
        ),
      },
    };
  }
  return normalizeSummaryResponse(data as SummaryResponse);
}

async function fetchMonthlyBreakdown(calendarMonth: string): Promise<PlatformEarningsBreakdown> {
  const res = await fetch(`${getApiBaseUrl()}/admin/platform-earnings/${calendarMonth}`, {
    headers: adminAuthHeaders(), credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to load month breakdown');
  return json.data ?? json;
}

function StatusBadge({ row }: { row: MonthlySummaryRow }) {
  if (row.status === 'SETTLED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <CheckCircle2 size={12} />
        Settled
      </span>
    );
  }
  if (row.status === 'SETTLED_WITH_PENDING') {
    return (
      <span className="inline-flex flex-col gap-0.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
        <span>Settled · {row.pendingCount} late pending</span>
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
      Open
    </span>
  );
}

export default function PlatformEarningsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isSuperAdmin(session)) {
      router.replace('/admin');
      return;
    }
    setReady(true);
  }, [router]);

  const {
    data: summaryResponse,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['platform-earnings-summary'],
    queryFn: fetchMonthlySummary,
    enabled: ready,
  });

  const summary = summaryResponse?.months ?? [];
  const platformPosition = summaryResponse?.platformPosition;

  const {
    data: breakdown,
    isLoading: breakdownLoading,
    refetch: refetchBreakdown,
  } = useQuery({
    queryKey: ['platform-earnings-breakdown', selectedMonth],
    queryFn: () => fetchMonthlyBreakdown(selectedMonth!),
    enabled: ready && !!selectedMonth && detailOpen,
  });

  const openMonthDetail = useCallback((calendarMonth: string) => {
    setSelectedMonth(calendarMonth);
    setDetailOpen(true);
  }, []);

  const openSettleModal = useCallback((calendarMonth: string) => {
    setSelectedMonth(calendarMonth);
    setSettleOpen(true);
  }, []);

  const handleSettled = useCallback(async () => {
    toast.success('Monthly platform earnings marked as settled');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['platform-earnings-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['platform-earnings-settle-preview'] }),
      refetchBreakdown(),
    ]);
    setDetailOpen(false);
  }, [queryClient, refetchBreakdown]);

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Loading platform earnings…
      </div>
    );
  }

  const openMonths = summary.filter((row) => row.status === 'OPEN');

  return (
    <div className="admin-dashboard mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Landmark size={22} className="text-brand" />
            <h1 className="text-2xl font-bold text-white">Platform Earnings & Settlement</h1>
          </div>
          <p className="text-sm text-muted">
            DartCodes commission automatically credited on each approved branch payout, grouped by calendar month.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-xl border border-navy-border px-3 py-2 text-sm text-muted hover:text-white"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard
          label="Lifetime earned"
          value={centsToMoney(platformPosition?.lifetimeEarned ?? 0)}
          hint="All platform commission collected"
          icon={CircleDollarSign}
        />
        <DashboardKpiCard
          label="Available to settle"
          value={centsToMoney(platformPosition?.availableToSettle ?? 0)}
          hint="Unsettled earnings awaiting close-out"
          icon={Wallet}
        />
        <DashboardKpiCard
          label="Settled & withdrawn"
          value={centsToMoney(platformPosition?.settledWithdrawn ?? 0)}
          hint="Marked settled for accounting"
          icon={CheckCircle2}
        />
        <DashboardKpiCard
          label="Payouts tracked"
          value={String(platformPosition?.totalPayoutsTracked ?? 0)}
          hint={`${openMonths.length} open month${openMonths.length === 1 ? '' : 's'}`}
          icon={Clock}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-navy-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-white">Monthly earnings summary</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading monthly summary…
          </div>
        ) : summary.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-muted">
            No platform earnings yet. Commission will appear here when branch payouts are approved.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium sm:px-5">Month</th>
                  <th className="px-4 py-3 font-medium">Commission</th>
                  <th className="px-4 py-3 font-medium">Convenience fee</th>
                  <th className="px-4 py-3 font-medium">Total earned</th>
                  <th className="px-4 py-3 font-medium">Payouts</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-border">
                {summary.map((row) => (
                  <tr key={row.calendarMonth} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white sm:px-5">
                      {formatMonthLabel(row.calendarMonth)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fg">
                      {centsToMoney(row.totalCommission)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fg">
                      {centsToMoney(row.totalConvenienceFee)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-brand">
                      {centsToMoney(row.totalEarned)}
                    </td>
                    <td className="px-4 py-3 text-muted">{row.payoutCount}</td>
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openMonthDetail(row.calendarMonth)}
                          className="inline-flex items-center gap-1 rounded-lg border border-navy-border px-2.5 py-1.5 text-xs text-muted hover:text-white"
                        >
                          <Eye size={14} />
                          View
                        </button>
                        {row.canSettle && (
                          <button
                            type="button"
                            onClick={() => openSettleModal(row.calendarMonth)}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand/15 px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand/25"
                          >
                            Settle
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlatformEarningsMonthDetail
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        calendarMonth={selectedMonth}
        breakdown={breakdown ?? null}
        loading={breakdownLoading}
        onSettle={
          breakdown?.items.some((item) => item.settlementStatus === 'unsettled') && selectedMonth
            ? () => {
                setDetailOpen(false);
                setSettleOpen(true);
              }
            : undefined
        }
      />

      <PlatformSettleModal
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        calendarMonth={selectedMonth}
        onSettled={handleSettled}
      />
    </div>
  );
}
