'use client';

import type { OrderMode, PaymentMethod } from '@/types';
import {
  formatMoney,
  getPaymentStatusLabel,
  PAYMENT_METHOD_LABELS,
} from '@/lib/receipt';

type OrderCheckoutSummaryProps = {
  subtotal: number;
  deliveryFee: number;
  convenientFee: number;
  discount: number;
  loyaltyDiscount: number;
  promoCode?: string | null;
  total: number;
  paymentMethod: PaymentMethod | string;
  paymentStatus: string;
  orderMode?: OrderMode | string;
};

function orderModeLabel(orderMode?: OrderMode | string): string {
  return orderMode === 'DELIVERY' ? 'Delivery' : 'Pickup';
}

export default function OrderCheckoutSummary({
  subtotal,
  deliveryFee,
  convenientFee,
  discount,
  loyaltyDiscount,
  promoCode,
  total,
  paymentMethod,
  paymentStatus,
  orderMode,
}: OrderCheckoutSummaryProps) {
  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]
    ?? paymentMethod;

  return (
    <div className="rounded-xl border border-navy-border bg-navy-light/40 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Payment summary
        </h3>
        {orderMode && (
          <span className="rounded-full border border-navy-border bg-navy-card/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            {orderModeLabel(orderMode)}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between gap-3 py-0.5 text-fg">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(subtotal)}</span>
        </div>

        {deliveryFee > 0 && (
          <div className="flex justify-between gap-3 py-0.5 text-muted">
            <span>Delivery fee</span>
            <span className="tabular-nums">{formatMoney(deliveryFee)}</span>
          </div>
        )}

        {convenientFee > 0 && (
          <div className="flex justify-between gap-3 py-0.5 text-muted">
            <span>Convenience fee</span>
            <span className="tabular-nums">{formatMoney(convenientFee)}</span>
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between gap-3 py-0.5 text-emerald-400">
            <span>Promo{promoCode ? ` (${promoCode})` : ''}</span>
            <span className="tabular-nums">−{formatMoney(discount)}</span>
          </div>
        )}

        {loyaltyDiscount > 0 && (
          <div className="flex justify-between gap-3 py-0.5 text-emerald-400">
            <span>Loyalty discount</span>
            <span className="tabular-nums">−{formatMoney(loyaltyDiscount)}</span>
          </div>
        )}

        <div className="mt-2 flex justify-between gap-3 border-t border-navy-border pt-2">
          <span className="font-medium text-fg">Total</span>
          <span className="text-lg font-bold tabular-nums text-brand">{formatMoney(total)}</span>
        </div>

        <div className="mt-2 space-y-1 border-t border-navy-border pt-2 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-muted">Payment method</span>
            <span className="font-medium text-fg">{paymentMethodLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted">Payment status</span>
            <span className="font-medium text-fg">
              {getPaymentStatusLabel({
                paymentMethod: paymentMethod as PaymentMethod,
                paymentStatus,
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
