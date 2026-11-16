import { Banknote, Building2, FileCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type PaymentMethodKey = 'BANK_TRANSFER' | 'CASH' | 'CHECK';

export const WITHDRAWAL_METHOD_META: Record<
  PaymentMethodKey,
  { label: string; icon: LucideIcon; chipClass: string; iconClass: string }
> = {
  BANK_TRANSFER: {
    label: 'Bank Transfer',
    icon: Building2,
    chipClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20',
    iconClass: 'text-sky-600 dark:text-sky-400',
  },
  CASH: {
    label: 'Cash',
    icon: Banknote,
    chipClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  CHECK: {
    label: 'Check',
    icon: FileCheck,
    chipClass: 'bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-amber-500/20',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
};

export function formatWithdrawalCheckPaymentDetail(
  checkNumber?: string | null,
  checkDate?: string | null,
): string | null {
  const parts: string[] = [];
  const num = checkNumber?.trim();
  if (num) parts.push(`No. ${num}`);
  if (checkDate) {
    const d = new Date(`${checkDate.slice(0, 10)}T12:00:00`);
    parts.push(
      d.toLocaleDateString('en-LK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
