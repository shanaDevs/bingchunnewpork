import type { PaymentMethod } from '@/types';

export const ONLINE_PAYMENT_LABEL = 'Online Payment';

const ORDER_PAYMENT_METHOD_LABELS: Record<string, string> = {
  PAYHERE: ONLINE_PAYMENT_LABEL,
  CARD: ONLINE_PAYMENT_LABEL,
  CASH_AT_COUNTER: 'Cash at Counter',
  LOYALTY_POINTS: 'Loyalty Points',
  CASH_ON_DELIVERY: 'Cash on Delivery',
};

export function formatOrderPaymentMethodLabel(method?: string | null): string {
  if (!method) return '—';
  return (
    ORDER_PAYMENT_METHOD_LABELS[method] ??
    method.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function isOnlineOrderPaymentMethod(method?: string | null): boolean {
  return method === 'PAYHERE' || method === 'CARD';
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: ONLINE_PAYMENT_LABEL,
  PAYHERE: ONLINE_PAYMENT_LABEL,
  CASH_AT_COUNTER: 'Cash at Counter',
  LOYALTY_POINTS: 'Loyalty Points',
};
