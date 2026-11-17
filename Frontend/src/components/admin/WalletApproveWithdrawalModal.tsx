'use client';

import { withAdminCredentials } from '@/lib/adminSession';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CalendarRange, Image as ImageIcon, Loader2, ShieldCheck, Upload, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import ChannelSalesTable from '@/components/admin/ChannelSalesTable';
import { resolveSlabRatePct } from '@/components/admin/commissionUtils';
import { resolveBranchPayoutDisplay } from '@/components/admin/branchPayoutDisplay';
import PayoutBreakdownPanel from '@/components/admin/PayoutBreakdownPanel';
import {
  buildSettlementPreviewFromChannelBreakdown,
  channelBreakdownHasSalesActivity,
  computePeriodPayoutNetFromPreview,
  computePeriodPayoutSplitLkr,
  parseWithdrawalBreakdown,
  extractWithdrawalSnapshotFees,
  extractSharedPromoLkrFromBreakdown,
  hasPositiveLkr,
  parseWithdrawalBreakdownFromNetPreview,
  resolvePlatformCommissionForPeriodLkr,
  resolvePeriodDeliveryFeeLkr,
  resolvePreviewConvenienceFeeLkr,
  resolveTotalDeliveryFeeForAllocationLkr,
  resolveWithdrawalLockedSnapshotLkr,
  SETTLEMENT_CHANNELS,
  sumAllDiscounts,
  sumAllRevenueSubtotal,
  sumAllSubtotalBeforeDiscount,
  sumOnlineRevenueSubtotals,
  withdrawalBreakdownToLkr,
  type SettlementPreview,
  type WithdrawalBreakdown,
} from '@/components/admin/settlementTypes';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { cn } from '@/lib/utils';
import { openPayoutProof, openPayoutProofById, openWithdrawalInvoice } from '@/lib/adminProtectedFile';
import {
  centsToLkr,
  formatPayoutPaymentMethodLabel,
  paybackEnabledFromBreakdown,
  toDateInputValue,
} from '@/lib/walletUtils';
import { jasonPayoutDeductionLkr } from '@/components/admin/jasonPayoutDeduction';
import { hasNegativeLkr } from '@/components/admin/settlement/lkrUtils';
import {
  formatStoredPayoutPeriodLabel,
  resolvePayoutCycleDisplayRange,
} from '@/components/admin/payoutSecondCycleDisplayRange';
import { confirmDialog } from '@/store/confirmStore';
import type { WithdrawalRow } from './WalletWithdrawalTable';

type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CHECK' | '';

type BranchWalletSummary = {
  currentBalance: number;
  availableBalance: number;
  netTransferableEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawalTotal: number;
};

type Props = {
  open: boolean;
  withdrawal: WithdrawalRow | null;
  branchName?: string;
  apiBase: string;
  onClose: () => void;
  onApproved: () => void;
  /** Optional: open the existing reject flow from the breakdown modal. */
  onRejectRequest?: () => void;
  /** Render above nested branch wallet modal (z-50). */
  elevated?: boolean;
};

