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
