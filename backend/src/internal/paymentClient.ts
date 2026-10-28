import {
  computePlatformProviderReceivable,
  platformProviderReceivableInputFromBreakdownCents,
  platformProviderReceivableToLkr,
  type PlatformProviderReceivableBreakdown,
  type PlatformProviderReceivableInput,
  type PlatformProviderReceivableLkr,
} from '@bingchun/settlement';
import { config } from '../config';
import { logger } from '../utils/logger';

export type PlatformProviderReceivablePayload = PlatformProviderReceivableBreakdown & {
  lkr: PlatformProviderReceivableLkr;
};

async function fetchFromPaymentService(
  input: PlatformProviderReceivableInput,
): Promise<PlatformProviderReceivableBreakdown> {
  const url = `${config.paymentServiceUrl}/payment-api/internal/platform-provider-receivable`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': config.internalServiceSecret,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error(`Payment service platform-provider-receivable failed: ${res.status} ${text}`);
    throw new Error(`Payment service error (${res.status})`);
  }

  const json = (await res.json()) as {
    success?: boolean;
    data?: { breakdown: PlatformProviderReceivableBreakdown };
  };
  if (!json.data?.breakdown) {
    throw new Error('Payment service returned invalid platform provider receivable payload');
  }
  return json.data.breakdown;
}

export async function resolvePlatformProviderReceivable(
  input: PlatformProviderReceivableInput,
): Promise<PlatformProviderReceivableBreakdown> {
  if (config.paymentServiceEnabled) {
    return fetchFromPaymentService(input);
  }
  return computePlatformProviderReceivable(input);
}

export async function resolvePlatformProviderReceivableFromBreakdown(
  breakdown: Parameters<typeof platformProviderReceivableInputFromBreakdownCents>[0],
): Promise<PlatformProviderReceivablePayload> {
  const input = platformProviderReceivableInputFromBreakdownCents(breakdown);
  const receivable = await resolvePlatformProviderReceivable(input);
  return {
    ...receivable,
    lkr: platformProviderReceivableToLkr(receivable),
  };
}
