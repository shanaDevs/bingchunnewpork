'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CalendarRange,
  Image as ImageIcon,
  Loader2,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import ChannelSalesTable from '@/components/admin/ChannelSalesTable';
import { resolveBranchPayoutDisplay } from '@/components/admin/branchPayoutDisplay';
import PayoutBreakdownPanel from '@/components/admin/PayoutBreakdownPanel';
import {
  channelBreakdownHasSalesActivity,
  computeFinalPayoutLkr,
  computePeriodPayoutSplitLkr,
  extractSharedPromoLkrFromBreakdown,
  hasPositiveLkr,
  parseWithdrawalBreakdownFromNetPreview,
  resolvePeriodDeliveryFeeLkr,
  resolvePlatformCommissionForPeriodLkr,
  resolvePeriodNetLkrFromBreakdown,
  resolvePreviewConvenienceFeeLkr,
  SETTLEMENT_PAYMENT_METHOD_OPTIONS,
  sumAllRevenueSubtotal,
  withdrawalBreakdownToLkr,
  type SettlementPreview,
  type WithdrawalBreakdown,
} from '@/components/admin/settlementTypes';
import { openWithdrawalInvoice } from '@/lib/adminProtectedFile';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { centsToLkr } from '@/lib/walletUtils';
import {
  addDaysToDateStr,
  formatBiweeklyPeriodLabel,
  isValidPayoutRange,
  PAYOUT_PERIOD_PRESETS,
  rollingPeriodLabel,
  todayDateStr,
  type PayoutPeriodPreset,
  type RollingPeriodOption,
} from '@/lib/biweeklyPeriods';
import { confirmDialog } from '@/store/confirmStore';
import type { BranchPayoutCompletedMeta } from '@/lib/branchPayoutsDue';

type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CHECK' | '';

type Props = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  branchName: string;
  walletBalance: number;
  availableBalance: number;
  apiBase: string;
  onCompleted: (meta: BranchPayoutCompletedMeta) => void;
  /** When opening from Payouts Due, lock the modal to that period instead of the oldest pending one. */
  presetPeriodFrom?: string | null;
  presetPeriodTo?: string | null;
  presetPeriodDays?: number | null;
};

function normalizePresetDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ymd = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

function resolveInitialPayoutPeriod(
  options: RollingPeriodOption[],
  presetFrom?: string | null,
  presetTo?: string | null,
  presetDays?: number | null,
): { from: string; to: string; days: PayoutPeriodPreset } | null {
  const from = normalizePresetDate(presetFrom);
  const to = normalizePresetDate(presetTo);
  // Payouts Due rows may reference older elapsed windows not present in payout-period-info options.
  if (from && to && from <= to) {
    const matched = options.find((opt) => opt.from === from && opt.to === to);
    if (matched) {
      return { from: matched.from, to: matched.to, days: matched.days };
    }
    const daysRaw = presetDays ?? 15;
    const days = PAYOUT_PERIOD_PRESETS.includes(daysRaw as PayoutPeriodPreset)
      ? (daysRaw as PayoutPeriodPreset)
      : 15;
    return { from, to, days };
  }
  if (options.length === 0) return null;
  const locked = options.find((opt) => opt.days === 15) ?? options[0];
  return { from: locked.from, to: locked.to, days: locked.days };
}

function isValidRange(from: string, to: string): boolean {
  return isValidPayoutRange(from, to);
}

function cappedPeriodPayoutLkr(periodNetLkr: number | null, availableLkr: number): number | null {
  if (periodNetLkr == null || periodNetLkr <= 0) return null;
  return Math.min(periodNetLkr, availableLkr);
}

function formatDefaultAmount(periodNetLkr: number | null, availableLkr: number): string {
  const capped = cappedPeriodPayoutLkr(periodNetLkr, availableLkr);
  return capped != null && capped > 0 ? capped.toFixed(2) : '';
}

const INITIATE_PAYOUT_METHODS = SETTLEMENT_PAYMENT_METHOD_OPTIONS.filter(
  (option) => option.value !== 'ONLINE',
);

