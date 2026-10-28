'use client';

import { useState } from 'react';
import { CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatMoney } from '@/lib/receipt';

export type PlatformEarningsLineItem = {
  id: string;
  storeId: string;
  storeName: string;
  storeWithdrawalId: string;
  payoutLabel: string;
  payoutSequence: number;
  periodFrom: string | null;
  periodTo: string | null;
  commissionAmount: number;
  convenienceFeeAmount: number;
  platformPaybackAmount?: number;
  totalEarned: number;
  approvedAt: string;
  calendarMonth?: string;
  settlementStatus?: 'unsettled' | 'settled';
  carriedForward?: boolean;
};

export type BranchEarningsGroup = {
  storeId: string;
  storeName: string;
  branchLabel: string;
  payoutCount: number;
  commissionAmount: number;
  convenienceFeeAmount: number;
  totalEarned: number;
  items: PlatformEarningsLineItem[];
};

export type PlatformEarningsBreakdown = {
  calendarMonth: string;
  items: PlatformEarningsLineItem[];
  branches: BranchEarningsGroup[];
  totals: {
    totalCommission: number;
    totalConvenienceFee: number;
    totalEarned: number;
    payoutCount: number;
  };
  settlement: {
    status: 'OPEN' | 'SETTLED' | 'SETTLED_WITH_PENDING';
    settledAt: string | null;
    notes: string | null;
  };
};

export type SettlementPreview = {
  calendarMonth: string;
  currentMonthItems: PlatformEarningsLineItem[];
  carriedForwardItems: PlatformEarningsLineItem[];
  items: PlatformEarningsLineItem[];
  branches: BranchEarningsGroup[];
  totals: {
    totalCommission: number;
    totalConvenienceFee: number;
    totalEarned: number;
    payoutCount: number;
  };
};

function formatMonthLabel(calendarMonth: string) {
  const [year, month] = calendarMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-LK', {
    month: 'long',
    year: 'numeric',
  });
}

