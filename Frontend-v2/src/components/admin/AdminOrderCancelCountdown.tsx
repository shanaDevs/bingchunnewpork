'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { formatCountdown, secondsUntil, getFullRefundCancelNotice, isCustomerCancelWindowActive } from '@/lib/orderCancel';
import type { Order } from '@/types';

type Props = {
  order: Pick<Order, 'canCancel' | 'cancelWindowEndsAt' | 'paymentMethod' | 'paymentStatus' | 'status'>;
};

export default function AdminOrderCancelCountdown({ order }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    secondsUntil(order.cancelWindowEndsAt ?? null),
  );

  useEffect(() => {
    if (!order.cancelWindowEndsAt) return;
    const tick = () => setSecondsLeft(secondsUntil(order.cancelWindowEndsAt ?? null));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.cancelWindowEndsAt]);

  const showActiveCountdown = isCustomerCancelWindowActive(order, secondsLeft);

  if (!showActiveCountdown) return null;

  const paidOnline =
    (order.paymentMethod === 'PAYHERE' || order.paymentMethod === 'CARD') &&
    order.paymentStatus === 'PAID';
  const refundNotice = paidOnline ? getFullRefundCancelNotice() : null;

  return (
    <div className="order-drawer-reveal mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Timer size={16} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">Customer can cancel this order</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">
            {formatCountdown(secondsLeft)}
            <span className="ml-2 text-sm font-normal text-muted">remaining</span>
          </p>
          {refundNotice && (
            <p className="mt-2 text-xs text-muted">{refundNotice.banner}</p>
          )}
        </div>
      </div>
    </div>
  );
}
