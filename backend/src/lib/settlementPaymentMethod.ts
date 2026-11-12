export const SETTLEMENT_PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'CASH',
  'CHECK',
  'ONLINE',
] as const;

export type SettlementPaymentMethodKey = (typeof SETTLEMENT_PAYMENT_METHODS)[number];

export function settlementPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Bank Transfer';
    case 'CHECK':
      return 'Check';
    case 'ONLINE':
      return 'Online';
    case 'CASH':
      return 'Cash';
    default:
      return method;
  }
}

function formatCheckDateLabel(value: Date | string): string {
  const d =
    typeof value === 'string'
      ? new Date(`${value.slice(0, 10)}T12:00:00.000Z`)
      : value;
  return d.toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Human-readable payment method for tables, including cheque number and date when present. */
export function formatSettlementPaymentMethodDisplay(
  method: string,
  options?: { checkNumber?: string | null; checkDate?: Date | string | null },
): string {
  const label = settlementPaymentMethodLabel(method);
  if (method !== 'CHECK') return label;

  const parts = [label];
  const num = options?.checkNumber?.trim();
  if (num) parts.push(`No. ${num}`);
  if (options?.checkDate) parts.push(formatCheckDateLabel(options.checkDate));
  return parts.join(' · ');
}
