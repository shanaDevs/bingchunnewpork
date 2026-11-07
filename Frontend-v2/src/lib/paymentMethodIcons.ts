import { CreditCard, Store, Coins, type LucideIcon } from 'lucide-react';

/** Canonical icons by payment method — avoids mojibake from DB-stored emoji. */
const PAYMENT_METHOD_ICONS: Record<string, LucideIcon> = {
  PAYHERE: CreditCard,
  CARD: CreditCard,
  CASH_AT_COUNTER: Store,
  LOYALTY_POINTS: Coins,
};

export function getPaymentMethodIcon(methodId: string): LucideIcon {
  return PAYMENT_METHOD_ICONS[methodId] ?? CreditCard;
}
