'use client';

import { withAdminCredentials } from '@/lib/adminSession';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, Loader2, X, Settings, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import ChannelSalesTable from '@/components/admin/ChannelSalesTable';
import { resolveSlabRatePctFromPreview } from '@/components/admin/commissionUtils';
import {
  resolveBranchPayoutDisplay,
  resolvePayableWalletLkrForPayout,
} from '@/components/admin/branchPayoutDisplay';
import PayoutBreakdownPanel from '@/components/admin/PayoutBreakdownPanel';
import {
  buildSettlementPreviewFromChannelBreakdown,
  computePeriodPayoutSplitLkr,
  channelBreakdownHasSalesActivity,
  parseWithdrawalBreakdown,
  parseWithdrawalBreakdownFromNetPreview,
  mergeLivePayoutPreviewIntoStoredBreakdown,
  mergeSharedPromoContributionFieldsIntoBreakdown,
  isWithdrawalFinancialSnapshotLocked,
  resolveFirstPayoutGatewayBaseLkr,
  resolveFirstPayoutBranchWalletNetLkr,
  extractSharedPromoLkrFromBreakdown,
  resolvePlatformCommissionForPeriodLkr,
  resolvePeriodNetLkrFromBreakdown,
  resolvePeriodDeliveryFeeLkr,
  resolvePreviewConvenienceFeeLkr,
  resolveTotalDeliveryFeeForAllocationLkr,
  sumAllRevenueSubtotal,
  sumChannelBreakdownOrderCount,
  type SettlementPreview,
  type WithdrawalBreakdown,
  withdrawalBreakdownToLkr,
} from '@/components/admin/settlementTypes';
import { resolvePayoutCycleDisplayRange } from '@/components/admin/payoutSecondCycleDisplayRange';
import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { centsToLkr, paybackEnabledFromBreakdown, toDateInputValue } from '@/lib/walletUtils';
import {
  formatBiweeklyPeriodLabel,
  isValidPayoutRange,
  resolvePayoutPeriodIncompleteState,
  rollingPeriodLabel,
  todayDateStr,
  type RollingPeriodOption,
} from '@/lib/biweeklyPeriods';
import { confirmDialog } from '@/store/confirmStore';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Ledger balance in cents (total active wallet balance). */
  walletBalance: number;
  /** Maximum withdrawable amount in cents (hard cap before advance mode). */
  availableBalance: number;
  apiBase: string;
  onSubmitted: () => void;
  storeId?: string;
  /** Branch admins should not see gateway fees; super admin may pass true. */
  showGatewayFees?: boolean;
  /** When set, opens the modal in read-only view mode for an existing withdrawal. */
  viewWithdrawal?: WithdrawalRow | null;
  /** Synthetic 15-day period view: skip refetch by id and show Pending (not Pending Approval). */
  viewPeriodOnly?: boolean;
  /** Override displayed date range / day count (e.g. full 30-day window for second-cycle payout view). */
  viewPeriodDisplay?: { from: string; to: string; days: number } | null;
};

function withdrawalStatusLabel(status: WithdrawalRow['status']) {
  switch (status) {
    case 'APPROVED':
      return 'Paid';
    case 'PENDING':
      return 'Pending Approval';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function isValidRange(from: string, to: string): boolean {
  return isValidPayoutRange(from, to);
}

/** Period net capped by the wallet's maximum withdrawable balance. */
function cappedPeriodPayoutLkr(periodNetLkr: number | null, availableLkr: number): number | null {
  if (periodNetLkr == null || periodNetLkr <= 0) return null;
  return Math.min(periodNetLkr, availableLkr);
}

function formatDefaultAmount(periodNetLkr: number | null, availableLkr: number): string {
  const capped = cappedPeriodPayoutLkr(periodNetLkr, availableLkr);
  return capped != null && capped > 0 ? capped.toFixed(2) : '';
}

function netPreviewToChannelPreview(
  preview: {
    period?: { from: string; to: string };
    breakdown?: SettlementPreview['breakdown'];
    totalCommission?: number;
    totalProviderFee?: number;
    orderCount?: number;
    slabInfo?: SettlementPreview['slabInfo'];
  } | null | undefined,
  from: string,
  to: string,
): SettlementPreview | null {
  if (!preview?.breakdown) return null;
  const summedOrderCount = sumChannelBreakdownOrderCount(preview.breakdown);
  const orderCount =
    preview.orderCount != null && preview.orderCount > 0
      ? preview.orderCount
      : summedOrderCount;
  return {
    period: preview.period ?? { from, to },
    breakdown: preview.breakdown,
    totalCommission: preview.totalCommission ?? 0,
    totalProviderFee: preview.totalProviderFee ?? 0,
    totalOwed: preview.totalCommission ?? 0,
    orderCount,
    slabInfo: preview.slabInfo ?? {
      monthlyBase: 0,
      effectiveRate: 0,
      slabIndex: 0,
    },
  };
}

async function fetchChannelPreviewFromNetPreview(
  apiBase: string,
  from: string,
  to: string,
  storeId?: string,
): Promise<SettlementPreview | null> {
  const qs = new URLSearchParams({ from, to });
  if (storeId) qs.set('storeId', storeId);
  const res = await fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, withAdminCredentials());
  const json = await res.json();
  if (!res.ok) return null;
  const data = json.data as Record<string, unknown> | undefined;
  if (!data) return null;
  return netPreviewToChannelPreview(
    data.channelPreview as Parameters<typeof netPreviewToChannelPreview>[0],
    from,
    to,
  );
}

async function fetchNetPreviewMergedSharedPromoBreakdown(
  apiBase: string,
  stored: WithdrawalBreakdown,
  from: string,
  to: string,
  storeId?: string,
): Promise<WithdrawalBreakdown> {
  const qs = new URLSearchParams({ from, to });
  if (storeId) qs.set('storeId', storeId);
  try {
    const res = await fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, withAdminCredentials());
    const json = await res.json();
    if (!res.ok) return stored;
    const preview = parseWithdrawalBreakdownFromNetPreview(json.data);
    if (!preview) return stored;
    return mergeSharedPromoContributionFieldsIntoBreakdown(stored, preview);
  } catch {
    return stored;
  }
}

