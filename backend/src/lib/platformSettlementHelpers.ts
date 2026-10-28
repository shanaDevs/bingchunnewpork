import {
  resolvePlatformProviderReceivableFromBreakdown,
  type PlatformProviderReceivablePayload,
} from '../internal/paymentClient';
import type { PeriodBreakdown } from './walletService';

export type StoredPlatformProviderReceivable = PlatformProviderReceivablePayload;

export async function resolveStoredPlatformProviderReceivable(
  breakdown: unknown,
): Promise<StoredPlatformProviderReceivable> {
  const raw = breakdown as
    | ({ platformProviderReceivable?: StoredPlatformProviderReceivable } & Partial<PeriodBreakdown>)
    | null;

  if (raw?.platformProviderReceivable?.totalPlatformProviderReceivableCents != null) {
    return raw.platformProviderReceivable;
  }

  return resolvePlatformProviderReceivableFromBreakdown(raw ?? {});
}

export function dartCodesReceivesLkrFromBreakdown(receivable: StoredPlatformProviderReceivable): number {
  return receivable.lkr.totalPlatformProviderReceivableLkr;
}
