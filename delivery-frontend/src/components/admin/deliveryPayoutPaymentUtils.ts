import { Banknote, Building2, FileCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type DeliveryPayoutPaymentMethodKey = 'BANK_TRANSFER' | 'CASH' | 'CHECK';

export const DELIVERY_PAYOUT_METHOD_META: Record<
  DeliveryPayoutPaymentMethodKey,
  { label: string; icon: LucideIcon; chipClass: string; iconClass: string }
> = {
  BANK_TRANSFER: {
    label: 'Bank transfer',
    icon: Building2,
    chipClass: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
    iconClass: 'text-sky-400',
  },
  CASH: {
    label: 'Cash',
    icon: Banknote,
    chipClass: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
    iconClass: 'text-emerald-400',
  },
  CHECK: {
    label: 'Check',
    icon: FileCheck,
    chipClass: 'bg-amber-500/10 text-amber-200 ring-amber-500/20',
    iconClass: 'text-amber-400',
  },
};

export function deliveryPayoutPaymentMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  const key = method as DeliveryPayoutPaymentMethodKey;
  return DELIVERY_PAYOUT_METHOD_META[key]?.label ?? method.replace(/_/g, ' ').toLowerCase();
}