export default function WalletWithdrawalModal({
  open,
  onClose,
  walletBalance,
  availableBalance,
  apiBase,
  onSubmitted,
  storeId,
  showGatewayFees = false,
  viewWithdrawal = null,
  viewPeriodOnly = false,
  viewPeriodDisplay = null,
}: Props) {
  const isViewMode = viewWithdrawal != null;
  const [portalReady, setPortalReady] = useState(false);
  const [resolvedViewWithdrawal, setResolvedViewWithdrawal] = useState<WithdrawalRow | null>(null);
  const [viewSnapshotLoading, setViewSnapshotLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [netLoading, setNetLoading] = useState(false);
  const [periodNet, setPeriodNet] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<WithdrawalBreakdown | null>(null);
  const [channelPreview, setChannelPreview] = useState<SettlementPreview | null>(null);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [periodOptions, setPeriodOptions] = useState<RollingPeriodOption[]>([]);
  const [tierPreview, setTierPreview] = useState<{
    totalSalesLkr: number;
    commissionRatePct: number;
    tierLabel: string;
    commissionAmountLkr: number;
    durationDays: number;
  } | null>(null);
  const [useCustomAmount, setUseCustomAmount] = useState(false);
  const [paybackEnabled, setPaybackEnabled] = useState(false);
  const [periodInfoLoading, setPeriodInfoLoading] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [gatewayRatePct, setGatewayRatePct] = useState(1.9);
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || submitting || pinGateOpen) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting, pinGateOpen]);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setDateFrom('');
      setDateTo('');
      setRemarks('');
      setSubmitting(false);
      setNetLoading(false);
      setPeriodNet(null);
      setBreakdown(null);
      setChannelPreview(null);
      setUseCustomAmount(false);
      setPaybackEnabled(false);
      setPeriodDays(null);
      setPeriodOptions([]);
      setTierPreview(null);
      setPeriodInfoLoading(false);
      setReviewed(false);
      setResolvedViewWithdrawal(null);
      setViewSnapshotLoading(false);
      setPinGateOpen(false);
    }
  }, [open]);

  const activeViewWithdrawal = resolvedViewWithdrawal ?? viewWithdrawal;

  const applyViewWithdrawalSnapshot = useCallback((row: WithdrawalRow) => {
    const parsed = parseWithdrawalBreakdown(row.breakdown);
    const from = toDateInputValue(row.periodFrom);
    const to = toDateInputValue(row.periodTo);

    if (from) setDateFrom(from);
    if (to) setDateTo(to);
    setRemarks(row.remarks?.trim() ?? '');
    setAmount((row.amount / 100).toFixed(2));
    setPaybackEnabled(paybackEnabledFromBreakdown(parsed));
    setUseCustomAmount(false);
    setReviewed(true);

    if (parsed) {
      setBreakdown(parsed);
      setPeriodNet(resolvePeriodNetLkrFromBreakdown(parsed));

      if (parsed.commissionRate != null && parsed.commissionRate > 0) {
        setTierPreview({
          totalSalesLkr: parsed.grossAmount / 100,
          commissionRatePct: Math.round(parsed.commissionRate * 1000) / 10,
          tierLabel: 'Locked at request',
          commissionAmountLkr: parsed.commissionFee / 100,
          durationDays: 0,
        });
      }

      if (parsed.channelBreakdown && from && to) {
        const breakdownLkr = withdrawalBreakdownToLkr(parsed);
        setChannelPreview(
          buildSettlementPreviewFromChannelBreakdown(parsed.channelBreakdown, {
            from,
            to,
            commissionRate: parsed.commissionRate,
            orderCount: parsed.orderCount,
            gatewayFeeLkr: breakdownLkr.gatewayFee,
          }),
        );
      } else {
        setChannelPreview(null);
      }
    } else {
      setBreakdown(null);
      setChannelPreview(null);
      setPeriodNet(null);
      setTierPreview(null);
    }
  }, []);

  useEffect(() => {
    if (!open || !isViewMode || !viewWithdrawal) return;

    applyViewWithdrawalSnapshot(viewWithdrawal);
    setResolvedViewWithdrawal(viewWithdrawal);

    const from = toDateInputValue(viewWithdrawal.periodFrom);
    const to = toDateInputValue(viewWithdrawal.periodTo);
    const parsed = parseWithdrawalBreakdown(viewWithdrawal.breakdown);
    const hasFullSnapshot = parsed != null && !!parsed.channelBreakdown;
    const snapshotLocked = isWithdrawalFinancialSnapshotLocked(viewWithdrawal.status);

    if (snapshotLocked) {
      let cancelled = false;
      setViewSnapshotLoading(false);
      const qs = viewWithdrawal.storeId
        ? `?storeId=${encodeURIComponent(viewWithdrawal.storeId)}`
        : '';

      fetch(
        `${apiBase}/admin/wallet/withdrawals/${encodeURIComponent(viewWithdrawal.id)}${qs}`,
        withAdminCredentials(),
      )
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok || cancelled) return;
          const fresh = json.data as WithdrawalRow | undefined;
          if (!fresh || fresh.id !== viewWithdrawal.id) return;
          setResolvedViewWithdrawal(fresh);
          applyViewWithdrawalSnapshot(fresh);
        })
        .catch(() => {
          // keep table-row snapshot
        });

      return () => {
        cancelled = true;
      };
    }

    if (viewPeriodOnly && hasFullSnapshot) {
      if (!from || !to || !parsed) {
        setViewSnapshotLoading(false);
        return;
      }

      let cancelled = false;
      setViewSnapshotLoading(false);
      void fetchNetPreviewMergedSharedPromoBreakdown(
        apiBase,
        parsed,
        from,
        to,
        viewWithdrawal.storeId ?? storeId,
      )
        .then((merged) => {
          if (!cancelled) setBreakdown(merged);
        })
        .finally(() => {
          if (!cancelled) setViewSnapshotLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    if (viewPeriodOnly) {
      if (!from || !to) {
        setViewSnapshotLoading(false);
        return;
      }

      let cancelled = false;
      setViewSnapshotLoading(parsed == null);
      const qs = new URLSearchParams({ from, to });
      const resolvedStoreId = viewWithdrawal.storeId ?? storeId;
      if (resolvedStoreId) qs.set('storeId', resolvedStoreId);

      fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, withAdminCredentials())
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok || cancelled) return;
          const data = json.data as Record<string, unknown> | undefined;
          if (!data) return;
          if (typeof data.gatewayRatePct === 'number') setGatewayRatePct(data.gatewayRatePct);
          setPaybackEnabled(Boolean(data.platformDiscountPaybackEnabled));
          if (typeof data.grossAmount === 'number') {
            const previewBreakdown = parseWithdrawalBreakdownFromNetPreview(data);
            const storedParsed = parseWithdrawalBreakdown(viewWithdrawal.breakdown);
            if (storedParsed?.grossAmount != null && previewBreakdown) {
              setBreakdown(
                mergeLivePayoutPreviewIntoStoredBreakdown(storedParsed, previewBreakdown),
              );
              setPeriodNet(resolvePeriodNetLkrFromBreakdown(storedParsed));
            } else {
              setBreakdown(previewBreakdown);
              setPeriodNet(
                typeof data.netAmountLkr === 'number'
                  ? data.netAmountLkr
                  : resolvePeriodNetLkrFromBreakdown(previewBreakdown),
              );
            }
          }
          if (typeof data.totalSalesLkr === 'number') {
            setTierPreview({
              totalSalesLkr: data.totalSalesLkr,
              commissionRatePct: typeof data.commissionRatePct === 'number' ? data.commissionRatePct : 0,
              tierLabel: typeof data.tierLabel === 'string' ? data.tierLabel : '',
              commissionAmountLkr:
                typeof data.commissionAmountLkr === 'number' ? data.commissionAmountLkr : 0,
              durationDays: typeof data.durationDays === 'number' ? data.durationDays : 0,
            });
          }
          setChannelPreview(
            netPreviewToChannelPreview(
              data.channelPreview as Parameters<typeof netPreviewToChannelPreview>[0],
              from,
              to,
            ),
          );
        })
        .catch(() => {
          // keep table-row snapshot
        })
        .finally(() => {
          if (!cancelled) setViewSnapshotLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setViewSnapshotLoading(!hasFullSnapshot);
    const qs = viewWithdrawal.storeId
      ? `?storeId=${encodeURIComponent(viewWithdrawal.storeId)}`
      : '';

    fetch(
      `${apiBase}/admin/wallet/withdrawals/${encodeURIComponent(viewWithdrawal.id)}${qs}`,
      withAdminCredentials(),
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const fresh = json.data as WithdrawalRow | undefined;
        if (!fresh || fresh.id !== viewWithdrawal.id) return;
        setResolvedViewWithdrawal(fresh);
        applyViewWithdrawalSnapshot(fresh);
        const parsedFresh = parseWithdrawalBreakdown(fresh.breakdown);
        const periodFrom = toDateInputValue(fresh.periodFrom);
        const periodTo = toDateInputValue(fresh.periodTo);
        if (parsedFresh && periodFrom && periodTo) {
          const needsChannelPreview = !parsedFresh.channelBreakdown;
          const [merged, preview] = await Promise.all([
            fetchNetPreviewMergedSharedPromoBreakdown(
              apiBase,
              parsedFresh,
              periodFrom,
              periodTo,
              fresh.storeId ?? storeId,
            ),
            needsChannelPreview
              ? fetchChannelPreviewFromNetPreview(
                  apiBase,
                  periodFrom,
                  periodTo,
                  fresh.storeId ?? storeId,
                )
              : Promise.resolve(null),
          ]);
          if (!cancelled) setBreakdown(merged);
          if (!cancelled && preview) setChannelPreview(preview);
        }
      })
      .catch(async () => {
        const periodFrom = toDateInputValue(viewWithdrawal.periodFrom);
        const periodTo = toDateInputValue(viewWithdrawal.periodTo);
        const parsed = parseWithdrawalBreakdown(viewWithdrawal.breakdown);
        if (parsed?.channelBreakdown || !periodFrom || !periodTo || cancelled) return;
        const preview = await fetchChannelPreviewFromNetPreview(
          apiBase,
          periodFrom,
          periodTo,
          viewWithdrawal.storeId ?? storeId,
        );
        if (!cancelled && preview) setChannelPreview(preview);
      })
      .finally(() => {
        if (!cancelled) setViewSnapshotLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, isViewMode, viewWithdrawal, viewPeriodOnly, apiBase, storeId, applyViewWithdrawalSnapshot]);

  useEffect(() => {
    if (!open || isViewMode) return;

    let cancelled = false;
    setPeriodInfoLoading(true);

    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
    fetch(`${apiBase}/admin/wallet/payout-period-info${qs}`, withAdminCredentials())
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load payout period');
        if (cancelled) return;

        const nextStart = json.data?.nextStartDate as string | null | undefined;
        const options = (json.data?.options ?? []) as Array<{
          days: number;
          from: string;
          to: string;
          capped?: boolean;
        }>;
        const mapped: RollingPeriodOption[] = options.map((opt) => ({
          days: opt.days as RollingPeriodOption['days'],
          from: opt.from,
          to: opt.to,
          capped: !!opt.capped,
          label: rollingPeriodLabel(opt.from, opt.to, opt.days, !!opt.capped),
        }));
        setPeriodOptions(mapped);
        if (mapped.length > 0) {
          const first = mapped[0];
          setPeriodDays(first.days);
          setDateFrom(first.from);
          setDateTo(first.to);
        } else if (nextStart) {
          setDateFrom(nextStart);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Could not load payout period');
        }
      })
      .finally(() => {
        if (!cancelled) setPeriodInfoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, isViewMode, apiBase, storeId]);

  useEffect(() => {
    if (!open || isViewMode) return;

    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }

    if (!open || periodDays == null || !isValidRange(dateFrom, dateTo)) {
      setPeriodNet(null);
      setBreakdown(null);
      setChannelPreview(null);
      setTierPreview(null);
      setAmount('');
      return;
    }

    previewTimer.current = setTimeout(async () => {
      setNetLoading(true);
      try {
        const qs = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
          periodDays: String(periodDays),
        });
        if (storeId) qs.set('storeId', storeId);

        const res = await fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, withAdminCredentials());
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to calculate net amount');

        const netLkr = json.data?.netAmountLkr ?? 0;
        setPeriodNet(netLkr);
        if (typeof json.data?.gatewayRatePct === 'number') {
          setGatewayRatePct(json.data.gatewayRatePct);
        }
        setPaybackEnabled(Boolean(json.data?.platformDiscountPaybackEnabled));
        setTierPreview({
          totalSalesLkr: json.data?.totalSalesLkr ?? 0,
          commissionRatePct: json.data?.commissionRatePct ?? 0,
          tierLabel: json.data?.tierLabel ?? '',
          commissionAmountLkr: json.data?.commissionAmountLkr ?? 0,
          durationDays: json.data?.durationDays ?? 0,
        });
        if (!useCustomAmount) {
          setAmount(formatDefaultAmount(netLkr, availableBalance / 100));
        }
        if (json.data && typeof json.data.grossAmount === 'number') {
          setBreakdown(parseWithdrawalBreakdownFromNetPreview(json.data));
        } else {
          setBreakdown(null);
        }

        setChannelPreview(netPreviewToChannelPreview(json.data?.channelPreview, dateFrom, dateTo));
      } catch (err) {
        setPeriodNet(null);
        setBreakdown(null);
        setChannelPreview(null);
        setTierPreview(null);
        setPaybackEnabled(false);
        setAmount('');
        toast.error(err instanceof Error ? err.message : 'Could not calculate net amount');
      } finally {
        setNetLoading(false);
      }
    }, 400);

    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [open, isViewMode, dateFrom, dateTo, periodDays, apiBase, storeId, useCustomAmount, availableBalance]);

  if (!portalReady || !open) return null;

  const availableLkr = centsToLkr(availableBalance);
  const breakdownLkr = breakdown ? withdrawalBreakdownToLkr(breakdown) : null;
  const onlineOrderSubtotalLkr = channelPreview ? sumAllRevenueSubtotal(channelPreview) : null;
  const convenienceFeeLkr =
    breakdownLkr?.convenienceFee ?? resolvePreviewConvenienceFeeLkr(channelPreview);
  const deliveryFeeLkr = breakdownLkr?.deliveryFee ?? 0;
  const deliveryFeeForPeriodLkr = resolveTotalDeliveryFeeForAllocationLkr({
    periodDeliveryFeeLkr: resolvePeriodDeliveryFeeLkr({
      channelBreakdown: channelPreview?.breakdown,
      periodDeliveryFeeLkr: deliveryFeeLkr,
    }),
    refundDeliveryFeeLkr: breakdownLkr?.refundDeliveryFee ?? 0,
    rejectedRefundDeliveryFeeLkr: breakdownLkr?.rejectedRefundDeliveryFee ?? 0,
  });
  const payoutSplit = breakdownLkr
    ? computePeriodPayoutSplitLkr({
        netAmount: breakdownLkr.netAmount,
        deliveryFee: deliveryFeeForPeriodLkr,
        commissionFee: breakdownLkr.commissionFee,
        convenienceFee: breakdownLkr.convenienceFee,
      })
    : null;
  const branchCommissionLkr =
    channelPreview?.totalCommission ?? breakdownLkr?.commissionFee ?? 0;
  const platformCommissionLkr =
    breakdownLkr?.cycleStage === 'FIRST'
      ? 0
      : resolvePlatformCommissionForPeriodLkr({
          commissionLkr: branchCommissionLkr,
          periodBreakdownLkr: breakdownLkr,
          paybackEnabled,
          sharedPromoPlatformLkr: breakdownLkr?.sharedPromoPlatformContributionLkr ?? 0,
        });
  const periodNetLkr =
    (breakdown ? resolvePeriodNetLkrFromBreakdown(breakdown) : null) ??
    periodNet;
  const cappedPeriodNetLkr = cappedPeriodPayoutLkr(periodNetLkr, availableLkr);
  const maxAmountLkr =
    cappedPeriodNetLkr ?? (periodNetLkr != null ? Math.min(availableLkr, periodNetLkr) : availableLkr);
  const parsed = parseFloat(amount);
  const effectiveMax = useCustomAmount ? availableLkr : maxAmountLkr;
  const validAmount =
    !Number.isNaN(parsed) && parsed > 0 && parsed <= effectiveMax + 0.001;
  const advanceAmountLkr =
    useCustomAmount && periodNetLkr !== null && parsed > periodNetLkr + 0.001
      ? Math.round((parsed - periodNetLkr) * 100) / 100
      : 0;
  const showAdvance = advanceAmountLkr > 0;
  const isAdvance = showAdvance;
  const rangeReady = isValidRange(dateFrom, dateTo);
  const viewCycleBreakdown =
    breakdown ?? parseWithdrawalBreakdown(activeViewWithdrawal?.breakdown);
  const viewCycleRange =
    isViewMode && !viewPeriodDisplay && dateFrom && dateTo
      ? resolvePayoutCycleDisplayRange({
          cycleStage: viewCycleBreakdown?.cycleStage ?? activeViewWithdrawal?.cycleStage ?? null,
          cycleFrom: viewCycleBreakdown?.cycleFrom ?? null,
          periodFrom: dateFrom,
          periodTo: dateTo,
        })
      : null;
  const displayDateFrom = viewPeriodDisplay?.from ?? viewCycleRange?.displayFrom ?? dateFrom;
  const displayDateTo = viewPeriodDisplay?.to ?? viewCycleRange?.displayTo ?? dateTo;
  const displayPeriodDays = viewPeriodDisplay?.days ?? viewCycleRange?.displayDays ?? periodDays;
  const displayRangeReady = isValidRange(displayDateFrom, displayDateTo);
  const breakdownPanelRangeReady = isViewMode ? displayRangeReady : rangeReady;
  let periodPillLabel: string | null = null;
  if (isViewMode) {
    if (displayRangeReady) {
      const range = formatBiweeklyPeriodLabel(displayDateFrom, displayDateTo);
      periodPillLabel = displayPeriodDays != null ? `${range} · ${displayPeriodDays} days` : range;
    }
  } else if (rangeReady) {
    const range = formatBiweeklyPeriodLabel(dateFrom, dateTo);
    periodPillLabel = periodDays != null ? `${range} · ${periodDays} days` : range;
  }
  const periodInFuture = !!dateTo && dateTo > todayDateStr();
  const periodIncompleteState = resolvePayoutPeriodIncompleteState({
    periodFrom: displayDateFrom,
    periodTo: displayDateTo,
    days: displayPeriodDays ?? periodDays,
  });
  const periodIncomplete = periodIncompleteState.incomplete;
  const periodCompleteEndDate = periodIncompleteState.completeEndDate;
  const slabRatePct = resolveSlabRatePctFromPreview(channelPreview);
  const periodLabel =
    displayDateFrom && displayDateTo ? `${displayDateFrom} → ${displayDateTo}` : null;
  const withdrawalAmountCents =
    isViewMode && activeViewWithdrawal
      ? activeViewWithdrawal.amount
      : Math.round((parsed || 0) * 100);
  const sharedPromo = extractSharedPromoLkrFromBreakdown(breakdown, withdrawalAmountCents);
  const periodNetForCap =
    breakdown != null
      ? resolvePeriodNetLkrFromBreakdown(breakdown)
      : breakdownLkr?.netAmount ?? 0;
  const periodFinalPayout = resolveBranchPayoutDisplay({
    breakdown,
    amountCents: withdrawalAmountCents,
    scope: 'fullPeriod',
  });
  const requestedWalletLkr = withdrawalAmountCents / 100;
  const payableWalletLkr =
    isViewMode && activeViewWithdrawal && !viewPeriodOnly
      ? resolvePayableWalletLkrForPayout({
          requestedWalletLkr,
          availableWalletLkr: availableLkr,
          periodNetLkr: periodNetForCap,
        })
      : parsed > 0
        ? resolvePayableWalletLkrForPayout({
            requestedWalletLkr: parsed,
            availableWalletLkr: availableLkr,
            periodNetLkr: periodNetForCap,
          })
        : null;
  const useFullPeriodBranchPayoutDisplay =
    isViewMode &&
    (viewPeriodOnly ||
      (activeViewWithdrawal != null &&
        isWithdrawalFinancialSnapshotLocked(activeViewWithdrawal.status)));
  const branchPayout = resolveBranchPayoutDisplay({
    breakdown,
    amountCents: withdrawalAmountCents,
    ...(useFullPeriodBranchPayoutDisplay
      ? { scope: 'fullPeriod' as const }
      : payableWalletLkr != null && payableWalletLkr > 0
        ? { scope: 'thisPayment' as const, paymentWalletRequestLkr: payableWalletLkr }
        : {}),
  });
  const branchReceiveDifference =
    isViewMode && activeViewWithdrawal && !viewPeriodOnly && payableWalletLkr != null
      ? {
          periodFinalPayLkr: periodFinalPayout.totalBranchPayoutLkr,
          requestedWalletLkr,
          availableWalletLkr: availableLkr,
          periodNetLkr: periodNetForCap,
          payableWalletLkr,
        }
      : null;
  const submitTotalLkr = branchPayout.totalBranchPayoutLkr;
  const channelTableBreakdown =
    channelPreview?.breakdown ?? breakdown?.channelBreakdown ?? null;
  const showChannelSalesTable =
    !netLoading &&
    (!viewSnapshotLoading || channelTableBreakdown != null) &&
    rangeReady &&
    channelTableBreakdown != null &&
    channelBreakdownHasSalesActivity(channelTableBreakdown);
  const showBreakdownLoadingPlaceholder =
    (netLoading || viewSnapshotLoading) && !breakdownLkr;

  const firstPayoutGatewayBaseLkr =
    breakdown && breakdownLkr?.cycleStage === 'FIRST'
      ? resolveFirstPayoutGatewayBaseLkr(breakdown)
      : null;
  const firstPayoutBranchWalletNetLkr =
    breakdown && breakdownLkr?.cycleStage === 'FIRST'
      ? resolveFirstPayoutBranchWalletNetLkr(breakdown)
      : null;
  const payoutBreakdownPanelProps = breakdownLkr
    ? {
        preview: isViewMode ? null : channelPreview,
        channelBreakdown: channelTableBreakdown,
        periodBreakdownLkr: breakdownLkr,
        onlineOrderSubtotalLkr,
        convenienceFeeLkr,
        deliveryFeeLkr: deliveryFeeForPeriodLkr,
        slabRatePct,
        periodLabel,
        paybackEnabled,
        gatewayRatePct,
        useStoredSnapshot: isViewMode,
        snapshotGatewayFeeLkr:
          isViewMode && breakdownLkr.cycleStage === 'FIRST'
            ? null
            : isViewMode
              ? breakdownLkr.gatewayFee
              : null,
        snapshotGatewayRatePct: isViewMode ? breakdownLkr.gatewayRatePct ?? gatewayRatePct : null,
        snapshotOnlineWalletGrossLkr:
          isViewMode && firstPayoutGatewayBaseLkr != null
            ? firstPayoutGatewayBaseLkr
            : isViewMode
              ? breakdownLkr.onlineWalletGross
              : null,
        snapshotNetAmountLkr:
          isViewMode && breakdownLkr.cycleStage === 'FIRST'
            ? firstPayoutBranchWalletNetLkr
            : isViewMode && breakdown
              ? resolvePeriodNetLkrFromBreakdown(breakdown)
              : null,
        sharedPromo,
        loyaltyDiscountLkr: breakdownLkr.periodLoyaltyDiscountTotal ?? 0,
        payoutSplit,
        branchReceivesLkr: branchPayout.totalBranchPayoutLkr,
        platformCommissionLkr,
        periodNetLkr: branchPayout.periodWalletNetLkr,
        dateFrom: displayDateFrom,
        dateTo: displayDateTo,
        showAdvance,
        advanceAmountLkr,
        branchPayout,
        branchReceiveDifference,
      }
    : null;
  const canSubmit =
    validAmount &&
    rangeReady &&
    periodDays != null &&
    !submitting &&
    !netLoading &&
    !periodInfoLoading &&
    !periodInFuture &&
    !periodIncomplete;

  const selectPeriod = (option: RollingPeriodOption) => {
    setPeriodDays(option.days);
    setDateFrom(option.from);
    setDateTo(option.to);
  };

  const closePinGate = () => {
    if (submitting) return;
    setPinGateOpen(false);
  };

  const submitWithdrawal = async (verifiedPin: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${apiBase}/admin/wallet/withdrawals`,
        withAdminCredentials({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parsed,
            periodDays,
            from: dateFrom,
            to: dateTo,
            remarks: remarks.trim() || undefined,
            isAdvance,
            password: verifiedPin,
          }),
        }),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Request failed');

      toast.success('Withdrawal request submitted');
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinVerified = async (verifiedPin: string) => {
    const confirmed = await confirmDialog({
      title: 'Request payout?',
      message: isAdvance
        ? `Submit advance payout request for ${formatMoney(parsed)} (${dateFrom} to ${dateTo})?`
        : `Submit payout request for ${dateFrom} to ${dateTo}?`,
      confirmLabel: 'Submit',
      cancelLabel: 'Cancel',
      variant: 'default',
    });

    if (!confirmed) return;
    await submitWithdrawal(verifiedPin);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validAmount) {
      toast.error(
        useCustomAmount
          ? 'Enter a valid amount within your available balance'
          : 'Enter a valid amount within the net amount for this period',
      );
      return;
    }
    if (!rangeReady) {
      toast.error('Select a valid payout period');
      return;
    }
    if (periodIncomplete) {
      toast.error(
        periodCompleteEndDate
          ? `The full ${periodDays}-day period is not complete yet. You can request after ${periodCompleteEndDate}.`
          : 'The selected payout period is not complete yet.',
      );
      return;
    }

    setPinGateOpen(true);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1200] bg-black/55 backdrop-blur-sm"
        onClick={() => !submitting && !pinGateOpen && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-label={isViewMode ? 'Payout request details' : 'Request payout'}
        className="fixed inset-0 z-[1201] flex items-center justify-center p-4 sm:p-6"
        onClick={() => !submitting && !pinGateOpen && onClose()}
      >
        <div
          className="flex max-h-[min(95vh,960px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-[#e2e8f0] dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
            <div>
              <h2 className="text-[28px] font-bold text-[#1e293b] dark:text-slate-100">
                {isViewMode ? 'Payout Request Details' : 'Request Payout'}
              </h2>
              {isViewMode && activeViewWithdrawal ? (
                <p className="mt-1 text-[15px] font-medium text-[#64748b] dark:text-slate-400">
                  Status:{' '}
                  <span className="font-bold text-[#2563eb]">
                    {viewPeriodOnly && activeViewWithdrawal.status === 'PENDING'
                      ? 'Pending'
                      : withdrawalStatusLabel(activeViewWithdrawal.status)}
                  </span>
                  {activeViewWithdrawal.rejectionReason?.trim() ? (
                    <>
                      {' '}
                      · Reason: {activeViewWithdrawal.rejectionReason.trim()}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-[15px] font-medium text-[#64748b] dark:text-slate-400">
                  Available to withdraw:{' '}
                  <span className="font-bold text-[#2563eb]">
                    LKR {formatMoneyAmount(availableLkr)}
                  </span>
                </p>
              )}
              {periodPillLabel && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] font-medium text-[#475569] dark:text-slate-300">
                  <div className="flex items-center gap-2 rounded-full border border-[#cbd5e1] dark:border-slate-600 bg-[#f8fafc] dark:bg-slate-800 px-3 py-1.5">
                    <CalendarRange size={16} className="text-[#3b82f6]" />
                    <span>{periodPillLabel}</span>
                  </div>
                  {tierPreview && (
                    <div className="flex items-center gap-2 rounded-full border border-[#cbd5e1] dark:border-slate-600 bg-[#f8fafc] dark:bg-slate-800 px-3 py-1.5">
                      <Settings size={16} className="text-[#3b82f6]" />
                      <span>
                        Commission tier {tierPreview.commissionRatePct}% · {tierPreview.tierLabel}
                      </span>
                    </div>
                  )}
                  {netLoading && !isViewMode && (
                    <Loader2 size={14} className="animate-spin text-[#3b82f6]" />
                  )}
                  {isViewMode && viewSnapshotLoading && (
                    <Loader2 size={14} className="animate-spin text-[#3b82f6]" />
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg p-2 text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-slate-800 hover:text-[#1e293b] dark:hover:text-slate-100 disabled:opacity-50"
              aria-label="Close"
            >
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col bg-[#f8fafc] dark:bg-slate-800/50">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {!isViewMode && (
              <div className="mb-4">
                <p className="mb-3 text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
                  Payout period
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {periodOptions.map((option) => {
                    const selected = periodDays === option.days;
                    return (
                      <button
                        key={option.days}
                        type="button"
                        disabled={submitting || periodInfoLoading}
                        onClick={() => selectPeriod(option)}
                        className={`relative flex flex-col justify-center rounded-lg border p-4 text-left transition ${selected
                            ? 'border-[#3b82f6] dark:border-blue-500 bg-[#eff6ff] dark:bg-blue-900/30'
                            : 'border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#cbd5e1] dark:hover:border-slate-600'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <CalendarRange size={20} className={selected ? 'text-[#3b82f6]' : 'text-[#64748b] dark:text-slate-400'} />
                          <div>
                            <p className="text-[15px] font-bold text-[#1e293b] dark:text-slate-100">
                              {option.days} Days
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-[#64748b] dark:text-slate-400">
                              {formatBiweeklyPeriodLabel(option.from, option.to)}
                            </p>
                          </div>
                        </div>
                        {selected && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-[#3b82f6] text-white">
                            <Check size={14} strokeWidth={3} />
                          </div>
                        )}
                        {option.capped && (
                          <p className="mt-2 text-[11px] font-medium text-amber-500">Capped at today</p>
                        )}
                      </button>
                    );
                  })}
                </div>
                {periodIncomplete && periodCompleteEndDate && (
                  <p className="mt-2 text-[13px] font-medium text-amber-500">
                    The full {periodDays}-day period is not complete yet. You can request after{' '}
                    {periodCompleteEndDate}.
                  </p>
                )}
                {periodInFuture && !periodIncomplete && (
                  <p className="mt-2 text-[13px] font-medium text-amber-500">Available after {dateTo}.</p>
                )}
              </div>
              )}

              {showBreakdownLoadingPlaceholder && (
                <div className="mb-6 flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-muted)]">
                  <Loader2 size={20} className="animate-spin" />
                  Calculating breakdown…
                </div>
              )}

              {showChannelSalesTable && channelTableBreakdown && (
                <ChannelSalesTable breakdown={channelTableBreakdown} className="mb-4" />
              )}

              {payoutBreakdownPanelProps &&
                (isViewMode ? breakdownPanelRangeReady : rangeReady) && (
                  <PayoutBreakdownPanel {...payoutBreakdownPanelProps} className="mb-4" />
                )}

              <div className="mb-2">
                <div className="rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm flex flex-col">
                  <label className="mb-2 block text-[13px] font-bold text-[#1e293b] dark:text-slate-100">
                    Remarks (optional)
                  </label>
                  <div className="relative flex-1">
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      maxLength={250}
                      disabled={submitting || isViewMode}
                      readOnly={isViewMode}
                      className="block w-full h-full min-h-[50px] resize-none border-0 bg-transparent p-0 text-[14px] text-[#1e293b] dark:text-slate-100 placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 focus:ring-0 disabled:opacity-50"
                      placeholder="Add a note about this payout"
                    />
                    <div className="absolute bottom-0 right-0 text-[11px] font-medium text-[#94a3b8] dark:text-slate-500">
                      {remarks.length} / 250
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isViewMode ? (
              <div className="flex items-center justify-end border-t border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-2.5 text-[14px] font-bold text-[#1e293b] dark:text-slate-100 hover:bg-[#f8fafc] dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            ) : (
            <div className="flex items-center justify-between border-t border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="h-5 w-5 rounded border-[#cbd5e1] dark:border-slate-600 text-[#2563eb] focus:ring-[#2563eb] checked:bg-[#2563eb]"
                />
                <span className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">I have reviewed the payout calculation.</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-2.5 text-[14px] font-bold text-[#1e293b] dark:text-slate-100 hover:bg-[#f8fafc] dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || !reviewed}
                  className="rounded-lg bg-[#2563eb] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Submitting…
                    </span>
                  ) : (
                    `Request LKR ${formatMoneyAmount(submitTotalLkr)}`
                  )}
                </button>
              </div>
            </div>
            )}
          </form>
        </div>
      </div>

      <AdminPinGateModal
        open={pinGateOpen}
        onClose={closePinGate}
        onVerified={handlePinVerified}
        apiBase={apiBase}
        busy={submitting}
        titleId="wallet-payout-pin-title"
        inputId="wallet-payout-pin"
        description="Enter your admin password to verify your identity before requesting this payout."
      />
    </>,
    document.body,
  );
}
