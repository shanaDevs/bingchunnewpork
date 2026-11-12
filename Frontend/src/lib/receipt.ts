import type { Order, PaymentMethod } from '@/types';
import { formatDateTime } from '@/lib/datetime';
import { resolveCustomerDisplayName } from '@/lib/customerName';
import { formatDrinkOptionLine } from '@/lib/drinkOptions';
export {
  ONLINE_PAYMENT_LABEL,
  PAYMENT_METHOD_LABELS,
  formatOrderPaymentMethodLabel,
  isOnlineOrderPaymentMethod,
} from '@/lib/paymentMethodLabels';

export function formatReceiptDate(iso: string): string {
  return formatDateTime(iso, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMoney(amount: number): string {
  return `LKR ${formatMoneyAmount(amount)}`;
}

export function formatMoneyAmount(amount: number): string {
  return amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSize(size: string): string {
  return size.charAt(0) + size.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function itemOptionLine(item: Order['items'][0]): string {
  const drink = formatDrinkOptionLine({
    iceLevel: item.iceLevel,
    sugarLevel: item.sugarLevel,
  });
  return drink ? `${formatSize(item.size)} · ${drink}` : formatSize(item.size);
}

export function customerLabel(order: Order): string | null {
  const label = resolveCustomerDisplayName({
    guestName: order.guestName,
    userName: order.user?.name,
    phone: order.user?.phone ?? order.guestPhone,
    fallback: '',
  });
  return label || null;
}

export function customerPhone(order: Order): string | null {
  return order.user?.phone ?? order.guestPhone ?? null;
}

const ONLINE_METHODS = ['PAYHERE', 'CARD'] as const;

export function isOrderPaid(order: Pick<Order, 'paymentStatus' | 'paymentMethod'>): boolean {
  return order.paymentStatus === 'PAID';
}

export function getPaymentStatusLabel(
  order: Pick<Order, 'paymentStatus' | 'paymentMethod'>
): string {
  if (isOrderPaid(order)) return '✓ Paid';
  if (order.paymentStatus === 'FAILED') return 'Payment failed';
  if (ONLINE_METHODS.includes(order.paymentMethod as (typeof ONLINE_METHODS)[number])) {
    return 'Pending payment';
  }
  if (order.paymentMethod === 'CASH_AT_COUNTER') return 'Unpaid';
  if (order.paymentMethod === 'LOYALTY_POINTS') return '✓ Paid (points)';
  return order.paymentStatus;
}
