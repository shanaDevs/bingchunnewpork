import { lkrToCents } from './moneyDecimal';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { insertWalletSecurityAuditRow } from './walletSecurityAuditSchema';

export type WalletSecurityAuditOutcome = 'success' | 'denied';

export type WalletSecurityAuditEvent = {
  event:
    | 'wallet.adjustment'
    | 'wallet.withdrawal.approve'
    | 'wallet.withdrawal.reject'
    | 'wallet.withdrawal.cancel'
    | 'wallet.withdrawal.request'
    | 'wallet.payout.initiate'
    | 'wallet.settle'
    | 'wallet.sync'
    | 'wallet.pin.verify'
    | 'delivery.payout.create'
    | 'delivery.payout.approve'
    | 'delivery.payout.pay'
    | 'delivery.payout.reject'
    | 'delivery.payout.cancel'
    | 'delivery.payout.proof_attach'
    | 'delivery.wallet.unlock'
    | 'payment.payhere.notify_invalid';
  outcome: WalletSecurityAuditOutcome;
  actorId?: string | null;
  actorRole?: string | null;
  storeId?: string | null;
  amountCents?: number | null;
  reference?: string | null;
  withdrawalId?: string | null;
  transactionId?: string | null;
  payoutId?: string | null;
  clientIp?: string | null;
  reason?: string | null;
  orderNumber?: string | null;
};

function toAuditInsertRow(event: WalletSecurityAuditEvent) {
  return {
    event: event.event,
    outcome: event.outcome,
    actorId: event.actorId ?? null,
    actorRole: event.actorRole ?? null,
    storeId: event.storeId ?? null,
    amountCents: event.amountCents ?? null,
    reference: event.reference ?? null,
    withdrawalId: event.withdrawalId ?? null,
    transactionId: event.transactionId ?? null,
    payoutId: event.payoutId ?? null,
    clientIp: event.clientIp ?? null,
    reason: event.reason ?? null,
    orderNumber: event.orderNumber ?? null,
  };
}

/** Structured security audit line for wallet and payment-sensitive actions (no secrets). */
export function logWalletSecurityEvent(event: WalletSecurityAuditEvent): void {
  logger.info('[wallet-security]', {
    kind: 'wallet_security_audit',
    ...event,
  });
  void insertWalletSecurityAuditRow(toAuditInsertRow(event)).catch((err) => {
    logger.error('[wallet-security] failed to persist audit row', { err, event: event.event });
  });
}

export function clientIpFromRequest(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
}): string | undefined {
  const ip = req.ip?.trim() || req.socket?.remoteAddress?.trim();
  return ip || undefined;
}

type RequestActor = { sub?: string | null; role?: string | null };

/** Attach actor + client IP from an Express request (default outcome: success). */
export function logWalletSecurityEventFromRequest(
  req: { ip?: string; socket?: { remoteAddress?: string } },
  user: RequestActor,
  event: Omit<WalletSecurityAuditEvent, 'actorId' | 'actorRole' | 'clientIp' | 'outcome'> & {
    outcome?: WalletSecurityAuditOutcome;
  },
): void {
  const { outcome = 'success', ...rest } = event;
  logWalletSecurityEvent({
    outcome,
    actorId: user.sub,
    actorRole: user.role,
    clientIp: clientIpFromRequest(req),
    ...rest,
  });
}

/** Delivery payout API amounts are LKR; audit logs use integer cents. */
export function deliveryPayoutAmountCents(amountLkr: number): number {
  return lkrToCents(amountLkr);
}

type PinGatedAuditEvent = 'wallet.pin.verify' | 'delivery.wallet.unlock';

/** Log denied outcome when PIN verification fails with 401. */
export function logPinGatedDeniedIf401(
  req: { ip?: string; socket?: { remoteAddress?: string } },
  user: RequestActor,
  event: PinGatedAuditEvent,
  err: unknown,
): void {
  if (err instanceof AppError && err.statusCode === 401) {
    logWalletSecurityEventFromRequest(req, user, { event, outcome: 'denied' });
  }
}

type DeliveryPayoutAuditEvent = Extract<
  WalletSecurityAuditEvent['event'],
  | 'delivery.payout.create'
  | 'delivery.payout.approve'
  | 'delivery.payout.pay'
  | 'delivery.payout.reject'
  | 'delivery.payout.cancel'
  | 'delivery.payout.proof_attach'
>;

export function logDeliveryPayoutAuditFromRequest(
  req: { ip?: string; socket?: { remoteAddress?: string } },
  user: RequestActor,
  event: DeliveryPayoutAuditEvent,
  payout: { id: string; amount: number },
  extra?: Partial<Pick<WalletSecurityAuditEvent, 'reason' | 'outcome'>>,
): void {
  logWalletSecurityEventFromRequest(req, user, {
    event,
    payoutId: payout.id,
    amountCents: deliveryPayoutAmountCents(payout.amount),
    ...extra,
  });
}