export default function WalletApproveWithdrawalModal({
  open,
  withdrawal,
  branchName,
  apiBase,
  onClose,
  onApproved,
  onRejectRequest,
  elevated = false,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [periodNet, setPeriodNet] = useState<WithdrawalBreakdown | null>(null);
  const [paybackEnabled, setPaybackEnabled] = useState(false);
  const [walletSummary, setWalletSummary] = useState<BranchWalletSummary | null>(null);
  const [walletSummaryLoading, setWalletSummaryLoading] = useState(false);
  const [gatewayRatePctFromSettings, setGatewayRatePctFromSettings] = useState(1.9);
  const [resolvedWithdrawal, setResolvedWithdrawal] = useState<WithdrawalRow | null>(null);
  const [snapshotBreakdownRaw, setSnapshotBreakdownRaw] = useState<unknown>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [jasonNetBalanceLkr, setJasonNetBalanceLkr] = useState<number | null>(null);
  const [jasonBalanceLoading, setJasonBalanceLoading] = useState(false);
  const onCloseRef = useRef(onClose);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeWithdrawal = resolvedWithdrawal ?? withdrawal;
  const isReadOnly = activeWithdrawal?.status !== 'PENDING';
  const snapshotBreakdownSource =
    snapshotBreakdownRaw ?? (open ? activeWithdrawal?.breakdown : null);
  const periodFrom = toDateInputValue(activeWithdrawal?.periodFrom);
  const periodTo = toDateInputValue(activeWithdrawal?.periodTo);
  const branchLabel = branchName ?? activeWithdrawal?.storeId ?? 'Branch';
  const breakdown = parseWithdrawalBreakdown(snapshotBreakdownSource);
  const storedCycleStage = breakdown?.cycleStage ?? activeWithdrawal?.cycleStage ?? null;
  const payoutDisplayRange =
    periodFrom && periodTo
      ? resolvePayoutCycleDisplayRange({
          cycleStage: storedCycleStage,
          cycleFrom: breakdown?.cycleFrom ?? null,
          periodFrom,
          periodTo,
        })
      : null;
  const billingPeriodLabel = payoutDisplayRange
    ? formatStoredPayoutPeriodLabel({
        periodFrom: payoutDisplayRange.displayFrom,
        periodTo: payoutDisplayRange.displayTo,
      })
    : null;
  const snapshotFees = extractWithdrawalSnapshotFees(snapshotBreakdownSource);
  const channelBreakdown = breakdown?.channelBreakdown ?? null;
  const channelTableData = channelBreakdown ?? (preview?.breakdown ?? null);
  const channelTableTitle = channelBreakdown ? 'Sales by channel' : 'Current channel activity';
  const channelTableOrderCount =
    channelBreakdown != null
      ? SETTLEMENT_CHANNELS.reduce(
          (sum, { key }) => sum + (channelBreakdown[key].orderCount ?? 0),
          0,
        )
      : (preview?.orderCount ?? 0);
  const showChannelTable =
    channelTableData != null &&
    (channelTableOrderCount > 0 || channelBreakdownHasSalesActivity(channelTableData)) &&
    (channelBreakdown != null || !previewLoading);
  const storedBreakdownLkr = breakdown ? withdrawalBreakdownToLkr(breakdown) : null;
  const liveBreakdownLkr = periodNet ? withdrawalBreakdownToLkr(periodNet) : null;
  const periodBreakdownLkr = storedBreakdownLkr ?? liveBreakdownLkr;
  const useSnapshotDisplay = storedBreakdownLkr != null || snapshotFees != null;
  const storedCommissionRate = breakdown?.commissionRate;
  const previewForBreakdown: SettlementPreview | null =
    channelBreakdown != null && periodFrom && periodTo
      ? buildSettlementPreviewFromChannelBreakdown(channelBreakdown, {
          from: periodFrom,
          to: periodTo,
          commissionRate: storedCommissionRate,
          orderCount: storedBreakdownLkr?.orderCount,
          slabInfo: preview?.slabInfo,
          gatewayFeeLkr: storedBreakdownLkr?.gatewayFee,
        })
      : preview;
  const totalSalesLkr = previewForBreakdown
    ? sumAllRevenueSubtotal(previewForBreakdown)
    : periodBreakdownLkr?.grossAmount ?? null;
  const totalDiscountLkr = channelBreakdown
    ? sumAllDiscounts(channelBreakdown)
    : preview
      ? sumAllDiscounts(preview.breakdown)
      : storedBreakdownLkr?.periodDiscountsTotal ?? 0;
  const subtotalBeforeDiscountLkr = channelBreakdown
    ? sumAllSubtotalBeforeDiscount(channelBreakdown)
    : preview
      ? sumAllSubtotalBeforeDiscount(preview.breakdown)
      : totalSalesLkr;
  const onlinePaymentsCollectedLkr = channelBreakdown
    ? sumOnlineRevenueSubtotals(channelBreakdown)
    : preview
      ? sumOnlineRevenueSubtotals(preview.breakdown)
      : null;
  const onlineOrderSubtotalLkr = totalSalesLkr;
  const convenienceFeeLkr =
    periodBreakdownLkr?.convenienceFee ??
    resolvePreviewConvenienceFeeLkr(previewForBreakdown, resolvePreviewConvenienceFeeLkr(preview));
  const deliveryFeeLkr = periodBreakdownLkr?.deliveryFee ?? 0;
  const snapshotRefundDeliveryFeeLkr =
    periodBreakdownLkr?.refundDeliveryFee ?? 0;
  const snapshotRejectedRefundDeliveryFeeLkr =
    periodBreakdownLkr?.rejectedRefundDeliveryFee ?? 0;
  const deliveryFeeForPeriodLkr = resolveTotalDeliveryFeeForAllocationLkr({
    periodDeliveryFeeLkr: useSnapshotDisplay
      ? storedBreakdownLkr!.deliveryFee
      : resolvePeriodDeliveryFeeLkr({
          channelBreakdown: channelBreakdown ?? previewForBreakdown?.breakdown,
          periodDeliveryFeeLkr: deliveryFeeLkr,
        }),
    refundDeliveryFeeLkr: snapshotRefundDeliveryFeeLkr,
    rejectedRefundDeliveryFeeLkr: snapshotRejectedRefundDeliveryFeeLkr,
  });
  const slabRatePct = resolveSlabRatePct(
    storedCommissionRate,
    previewForBreakdown?.slabInfo.effectiveRate,
    preview?.slabInfo.effectiveRate,
  );
  const periodLabel = periodFrom && periodTo ? `${periodFrom} → ${periodTo}` : null;
  const resolvedGatewayRatePct =
    breakdown?.gatewayRatePct ??
    periodNet?.gatewayRatePct ??
    gatewayRatePctFromSettings ??
    1.9;
  const lockedSnapshot = resolveWithdrawalLockedSnapshotLkr({
    snapshotFees,
    storedBreakdownLkr,
    breakdown,
    fallbackGatewayRatePct: resolvedGatewayRatePct,
  });
  const calculatedPeriodNetLkr = lockedSnapshot.netAmountLkr ??
    (previewForBreakdown && periodBreakdownLkr
      ? computePeriodPayoutNetFromPreview({
          preview: previewForBreakdown,
          periodBreakdownLkr,
          convenienceFeeLkr,
          deliveryFeeLkr: deliveryFeeForPeriodLkr,
          gatewayRatePct: lockedSnapshot.gatewayRatePct,
          paybackEnabled,
        })
      : periodBreakdownLkr && preview
        ? computePeriodPayoutNetFromPreview({
            preview,
            periodBreakdownLkr,
            convenienceFeeLkr,
            deliveryFeeLkr: deliveryFeeForPeriodLkr,
            gatewayRatePct: lockedSnapshot.gatewayRatePct,
            paybackEnabled,
        })
        : null);
  const periodNetLkr =
    lockedSnapshot.netAmountLkr ?? calculatedPeriodNetLkr ?? periodBreakdownLkr?.netAmount ?? null;
  const payoutSplit = periodBreakdownLkr
    ? computePeriodPayoutSplitLkr({
        netAmount: lockedSnapshot.netAmountLkr ?? periodBreakdownLkr.netAmount,
        deliveryFee: deliveryFeeForPeriodLkr,
        commissionFee:
          useSnapshotDisplay && storedBreakdownLkr
            ? storedBreakdownLkr.commissionFee
            : periodBreakdownLkr.commissionFee,
        convenienceFee:
          useSnapshotDisplay && storedBreakdownLkr
            ? (storedBreakdownLkr.convenienceFee ?? periodBreakdownLkr.convenienceFee ?? 0)
            : periodBreakdownLkr.convenienceFee,
      })
    : null;
  const branchCommissionLkr = useSnapshotDisplay
    ? storedBreakdownLkr!.commissionFee
    : (previewForBreakdown?.totalCommission ?? periodBreakdownLkr?.commissionFee ?? 0);
  const requestedLkr = activeWithdrawal ? activeWithdrawal.amount / 100 : 0;
  const sharedPromo = extractSharedPromoLkrFromBreakdown(breakdown, activeWithdrawal?.amount ?? 0);
  const platformCommissionLkr =
    periodBreakdownLkr?.cycleStage === 'FIRST'
      ? 0
      : resolvePlatformCommissionForPeriodLkr({
          commissionLkr: branchCommissionLkr,
          periodBreakdownLkr,
          paybackEnabled,
          sharedPromoPlatformLkr: sharedPromo.platformContributionLkr,
        });
  const branchPayout = resolveBranchPayoutDisplay({
    breakdown,
    amountCents: activeWithdrawal?.amount ?? 0,
    scope: 'thisPayment',
    paymentWalletRequestLkr: requestedLkr > 0 ? requestedLkr : null,
  });
  const finalPayoutLkr = branchPayout.totalBranchPayoutLkr;
  const netPlatformForJasonLkr =
    periodBreakdownLkr?.cycleStage === 'FIRST' ? 0 : platformCommissionLkr;
  const jasonDeductionLkr = jasonPayoutDeductionLkr({
    jasonContributionLkr: sharedPromo.jasonContributionLkr,
    netPlatformAmountLkr: netPlatformForJasonLkr,
  });
  const showNegativeNetPlatformJasonBanner = hasNegativeLkr(netPlatformForJasonLkr);
  const showJasonContributionBanner = hasPositiveLkr(sharedPromo.jasonContributionLkr);
  const showPlatformContributionBanner = hasPositiveLkr(sharedPromo.platformContributionLkr);
  const showJasonPayoutBanner = jasonDeductionLkr > 0.001;
  const advanceAmountLkr =
    periodNetLkr != null && requestedLkr > periodNetLkr + 0.001
      ? Math.round((requestedLkr - periodNetLkr) * 100) / 100
      : 0;
  const showAdvance = advanceAmountLkr > 0.001;
  const availableLkr = centsToLkr(walletSummary?.availableBalance);
  const payoutBreakdownPanelProps = periodBreakdownLkr
    ? {
        preview: previewForBreakdown ?? preview,
        channelBreakdown: channelBreakdown ?? previewForBreakdown?.breakdown ?? preview?.breakdown,
        periodBreakdownLkr,
        onlineOrderSubtotalLkr:
          storedBreakdownLkr?.grossAmount ?? totalSalesLkr ?? periodBreakdownLkr.grossAmount,
        convenienceFeeLkr: storedBreakdownLkr?.convenienceFee ?? convenienceFeeLkr,
        deliveryFeeLkr: deliveryFeeForPeriodLkr,
        slabRatePct,
        periodLabel,
        paybackEnabled,
        totalSalesLkr:
          storedBreakdownLkr?.grossAmount ?? totalSalesLkr ?? periodBreakdownLkr.grossAmount,
        totalDiscountLkr: storedBreakdownLkr?.periodDiscountsTotal ?? totalDiscountLkr ?? 0,
        subtotalBeforeDiscountLkr:
          storedBreakdownLkr != null
            ? (storedBreakdownLkr.periodDiscountsTotal ?? 0) > 0.001
              ? storedBreakdownLkr.grossAmount + (storedBreakdownLkr.periodDiscountsTotal ?? 0)
              : storedBreakdownLkr.grossAmount
            : subtotalBeforeDiscountLkr,
        onlinePaymentsCollectedLkr:
          lockedSnapshot.onlineWalletGrossLkr ??
          onlinePaymentsCollectedLkr ??
          periodBreakdownLkr.onlineWalletGross ??
          null,
        gatewayRatePct: lockedSnapshot.gatewayRatePct,
        useStoredSnapshot: useSnapshotDisplay,
        snapshotGatewayFeeLkr: lockedSnapshot.gatewayFeeLkr,
        snapshotGatewayRatePct: lockedSnapshot.gatewayRatePct,
        snapshotOnlineWalletGrossLkr: lockedSnapshot.onlineWalletGrossLkr,
        snapshotCancelledByBranchGatewayFeeLkr: lockedSnapshot.cancelledByBranchGatewayFeeLkr,
        snapshotCancelledByBranchOrderCount: lockedSnapshot.cancelledByBranchOrderCount,
        snapshotCustomerLateCancelSubtotalLkr: lockedSnapshot.customerLateCancelSubtotalLkr,
        snapshotCustomerLateCancelGatewayDeductionLkr:
          lockedSnapshot.customerLateCancelGatewayDeductionLkr,
        snapshotCustomerLateCancelNetAmountLkr: lockedSnapshot.customerLateCancelNetAmountLkr,
        snapshotRejectedRefundSubtotalLkr: lockedSnapshot.rejectedRefundSubtotalLkr,
        snapshotRejectedRefundGatewayDeductionLkr: lockedSnapshot.rejectedRefundGatewayDeductionLkr,
        snapshotRejectedRefundNetAmountLkr: lockedSnapshot.rejectedRefundNetAmountLkr,
        snapshotNetAmountLkr: lockedSnapshot.netAmountLkr,
        sharedPromo,
        loyaltyDiscountLkr:
          storedBreakdownLkr?.periodLoyaltyDiscountTotal ??
          periodBreakdownLkr.periodLoyaltyDiscountTotal ??
          0,
        payoutSplit,
        branchReceivesLkr: branchPayout.totalBranchPayoutLkr,
        platformCommissionLkr,
        periodNetLkr: branchPayout.periodWalletNetLkr,
        dateFrom: payoutDisplayRange?.displayFrom ?? periodFrom,
        dateTo: payoutDisplayRange?.displayTo ?? periodTo,
        showAdvance,
        advanceAmountLkr,
        branchPayout,
        jasonContext: showJasonPayoutBanner
          ? {
              jasonDeductionLkr,
              jasonNetBalanceLkr,
              jasonBalanceLoading,
            }
          : undefined,
      }
    : null;

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
      setPaymentMethod('');
      setCheckNumber('');
      setCheckDate('');
      setProofFile(null);
      setReviewed(false);
      setSubmitting(false);
      setError('');
      setPinGateOpen(false);
      setPreview(null);
      setPreviewLoading(false);
      setPeriodNet(null);
      setPaybackEnabled(false);
      setWalletSummary(null);
      setWalletSummaryLoading(false);
      setGatewayRatePctFromSettings(1.9);
      setResolvedWithdrawal(null);
      setSnapshotBreakdownRaw(null);
      setSnapshotLoading(false);
      return;
    }

    setResolvedWithdrawal(withdrawal);
    setSnapshotBreakdownRaw(withdrawal?.breakdown ?? null);

    if (withdrawal) {
      const parsed = parseWithdrawalBreakdown(withdrawal.breakdown);
      setPaybackEnabled(paybackEnabledFromBreakdown(parsed));
      if (withdrawal.status !== 'PENDING') {
        setPaymentMethod((withdrawal.paymentMethod as PaymentMethod) || '');
        setCheckNumber(withdrawal.checkNumber?.trim() ?? '');
        setCheckDate(toDateInputValue(withdrawal.checkDate));
        setReviewed(true);
      }
    }
  }, [open, withdrawal]);

  useEffect(() => {
    if (!open || !withdrawal?.id) return;

    let cancelled = false;
    setSnapshotLoading(true);
    const qs = withdrawal.storeId
      ? `?storeId=${encodeURIComponent(withdrawal.storeId)}`
      : '';

    fetch(
      `${apiBase}/admin/wallet/withdrawals/${encodeURIComponent(withdrawal.id)}${qs}`,
      withAdminCredentials(),
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const fresh = json.data as WithdrawalRow | undefined;
        if (fresh?.id !== withdrawal.id) return;
        setResolvedWithdrawal(fresh);
        if (fresh.breakdown != null) {
          setSnapshotBreakdownRaw(fresh.breakdown);
          const parsed = parseWithdrawalBreakdown(fresh.breakdown);
          if (parsed) setPaybackEnabled(paybackEnabledFromBreakdown(parsed));
        }
      })
      .catch(() => {
        // keep breakdown from row passed into modal
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, withdrawal?.id, withdrawal?.storeId, apiBase]);

  useEffect(() => {
    if (!open || !activeWithdrawal?.storeId) return;

    let cancelled = false;
    setWalletSummaryLoading(true);

    fetch(
      `${apiBase}/admin/wallet/summary?storeId=${encodeURIComponent(activeWithdrawal.storeId)}`,
      withAdminCredentials(),
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load wallet summary');
        if (!cancelled) setWalletSummary(json.data as BranchWalletSummary);
      })
      .catch(() => {
        if (!cancelled) setWalletSummary(null);
      })
      .finally(() => {
        if (!cancelled) setWalletSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeWithdrawal?.storeId, apiBase]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setJasonBalanceLoading(true);
    fetch(`${apiBase}/admin/jason`, withAdminCredentials())
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load Jason balance');
        if (cancelled) return;
        const net =
          json.data?.summary && typeof json.data.summary.net === 'number'
            ? json.data.summary.net
            : null;
        setJasonNetBalanceLkr(net);
      })
      .catch(() => {
        if (!cancelled) setJasonNetBalanceLkr(null);
      })
      .finally(() => {
        if (!cancelled) setJasonBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, apiBase]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    fetch(`${apiBase}/settings/app`, withAdminCredentials())
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || cancelled) return;
        if (typeof json.data?.gatewayFeePercent === 'number') {
          setGatewayRatePctFromSettings(json.data.gatewayFeePercent);
        }
      })
      .catch(() => {
        // keep default
      });

    return () => {
      cancelled = true;
    };
  }, [open, apiBase]);

  const loadPreview = useCallback(async () => {
    if (!activeWithdrawal?.storeId || !periodFrom || !periodTo) {
      setPreview(null);
      setPeriodNet(null);
      return;
    }

    const hasStoredSnapshot =
      extractWithdrawalSnapshotFees(snapshotBreakdownRaw) != null ||
      parseWithdrawalBreakdown(snapshotBreakdownRaw) != null;

    setPreviewLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        from: periodFrom,
        to: periodTo,
        storeId: activeWithdrawal.storeId,
      });

      const [settlementRes, netRes] = await Promise.all([
        fetch(`${apiBase}/admin/payment-history/settlement-preview?${qs}`, withAdminCredentials()),
        hasStoredSnapshot
          ? Promise.resolve(null)
          : fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, withAdminCredentials()),
      ]);

      const settlementJson = settlementRes ? await settlementRes.json() : null;
      const netJson = netRes ? await netRes.json() : null;

      if (settlementRes?.ok) {
        setPreview(settlementJson.data as SettlementPreview);
      } else {
        setPreview(null);
      }

      if (
        !hasStoredSnapshot &&
        netRes?.ok &&
        netJson?.data &&
        typeof netJson.data.grossAmount === 'number'
      ) {
        const parsedBreakdown = parseWithdrawalBreakdown(activeWithdrawal.breakdown);
        if (!parsedBreakdown) {
          setPaybackEnabled(Boolean(netJson.data.platformDiscountPaybackEnabled));
        }
        setPeriodNet(parseWithdrawalBreakdownFromNetPreview(netJson.data));
      } else if (!hasStoredSnapshot) {
        setPeriodNet(null);
        if (!parseWithdrawalBreakdown(activeWithdrawal.breakdown)) {
          setPaybackEnabled(false);
        }
      } else {
        setPeriodNet(null);
      }

      if (settlementRes && !settlementRes.ok && netRes && !netRes.ok && !hasStoredSnapshot) {
        throw new Error(settlementJson?.message || netJson?.message || 'Failed to load preview');
      }

      if (settlementRes && !settlementRes.ok && netRes?.ok) {
        setError(settlementJson?.message || 'Channel breakdown unavailable for this period');
      }
    } catch (err) {
      setPreview(null);
      if (!hasStoredSnapshot) setPeriodNet(null);
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [apiBase, periodFrom, periodTo, activeWithdrawal, snapshotBreakdownRaw]);

  useEffect(() => {
    if (!open || !activeWithdrawal) return;

    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      loadPreview();
    }, 350);

    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [open, activeWithdrawal, loadPreview]);

  if (!portalReady) return null;

  const isCheck = paymentMethod === 'CHECK';
  const checkValid = !isCheck || (checkNumber.trim().length > 0 && !!checkDate);
  const jasonInsufficient =
    showJasonPayoutBanner &&
    !jasonBalanceLoading &&
    jasonNetBalanceLkr != null &&
    jasonNetBalanceLkr + 0.005 < jasonDeductionLkr;
  const canSubmit =
    !!withdrawal &&
    !!paymentMethod &&
    checkValid &&
    !!proofFile &&
    !submitting &&
    !isReadOnly &&
    !jasonBalanceLoading &&
    !(showJasonPayoutBanner && jasonNetBalanceLkr == null) &&
    !jasonInsufficient;

  const handlePaymentMethodChange = (value: PaymentMethod) => {
    setPaymentMethod(value);
    if (value !== 'CHECK') {
      setCheckNumber('');
      setCheckDate('');
    }
  };

  const handleViewProof = async () => {
    if (proofFile) {
      const objectUrl = URL.createObjectURL(proofFile);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }
    if (!activeWithdrawal?.hasProof && !activeWithdrawal?.proofUrl) return;
    try {
      if (activeWithdrawal.proofUrl) {
        await openPayoutProof(activeWithdrawal.proofUrl);
      } else {
        await openPayoutProofById('withdrawal', activeWithdrawal.id, {
          storeId: activeWithdrawal.storeId,
        });
      }
    } catch {
      toast.error('Could not open payment proof');
    }
  };

  const closePinGate = () => {
    if (submitting) return;
    setPinGateOpen(false);
  };

  const submitApproval = async (verifiedPin: string) => {
    if (!withdrawal || !paymentMethod || !proofFile) return;

    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('paymentMethod', paymentMethod);
      form.append('proof', proofFile);
      form.append('password', verifiedPin);
      if (isCheck) {
        form.append('checkNumber', checkNumber.trim());
        form.append('checkDate', checkDate);
      }

      const res = await fetch(
        `${apiBase}/admin/wallet/withdrawals/${withdrawal.id}/approve`,
        withAdminCredentials({ method: 'POST', body: form }),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Approve failed');

      if (json.data?.invoiceUrl) {
        void openWithdrawalInvoice(json.data.invoiceUrl).catch(() => {
          toast.error('Could not open invoice');
        });
      }

      toast.success('Withdrawal approved — invoice generated');
      onApproved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinVerified = async (verifiedPin: string) => {
    const confirmed = await confirmDialog({
      title: 'Confirm payout?',
      message: `Are you sure you want to pay ${formatMoney(finalPayoutLkr)} to ${branchLabel}?${
        showJasonPayoutBanner
          ? ` Jason's balance will be reduced by ${formatMoney(jasonDeductionLkr)} for this payout${showNegativeNetPlatformJasonBanner ? ' (includes negative net platform amount funded by Jason)' : ''}.`
          : showPlatformContributionBanner
            ? ` Platform commission will be reduced by ${formatMoney(sharedPromo.platformContributionLkr)} for the shared promotion contribution.`
            : ''
      }`,
      confirmLabel: 'Yes, pay',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    await submitApproval(verifiedPin);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawal || !paymentMethod || !checkValid || !proofFile) {
      if (!proofFile) toast.error('Payment proof is required');
      return;
    }

    setError('');
    setPinGateOpen(true);
  };

  return createPortal(
    <AnimatePresence>
      {open && withdrawal && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'fixed inset-0 bg-black/55 backdrop-blur-sm',
              elevated ? 'z-[1400]' : 'z-[1200]',
            )}
            onClick={() => !submitting && !pinGateOpen && onClose()}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={isReadOnly ? 'Payout details' : 'Approve payout'}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'fixed inset-0 flex items-center justify-center p-4 sm:p-6',
              elevated ? 'z-[1401]' : 'z-[1201]',
            )}
            onClick={() => !submitting && !pinGateOpen && onClose()}
          >
            <div
              className="flex max-h-[min(95vh,960px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-[#e2e8f0] dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[24px] font-bold text-[#1e293b] dark:text-slate-100">
                      {isReadOnly ? 'Payout Details' : 'Approve Payout'}
                    </h2>
                    <span className="rounded-full bg-[#f1f5f9] dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-[#475569] dark:text-slate-300">
                      {branchLabel}
                    </span>
                    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {withdrawal?.status === 'PENDING' ? 'Pending approval' : withdrawal?.status || 'Pending approval'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#64748b] dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Wallet size={16} className="text-[#64748b] dark:text-slate-400" />
                      <span>Available wallet · </span>
                      <span className="font-bold text-[#1e293b] dark:text-slate-100">
                        {walletSummaryLoading ? '…' : formatMoney(availableLkr)}
                      </span>
                    </div>

                    {billingPeriodLabel && billingPeriodLabel !== '—' && (
                      <>
                        <span className="text-[#cbd5e1] dark:text-slate-700">|</span>
                        <div className="flex items-center gap-1.5">
                          <CalendarRange size={16} className="text-[#64748b] dark:text-slate-400" />
                          <span>Billing period · </span>
                          <span className="font-semibold text-[#1e293b] dark:text-slate-100">
                            {billingPeriodLabel}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg p-2 text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-slate-800 hover:text-[#1e293b] dark:hover:text-slate-100 disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={20} />
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

                  {snapshotLoading && !useSnapshotDisplay && (
                    <div className="mb-6 flex items-center justify-center gap-2 py-4 text-sm text-[#64748b] dark:text-slate-400">
                      <Loader2 size={20} className="animate-spin text-[#3b82f6]" />
                      Loading payout snapshot…
                    </div>
                  )}

                  {!snapshotLoading && !useSnapshotDisplay && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>
                        No payout breakdown snapshot was found for this request. Figures below use
                        live preview calculations.
                      </span>
                    </div>
                  )}

                  {previewLoading && !channelBreakdown && !snapshotLoading && (
                    <div className="mb-6 flex items-center justify-center gap-2 py-4 text-sm text-[#64748b] dark:text-slate-400">
                      <Loader2 size={20} className="animate-spin text-[#3b82f6]" />
                      Loading current channel activity…
                    </div>
                  )}

                  {showChannelTable && channelTableData && (
                    <ChannelSalesTable
                      breakdown={channelTableData}
                      title={channelTableTitle}
                      className="mb-4"
                    />
                  )}

                  {payoutBreakdownPanelProps && (
                    <PayoutBreakdownPanel {...payoutBreakdownPanelProps} className="mb-4" />
                  )}

                  {jasonInsufficient && !isReadOnly && (
                    <div className="mb-4 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-[#1e293b] dark:text-slate-100">
                      <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
                      <p className="font-bold text-red-600">
                        Insufficient Jason balance (LKR {formatMoneyAmount(jasonNetBalanceLkr ?? 0)})
                        to cover payout contributions (LKR {formatMoneyAmount(jasonDeductionLkr)}).
                      </p>
                    </div>
                  )}
                  {showJasonPayoutBanner &&
                    !showNegativeNetPlatformJasonBanner &&
                    !isReadOnly && (
                    <div className="mb-4 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-[#1e293b] dark:text-slate-100">
                      <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                      <p>
                        <span className="font-bold">Jason investment: </span>
                        LKR {formatMoneyAmount(jasonDeductionLkr)} will be deducted from
                        Jason&apos;s balance when you approve.
                        {jasonNetBalanceLkr != null && !jasonBalanceLoading && (
                          <>
                            {' '}
                            Current Jason balance: LKR {formatMoneyAmount(jasonNetBalanceLkr)}.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {showPlatformContributionBanner && !isReadOnly && (
                    <div className="mb-4 flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-[13px] text-[#1e293b] dark:text-slate-100">
                      <AlertCircle size={18} className="mt-0.5 shrink-0 text-blue-600" />
                      <p>
                        <span className="font-bold">Platform shared promotion: </span>
                        LKR {formatMoney(sharedPromo.platformContributionLkr)} will be deducted from
                        platform commission when you approve.
                      </p>
                    </div>
                  )}

                  <div className="mb-2 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
                      <h4 className="mb-3 text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
                        Branch remarks
                      </h4>
                      <p className="text-[14px] font-medium text-[#64748b] dark:text-slate-400">
                        {withdrawal?.remarks?.trim() ? withdrawal.remarks : 'No remarks'}
                      </p>
                      <p className="mt-2 text-[11px] font-medium text-[#64748b] dark:text-slate-400">
                        Submitted by {branchLabel} branch
                      </p>
                    </div>

                    {/* Payment Verification Box */}
                    <div className="flex flex-col justify-between rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
                      <h4 className="mb-3 text-[14px] font-bold text-[#1e293b] dark:text-slate-100">Payment verification</h4>
                      <div className="space-y-3">
                        <div>
                          <label htmlFor="withdrawal-payment-method" className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100">
                            Payment method
                          </label>
                          {isReadOnly ? (
                            <input
                              type="text"
                              readOnly
                              value={formatPayoutPaymentMethodLabel(activeWithdrawal?.paymentMethod)}
                              className="w-full rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-800 px-3 py-2 text-[14px] font-medium text-[#1e293b] dark:text-slate-100"
                            />
                          ) : (
                          <select
                            id="withdrawal-payment-method"
                            value={paymentMethod}
                            onChange={(e) => handlePaymentMethodChange(e.target.value as PaymentMethod)}
                            disabled={submitting}
                            className="w-full rounded-lg border border-[#cbd5e1] dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-[14px] font-medium text-[#1e293b] dark:text-slate-100 focus:border-[#3b82f6] focus:outline-none"
                            required
                          >
                            <option value="">Select method…</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="CASH">Cash</option>
                            <option value="CHECK">Check</option>
                          </select>
                          )}
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100">
                            Payment slip / receipt proof
                            {!isReadOnly && <span className="text-red-500"> *</span>}
                          </label>
                          <div className="flex items-center justify-between rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-800 p-2 pl-3">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <ImageIcon size={18} className="shrink-0 text-[#3b82f6]" />
                              <span className="truncate text-[13px] font-medium text-[#1e293b] dark:text-slate-200">
                                {proofFile
                                  ? proofFile.name
                                  : activeWithdrawal?.hasProof || activeWithdrawal?.proofUrl
                                    ? 'Receipt_proof.png'
                                    : 'Upload proof slip'}
                              </span>
                              {(proofFile || activeWithdrawal?.hasProof || activeWithdrawal?.proofUrl) && (
                                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                                  Uploaded
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {(proofFile || activeWithdrawal?.hasProof || activeWithdrawal?.proofUrl) && (
                                <button
                                  type="button"
                                  onClick={() => void handleViewProof()}
                                  className="text-[13px] font-bold text-[#3b82f6] hover:underline"
                                >
                                  View proof
                                </button>
                              )}
                              {!isReadOnly && (
                              <label className="cursor-pointer rounded-md border border-[#cbd5e1] dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1 text-[12px] font-bold text-[#1e293b] dark:text-slate-100 hover:bg-[#f1f5f9] dark:hover:bg-slate-800">
                                {proofFile || activeWithdrawal?.hasProof || activeWithdrawal?.proofUrl
                                  ? 'Change'
                                  : 'Upload'}
                                <input
                                  id="withdrawal-proof"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,application/pdf"
                                  className="sr-only"
                                  disabled={submitting}
                                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                                />
                              </label>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isCheck && (
                    <div className="mb-4 grid gap-4 sm:grid-cols-2 rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                      <div>
                        <label htmlFor="withdrawal-check-number" className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100">
                          Check number
                        </label>
                        <input
                          id="withdrawal-check-number"
                          type="text"
                          value={checkNumber}
                          onChange={(e) => setCheckNumber(e.target.value)}
                          disabled={submitting || isReadOnly}
                          readOnly={isReadOnly}
                          maxLength={64}
                          placeholder="e.g. 102458"
                          className="w-full rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[14px] text-[#1e293b] dark:text-slate-100"
                          required={!isReadOnly}
                        />
                      </div>
                      <div>
                        <label htmlFor="withdrawal-check-date" className="mb-1.5 block text-[12px] font-bold text-[#1e293b] dark:text-slate-100">
                          Check date
                        </label>
                        <input
                          id="withdrawal-check-date"
                          type="date"
                          value={checkDate}
                          onChange={(e) => setCheckDate(e.target.value)}
                          disabled={submitting || isReadOnly}
                          readOnly={isReadOnly}
                          max={new Date().toISOString().slice(0, 10)}
                          className="w-full rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[14px] text-[#1e293b] dark:text-slate-100"
                          required={!isReadOnly}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {isReadOnly ? (
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
                  <div className="space-y-1">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                        className="h-5 w-5 rounded border-[#cbd5e1] dark:border-slate-600 text-[#2563eb] focus:ring-[#2563eb] checked:bg-[#2563eb]"
                      />
                      <span className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
                        I have verified the payout amount and payment proof.
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5 pl-8 text-[12px] text-[#64748b] dark:text-slate-400">
                      <ShieldCheck size={14} className="text-[#64748b] dark:text-slate-400" />
                      <span>Approval will be recorded in the payout history.</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {onRejectRequest && (
                      <button
                        type="button"
                        onClick={onRejectRequest}
                        disabled={submitting}
                        className="rounded-lg border border-red-500/40 bg-red-500/5 px-6 py-2.5 text-[14px] font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}
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
                      disabled={!canSubmit}
                      className="rounded-lg bg-[#2563eb] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          Approving…
                        </span>
                      ) : (
                        `Approve LKR ${formatMoney(finalPayoutLkr)}`
                      )}
                    </button>
                  </div>
                </div>
                )}
              </form>
            </div>
          </motion.div>

          <AdminPinGateModal
            open={pinGateOpen}
            onClose={closePinGate}
            onVerified={handlePinVerified}
            apiBase={apiBase}
            busy={submitting}
            elevated={elevated}
            titleId="wallet-approve-pin-title"
            inputId="wallet-approve-pin"
            description="Enter your admin password to verify you are authorized to approve this payout."
          />
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