export default function AdminInitiatePayoutModal({
  open,
  onClose,
  storeId,
  branchName,
  walletBalance,
  availableBalance,
  apiBase,
  onCompleted,
  presetPeriodFrom = null,
  presetPeriodTo = null,
  presetPeriodDays = null,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [amount, setAmount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [periodInfoLoading, setPeriodInfoLoading] = useState(false);
  const [periodNet, setPeriodNet] = useState<WithdrawalBreakdown | null>(null);
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [gatewayRatePct, setGatewayRatePct] = useState(1.9);
  const [paybackEnabled, setPaybackEnabled] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  const duePeriodLocked = useMemo(() => {
    const from = normalizePresetDate(presetPeriodFrom);
    const to = normalizePresetDate(presetPeriodTo);
    return from != null && to != null && from <= to;
  }, [presetPeriodFrom, presetPeriodTo]);

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
      setPreviewLoading(false);
      setPeriodInfoLoading(false);
      setPeriodNet(null);
      setChannelPreview(null);
      setPeriodDays(null);
      setPeriodOptions([]);
      setTierPreview(null);
      setPaymentMethod('');
      setCheckNumber('');
      setCheckDate('');
      setProofFile(null);
      setError('');
      setGatewayRatePct(1.9);
      setPaybackEnabled(false);
      setReviewed(false);
      setPinGateOpen(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const from = normalizePresetDate(presetPeriodFrom);
    const to = normalizePresetDate(presetPeriodTo);
    if (!from || !to || from > to) return;
    const daysRaw = presetPeriodDays ?? 15;
    const days = PAYOUT_PERIOD_PRESETS.includes(daysRaw as PayoutPeriodPreset)
      ? (daysRaw as PayoutPeriodPreset)
      : 15;
    setDateFrom(from);
    setDateTo(to);
    setPeriodDays(days);
  }, [open, presetPeriodFrom, presetPeriodTo, presetPeriodDays]);

  useEffect(() => {
    if (!open || !storeId) return;

    let cancelled = false;
    setPeriodInfoLoading(true);

    fetch(`${apiBase}/admin/wallet/payout-period-info?storeId=${encodeURIComponent(storeId)}`, {
      headers: adminAuthHeaders(), credentials: 'include',
    })
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
        if (!duePeriodLocked) {
          const initial = resolveInitialPayoutPeriod(
            mapped,
            presetPeriodFrom,
            presetPeriodTo,
            presetPeriodDays,
          );
          if (initial) {
            setPeriodDays(initial.days);
            setDateFrom(initial.from);
            setDateTo(initial.to);
          } else if (nextStart) {
            setDateFrom(nextStart);
          }
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
  }, [open, apiBase, storeId, presetPeriodFrom, presetPeriodTo, presetPeriodDays, duePeriodLocked]);

  useEffect(() => {
    if (!open) return;

    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }

    if (periodDays == null || !isValidRange(dateFrom, dateTo)) {
      setPeriodNet(null);
      setChannelPreview(null);
      setTierPreview(null);
      setAmount('');
      return;
    }

    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
          storeId,
        });
        if (!duePeriodLocked) {
          qs.set('periodDays', String(periodDays));
        }

        const res = await fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, {
          headers: adminAuthHeaders(), credentials: 'include',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to calculate net amount');

        const netLkr = json.data?.netAmountLkr ?? 0;
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
        setAmount(formatDefaultAmount(netLkr, availableBalance / 100));

        if (json.data && typeof json.data.grossAmount === 'number') {
          setPeriodNet(parseWithdrawalBreakdownFromNetPreview(json.data));
        } else {
          setPeriodNet(null);
        }

        const preview = json.data?.channelPreview;
        if (preview?.breakdown) {
          setChannelPreview({
            period: preview.period ?? { from: dateFrom, to: dateTo },
            breakdown: preview.breakdown,
            totalCommission: preview.totalCommission ?? 0,
            totalProviderFee: preview.totalProviderFee ?? 0,
            totalOwed: preview.totalCommission ?? 0,
            orderCount: preview.orderCount ?? 0,
            slabInfo: preview.slabInfo ?? {
              monthlyBase: 0,
              effectiveRate: 0,
              slabIndex: 0,
              slabs: [],
            },
          });
        } else {
          setChannelPreview(null);
        }
      } catch (err) {
        setPeriodNet(null);
        setChannelPreview(null);
        setTierPreview(null);
        setPaybackEnabled(false);
        setAmount('');
        setError(err instanceof Error ? err.message : 'Could not calculate net amount');
        toast.error(err instanceof Error ? err.message : 'Could not calculate net amount');
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [open, dateFrom, dateTo, periodDays, apiBase, storeId, availableBalance, duePeriodLocked]);

  if (!portalReady || !open) return null;

  const availableLkr = centsToLkr(availableBalance);
  const periodBreakdownLkr = periodNet ? withdrawalBreakdownToLkr(periodNet) : null;
  const periodNetLkr =
    (periodNet ? resolvePeriodNetLkrFromBreakdown(periodNet) : null) ??
    (periodNet ? periodNet.netAmount / 100 : null);
  const cappedPeriodNetLkr = cappedPeriodPayoutLkr(periodNetLkr, availableLkr);
  const maxAmountLkr =
    cappedPeriodNetLkr ?? (periodNetLkr != null ? Math.min(availableLkr, periodNetLkr) : availableLkr);
  const parsed = parseFloat(amount);
  const validAmount =
    !Number.isNaN(parsed) && parsed > 0 && parsed <= maxAmountLkr + 0.001;
  const rangeReady = isValidRange(dateFrom, dateTo);
  const periodInFuture = !!dateTo && dateTo > todayDateStr();
  const selectedPeriodOption =
    periodDays != null ? periodOptions.find((opt) => opt.days === periodDays) ?? null : null;
  const periodIncomplete = selectedPeriodOption?.capped ?? false;
  const periodCompleteEndDate =
    selectedPeriodOption && periodIncomplete
      ? addDaysToDateStr(selectedPeriodOption.from, selectedPeriodOption.days - 1)
      : null;
  const sharedPromo = extractSharedPromoLkrFromBreakdown(
    periodNet,
    Math.round((parsed || 0) * 100),
  );
  const branchPayout = resolveBranchPayoutDisplay({
    breakdown: periodNet,
    amountCents: Math.round((parsed || 0) * 100),
    scope: 'thisPayment',
    paymentWalletRequestLkr: parsed > 0 ? parsed : null,
  });
  const payTotalLkr = branchPayout.totalBranchPayoutLkr;
  const showJasonTopUp = hasPositiveLkr(sharedPromo.jasonContributionLkr);
  const showPlatformContributionBanner = hasPositiveLkr(sharedPromo.platformContributionLkr);
  const onlineOrderSubtotalLkr = channelPreview ? sumAllRevenueSubtotal(channelPreview) : null;
  const convenienceFeeLkr =
    periodBreakdownLkr?.convenienceFee ?? resolvePreviewConvenienceFeeLkr(channelPreview);
  const deliveryFeeLkr = periodBreakdownLkr?.deliveryFee ?? 0;
  const deliveryFeeForPeriodLkr = resolvePeriodDeliveryFeeLkr({
    channelBreakdown: channelPreview?.breakdown,
    periodDeliveryFeeLkr: deliveryFeeLkr,
  });
  const slabRatePct =
    channelPreview && channelPreview.slabInfo.effectiveRate > 0
      ? Math.round(channelPreview.slabInfo.effectiveRate * 1000) / 10
      : null;
  const periodLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : null;
  const payoutSplit = periodBreakdownLkr
    ? computePeriodPayoutSplitLkr({
        netAmount: periodBreakdownLkr.netAmount,
        deliveryFee: deliveryFeeForPeriodLkr,
        commissionFee: periodBreakdownLkr.commissionFee,
        convenienceFee: periodBreakdownLkr.convenienceFee,
      })
    : null;
  const branchCommissionLkr =
    channelPreview?.totalCommission ?? periodBreakdownLkr?.commissionFee ?? 0;
  const platformCommissionLkr = resolvePlatformCommissionForPeriodLkr({
    commissionLkr: branchCommissionLkr,
    periodBreakdownLkr,
    paybackEnabled,
    sharedPromoPlatformLkr: sharedPromo.platformContributionLkr,
  });
  const payoutBreakdownPanelProps = periodBreakdownLkr
    ? {
        preview: channelPreview,
        periodBreakdownLkr,
        onlineOrderSubtotalLkr,
        convenienceFeeLkr,
        deliveryFeeLkr: deliveryFeeForPeriodLkr,
        slabRatePct,
        periodLabel,
        paybackEnabled,
        gatewayRatePct,
        sharedPromo,
        loyaltyDiscountLkr: periodBreakdownLkr.periodLoyaltyDiscountTotal ?? 0,
        payoutSplit,
        branchReceivesLkr: branchPayout.totalBranchPayoutLkr,
        platformCommissionLkr,
        periodNetLkr: branchPayout.periodWalletNetLkr,
        dateFrom,
        dateTo,
        showAdvance: false,
        advanceAmountLkr: 0,
        branchPayout,
      }
    : null;
  const isCheck = paymentMethod === 'CHECK';
  const checkValid = !isCheck || (checkNumber.trim().length > 0 && !!checkDate);
  const canSubmit =
    validAmount &&
    rangeReady &&
    periodDays != null &&
    !!paymentMethod &&
    checkValid &&
    !!proofFile &&
    !submitting &&
    !previewLoading &&
    !periodInfoLoading &&
    !periodInFuture;

  const handlePaymentMethodChange = (value: PaymentMethod) => {
    setPaymentMethod(value);
    if (value !== 'CHECK') {
      setCheckNumber('');
      setCheckDate('');
    }
  };

  const handleViewProof = () => {
    if (!proofFile) return;
    const objectUrl = URL.createObjectURL(proofFile);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  const closePinGate = () => {
    if (submitting) return;
    setPinGateOpen(false);
  };

  const submitPayout = async (verifiedPin: string) => {
    if (!proofFile || !paymentMethod) return;

    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('amount', String(parsed));
      form.append('periodDays', String(periodDays));
      form.append('from', dateFrom);
      form.append('to', dateTo);
      form.append('paymentMethod', paymentMethod);
      form.append('password', verifiedPin);
      if (remarks.trim()) form.append('remarks', remarks.trim());
      form.append('proof', proofFile);
      if (isCheck) {
        form.append('checkNumber', checkNumber.trim());
        form.append('checkDate', checkDate);
      }

      const res = await fetch(
        `${apiBase}/admin/wallet/${encodeURIComponent(storeId)}/initiate-payout`,
        {
          method: 'POST',
          headers: adminAuthHeaders(), credentials: 'include',
          body: form,
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Payout failed');

      if (json.data?.invoiceUrl) {
        void openWithdrawalInvoice(json.data.invoiceUrl).catch(() => {
          toast.error('Could not open invoice');
        });
      }

      toast.success(`Branch payout successful — ${branchName}`);
      onCompleted({
        storeId,
        periodFrom: dateFrom,
        periodTo: dateTo,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinVerified = async (verifiedPin: string) => {
    const confirmed = await confirmDialog({
      title: 'Initiate payout?',
      message: showJasonTopUp
        ? `Pay ${formatMoney(payTotalLkr)} to ${branchName} for period ${dateFrom} → ${dateTo}? Jason's balance will be reduced by ${formatMoney(sharedPromo.jasonContributionLkr)} for the shared promotion contribution.`
        : showPlatformContributionBanner
          ? `Pay ${formatMoney(payTotalLkr)} to ${branchName} for period ${dateFrom} → ${dateTo}? Platform commission will be reduced by ${formatMoney(sharedPromo.platformContributionLkr)} for the shared promotion contribution.`
          : `Pay ${formatMoney(payTotalLkr)} to ${branchName} for period ${dateFrom} → ${dateTo}?`,
      confirmLabel: 'Yes, pay',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    await submitPayout(verifiedPin);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofFile) {
      toast.error('Payment proof is required');
      return;
    }
    if (!validAmount) {
      toast.error('Enter a valid amount within the net amount for this period');
      return;
    }
    if (!rangeReady) {
      toast.error('Select a valid payout period');
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
        aria-label="Initiate payout"
        className="fixed inset-0 z-[1201] flex items-center justify-center p-4 sm:p-6"
        onClick={() => !submitting && !pinGateOpen && onClose()}
      >
        <div
          className="flex max-h-[min(95vh,960px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-[#e2e8f0] dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[28px] font-bold text-[#1e293b] dark:text-slate-100">
                  Initiate Payout
                </h2>
                <span className="rounded-full bg-[#f1f5f9] dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-[#475569] dark:text-slate-300">
                  {branchName}
                </span>
              </div>
              <p className="mt-1 text-[15px] font-medium text-[#64748b] dark:text-slate-400">
                Paying {branchName} · Available to withdraw:{' '}
                <span className="font-bold text-[#2563eb]">
                  LKR {formatMoneyAmount(availableLkr)}
                </span>
              </p>
              {rangeReady && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] font-medium text-[#475569] dark:text-slate-300">
                  <div className="flex items-center gap-2 rounded-full border border-[#cbd5e1] dark:border-slate-600 bg-[#f8fafc] dark:bg-slate-800 px-3 py-1.5">
                    <CalendarRange size={16} className="text-[#3b82f6]" />
                    <span>
                      {formatBiweeklyPeriodLabel(dateFrom, dateTo)} · {periodDays} days
                      {duePeriodLocked ? ' · from Payouts Due' : ''}
                    </span>
                  </div>
                  {tierPreview && (
                    <div className="flex items-center gap-2 rounded-full border border-[#cbd5e1] dark:border-slate-600 bg-[#f8fafc] dark:bg-slate-800 px-3 py-1.5">
                      <Settings size={16} className="text-[#3b82f6]" />
                      <span>
                        Commission tier {tierPreview.commissionRatePct}% · {tierPreview.tierLabel}
                      </span>
                    </div>
                  )}
                  {previewLoading && (
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
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {(periodIncomplete || periodInFuture) && (
                <div className="mb-4">
                  {periodIncomplete && periodCompleteEndDate && (
                    <p className="text-[13px] font-medium text-amber-500">
                      The full {periodDays}-day period is not complete yet. Full period ends{' '}
                      {periodCompleteEndDate}. As Super Admin you may still initiate this payout.
                    </p>
                  )}
                  {periodInFuture && !periodIncomplete && (
                    <p className="text-[13px] font-medium text-amber-500">Available after {dateTo}.</p>
                  )}
                </div>
              )}

              {previewLoading && (
                <div className="mb-6 flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-muted)]">
                  <Loader2 size={20} className="animate-spin" />
                  Calculating breakdown…
                </div>
              )}

              {!previewLoading &&
                channelPreview &&
                rangeReady &&
                channelBreakdownHasSalesActivity(channelPreview.breakdown) && (
                <ChannelSalesTable breakdown={channelPreview.breakdown} className="mb-4" />
              )}

              {!previewLoading && payoutBreakdownPanelProps && parsed > 0 && (
                <PayoutBreakdownPanel {...payoutBreakdownPanelProps} className="mb-4" />
              )}

              <div className="mb-4">
                <div className="rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm flex flex-col">
                  <label className="mb-2 block text-[13px] font-bold text-[#1e293b] dark:text-slate-100">
                    Remarks (optional)
                  </label>
                  <div className="relative flex-1">
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      maxLength={250}
                      disabled={submitting}
                      className="block w-full h-full min-h-[50px] resize-none border-0 bg-transparent p-0 text-[14px] text-[#1e293b] dark:text-slate-100 placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 focus:ring-0 disabled:opacity-50"
                      placeholder="Add a note about this payout"
                    />
                    <div className="absolute bottom-0 right-0 text-[11px] font-medium text-[#94a3b8] dark:text-slate-500">
                      {remarks.length} / 250
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <h4 className="mb-3 text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
                  Payment verification
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="initiate-payout-payment-method"
                      className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100"
                    >
                      Payment method
                    </label>
                    <select
                      id="initiate-payout-payment-method"
                      value={paymentMethod}
                      onChange={(e) => handlePaymentMethodChange(e.target.value as PaymentMethod)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-[#cbd5e1] dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-[14px] font-medium text-[#1e293b] dark:text-slate-100 focus:border-[#3b82f6] focus:outline-none"
                      required
                    >
                      <option value="">Select method…</option>
                      {INITIATE_PAYOUT_METHODS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100">
                      Payment slip / receipt proof <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center justify-between rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-800 p-2 pl-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <ImageIcon size={18} className="shrink-0 text-[#3b82f6]" />
                        <span className="truncate text-[13px] font-medium text-[#1e293b] dark:text-slate-200">
                          {proofFile ? proofFile.name : 'Upload proof slip'}
                        </span>
                        {proofFile && (
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                            Uploaded
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {proofFile && (
                          <button
                            type="button"
                            onClick={handleViewProof}
                            className="text-[13px] font-bold text-[#3b82f6] hover:underline"
                          >
                            View proof
                          </button>
                        )}
                        <label className="cursor-pointer rounded-md border border-[#cbd5e1] dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1 text-[12px] font-bold text-[#1e293b] dark:text-slate-100 hover:bg-[#f1f5f9] dark:hover:bg-slate-800">
                          {proofFile ? 'Change' : 'Upload'}
                          <input
                            id="initiate-payout-proof"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="sr-only"
                            disabled={submitting}
                            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isCheck && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <div>
                    <label
                      htmlFor="initiate-payout-check-number"
                      className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100"
                    >
                      Check number
                    </label>
                    <input
                      id="initiate-payout-check-number"
                      type="text"
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      disabled={submitting}
                      maxLength={64}
                      placeholder="e.g. 102458"
                      className="w-full rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[14px] text-[#1e293b] dark:text-slate-100"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="initiate-payout-check-date"
                      className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100"
                    >
                      Check date
                    </label>
                    <input
                      id="initiate-payout-check-date"
                      type="date"
                      value={checkDate}
                      onChange={(e) => setCheckDate(e.target.value)}
                      disabled={submitting}
                      max={todayDateStr()}
                      className="w-full rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[14px] text-[#1e293b] dark:text-slate-100"
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4">
              <div className="space-y-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                    className="h-5 w-5 rounded border-[#cbd5e1] dark:border-slate-600 text-[#2563eb] focus:ring-[#2563eb] checked:bg-[#2563eb]"
                  />
                  <span className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
                    I have reviewed the payout calculation and payment details.
                  </span>
                </label>
                <div className="flex items-center gap-1.5 pl-8 text-[12px] text-[#64748b] dark:text-slate-400">
                  <ShieldCheck size={14} className="text-[#64748b] dark:text-slate-400" />
                  <span>Payout will be recorded immediately in the branch wallet history.</span>
                </div>
              </div>

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
                      Processing…
                    </span>
                  ) : (
                    `Pay LKR ${formatMoneyAmount(payTotalLkr)}`
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <AdminPinGateModal
        open={pinGateOpen}
        onClose={closePinGate}
        onVerified={handlePinVerified}
        apiBase={apiBase}
        busy={submitting}
        titleId="initiate-payout-pin-title"
        inputId="initiate-payout-pin"
        description="Enter your admin password to verify you are authorized to initiate this payout."
      />
    </>,
    document.body,
  );
}
