export type WalletSecurityAuditScope = 'Branch wallet' | 'Delivery wallet' | 'Payments';

export function walletSecurityAuditScope(event: string): WalletSecurityAuditScope {
  if (event.startsWith('delivery.')) return 'Delivery wallet';
  if (event.startsWith('payment.')) return 'Payments';
  return 'Branch wallet';
}

const EVENT_LABELS: Record<string, string> = {
  'wallet.pin.verify': 'Branch wallet PIN verified',
  'wallet.sync': 'Sync payments to branch wallets',
  'wallet.adjustment': 'Manual wallet adjustment',
  'wallet.settle': 'Settle branch wallet period',
  'wallet.payout.initiate': 'Initiate branch payout',
  'wallet.withdrawal.request': 'Branch payout requested',
  'wallet.withdrawal.approve': 'Branch payout approved',
  'wallet.withdrawal.reject': 'Branch payout rejected',
  'wallet.withdrawal.cancel': 'Branch payout cancelled',
  'delivery.wallet.unlock': 'Delivery wallet unlocked',
  'delivery.payout.create': 'Delivery payout created',
  'delivery.payout.approve': 'Delivery payout approved',
  'delivery.payout.pay': 'Delivery payout paid',
  'delivery.payout.reject': 'Delivery payout rejected',
  'delivery.payout.cancel': 'Delivery payout cancelled',
  'delivery.payout.proof_attach': 'Delivery payout proof attached',
  'payment.payhere.notify_invalid': 'PayHere notify rejected',
};

export function walletSecurityAuditLabel(event: string): string {
  return EVENT_LABELS[event] ?? event.replace(/\./g, ' · ');
}