function formatPeriod(from: string | null, to: string | null) {
  if (!from || !to) return 'Period unavailable';
  const fromDate = new Date(from).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const toDate = new Date(to).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${fromDate} – ${toDate}`;
}

function centsToMoney(cents: number) {
  return formatMoney(cents / 100);
}

function PayoutLineItem({ item }: { item: PlatformEarningsLineItem }) {
  return (
    <div className="rounded-lg border border-navy-border/70 bg-navy/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">{item.payoutLabel}</p>
            {item.carriedForward && item.calendarMonth && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                From {formatMonthLabel(item.calendarMonth)}
              </span>
            )}
            {item.settlementStatus === 'unsettled' && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200/80">
                Unsettled
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <CalendarRange size={12} />
            {formatPeriod(item.periodFrom, item.periodTo)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-brand tabular-nums">
          {centsToMoney(item.totalEarned)}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted">
        <span>Commission: {centsToMoney(item.commissionAmount)}</span>
        <span>Convenience: {centsToMoney(item.convenienceFeeAmount)}</span>
        {(item.platformPaybackAmount ?? 0) > 0 && (
          <span className="col-span-2 text-emerald-400/90">
            Platform payback: −{centsToMoney(item.platformPaybackAmount ?? 0)}
          </span>
        )}
      </div>
    </div>
  );
}

function BranchGroup({ branch }: { branch: BranchEarningsGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-navy-border bg-navy/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown size={16} className="shrink-0 text-muted" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-muted" />
          )}
          <div>
            <p className="font-medium text-white">{branch.branchLabel} Branch</p>
            <p className="text-xs text-muted">
              {branch.payoutCount} payout{branch.payoutCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-brand tabular-nums">
            {centsToMoney(branch.totalEarned)}
          </p>
          <p className="text-[11px] text-muted">
            Comm. {centsToMoney(branch.commissionAmount)} · Conv.{' '}
            {centsToMoney(branch.convenienceFeeAmount)}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-navy-border px-4 py-3">
          {branch.items.map((item) => (
            <PayoutLineItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  calendarMonth: string | null;
  breakdown: PlatformEarningsBreakdown | null;
  loading?: boolean;
  onSettle?: () => void;
};

export default function PlatformEarningsMonthDetail({
  open,
  onClose,
  calendarMonth,
  breakdown,
  loading = false,
  onSettle,
}: Props) {
  const monthLabel = calendarMonth ? formatMonthLabel(calendarMonth) : '';
  const settlementStatus = breakdown?.settlement.status;
  const isFullySettled = settlementStatus === 'SETTLED';
  const hasPendingAfterSettle = settlementStatus === 'SETTLED_WITH_PENDING';
  const branches =
    breakdown?.branches?.length ? breakdown.branches : breakdown?.items?.length
      ? [
          {
            storeId: breakdown.items[0].storeId,
            storeName: breakdown.items[0].storeName,
            branchLabel: breakdown.items[0].storeName.replace(/^Bing Chun\s*-\s*/i, '').trim(),
            payoutCount: breakdown.items.length,
            commissionAmount: breakdown.totals.totalCommission,
            convenienceFeeAmount: breakdown.totals.totalConvenienceFee,
            totalEarned: breakdown.totals.totalEarned,
            items: breakdown.items,
          },
        ]
      : [];

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto border-navy-border bg-navy-light text-fg"
      >
        <SheetHeader className="border-b border-navy-border pb-4">
          <SheetTitle className="text-white">{monthLabel} — Platform Earnings</SheetTitle>
          <SheetDescription className="text-muted">
            Commission collected from approved branch payouts, grouped by branch.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading breakdown…
          </div>
        ) : breakdown ? (
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-navy-border bg-navy/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Commission</p>
                <p className="mt-1 text-sm font-semibold text-white tabular-nums">
                  {centsToMoney(breakdown.totals.totalCommission)}
                </p>
              </div>
              <div className="rounded-xl border border-navy-border bg-navy/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Convenience</p>
                <p className="mt-1 text-sm font-semibold text-white tabular-nums">
                  {centsToMoney(breakdown.totals.totalConvenienceFee)}
                </p>
              </div>
              <div className="rounded-xl border border-brand/30 bg-brand/10 p-3">
                <p className="text-[11px] uppercase tracking-wide text-brand">Total Earned</p>
                <p className="mt-1 text-sm font-semibold text-white tabular-nums">
                  {centsToMoney(breakdown.totals.totalEarned)}
                </p>
              </div>
            </div>

            {isFullySettled && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Settled / Withdrawn</p>
                  {breakdown.settlement.settledAt && (
                    <p className="text-xs text-emerald-200/80">
                      {new Date(breakdown.settlement.settledAt).toLocaleString('en-LK')}
                    </p>
                  )}
                  {breakdown.settlement.notes && (
                    <p className="mt-1 text-xs text-emerald-200/80">{breakdown.settlement.notes}</p>
                  )}
                </div>
              </div>
            )}

            {hasPendingAfterSettle && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                <p className="font-medium">Settled with pending late payouts</p>
                <p className="mt-1 text-xs text-amber-200/80">
                  Additional payouts approved after settlement will be included in the next month&apos;s
                  close-out.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                By branch ({branches.length})
              </p>
              {branches.length === 0 ? (
                <p className="rounded-xl border border-dashed border-navy-border px-4 py-8 text-center text-sm text-muted">
                  No platform earnings recorded for this month.
                </p>
              ) : (
                branches.map((branch) => <BranchGroup key={branch.storeId} branch={branch} />)
              )}
            </div>

            {onSettle && breakdown.items.some((item) => item.settlementStatus === 'unsettled') && (
              <button
                type="button"
                onClick={onSettle}
                className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold"
              >
                Settle / Withdraw This Month
              </button>
            )}
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-muted">Select a month to view details.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
