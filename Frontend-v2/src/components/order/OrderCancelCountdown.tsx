'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2, Package, Timer } from 'lucide-react';
import { confirmDialog } from '@/store/confirmStore';
import { askCancellationReason } from '@/store/cancellationReasonStore';
import {
  formatCountdown,
  getCancelCardTitle,
  getCashCancelNotice,
  getFullRefundCancelNotice,
  getPartialRefundCancelNotice,
  isOnlinePaidOrder,
  secondsUntil,
} from '@/lib/orderCancel';
import type { Order, OrderStatus } from '@/types';

type Props = {
  orderNumber: string;
  status: OrderStatus;
  cancelWindowEndsAt?: string | null;
  cancelRefundTier?: 'full' | 'partial' | null;
  cancelWindowMinutes?: number;
  paymentMethod: Order['paymentMethod'];
  paymentStatus: Order['paymentStatus'];
  onCancel: (reason: string, customText?: string) => Promise<void>;
  isCancelling?: boolean;
};

function buildConfirmMessage(orderNumber: string, confirmLead: string): ReactNode {
  return (
    <>
      Cancel <span className="font-semibold text-fg">#{orderNumber}</span>? {confirmLead}
    </>
  );
}

export default function OrderCancelCountdown({
  orderNumber,
  status,
  cancelWindowEndsAt,
  cancelRefundTier,
  cancelWindowMinutes = 10,
  paymentMethod,
  paymentStatus,
  onCancel,
  isCancelling = false,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    secondsUntil(cancelWindowEndsAt ?? null),
  );
  const paidOnline = isOnlinePaidOrder({ paymentMethod, paymentStatus });
  const fullNotice = getFullRefundCancelNotice(cancelWindowMinutes);
  const partialNotice = getPartialRefundCancelNotice({
    status,
    paymentMethod,
    paymentStatus,
  });
  const cashNotice = getCashCancelNotice(status);

  useEffect(() => {
    if (!cancelWindowEndsAt) return;
    const tick = () => setSecondsLeft(secondsUntil(cancelWindowEndsAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cancelWindowEndsAt]);

  const isFullTier =
    cancelRefundTier === 'full' && !!cancelWindowEndsAt && secondsLeft > 0;

  const cardTitle = getCancelCardTitle(status, isFullTier);
  const showPreparingIcon = status === 'PREPARING';
  const showTimerIcon = isFullTier;

  const handleCancel = useCallback(async () => {
    const reasonResult = await askCancellationReason();
    if (!reasonResult) return;

    let message: ReactNode;
    if (isFullTier && paidOnline) {
      message = buildConfirmMessage(orderNumber, fullNotice.confirmLead);
    } else if (partialNotice) {
      message = buildConfirmMessage(orderNumber, partialNotice.confirmLead);
    } else {
      message = buildConfirmMessage(orderNumber, cashNotice.confirmLead);
    }

    const confirmed = await confirmDialog({
      title: 'Cancel this order?',
      message,
      confirmLabel: 'Yes, cancel order',
      cancelLabel: 'Keep order',
      variant: 'danger',
    });
    if (!confirmed) return;

    await onCancel(reasonResult.reason, reasonResult.customText);
  }, [
    onCancel,
    orderNumber,
    paidOnline,
    isFullTier,
    fullNotice,
    partialNotice,
    cashNotice,
  ]);

  return (
    <div className="mb-6 card p-4 border border-amber-500/30 bg-amber-500/10 max-sm:sticky max-sm:top-16 max-sm:z-20">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-fg text-sm flex items-center gap-2">
            {showPreparingIcon && (
              <Package size={16} className="text-yellow-400 shrink-0" />
            )}
            {showTimerIcon && (
              <Timer size={16} className="text-amber-400 shrink-0" />
            )}
            {cardTitle}
          </p>
          {isFullTier ? (
            <>
              <p className="text-2xl font-bold text-fg tabular-nums mt-1">
                {formatCountdown(secondsLeft)}
                <span className="text-sm font-normal text-muted ml-2">remaining</span>
              </p>
              {paidOnline && (
                <p className="text-xs text-muted mt-2">{fullNotice.banner}</p>
              )}
            </>
          ) : partialNotice ? (
            <p className="text-xs text-muted mt-2">{partialNotice.banner}</p>
          ) : (
            <p className="text-xs text-muted mt-2">{cashNotice.banner}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleCancel()}
          disabled={isCancelling}
          className="btn-outline border-red-500/40 text-red-400 hover:bg-red-500/10 px-4 py-2.5 text-sm inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
        >
          {isCancelling ? <Loader2 size={16} className="animate-spin" /> : null}
          Cancel Order
        </button>
      </div>
    </div>
  );
}
