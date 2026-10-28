import { api } from '@/lib/api';
import type { Order } from '@/types';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PaymentPollResult = 'PAID' | 'FAILED' | 'PENDING';

export async function pollOrderPaymentStatus(
  orderNumber: string,
  options?: { maxAttempts?: number; intervalMs?: number },
): Promise<PaymentPollResult> {
  const maxAttempts = options?.maxAttempts ?? 30;
  const intervalMs = options?.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const order = await api.get<Order>(`/orders/${encodeURIComponent(orderNumber)}`);
      if (order.paymentStatus === 'PAID') return 'PAID';
      if (order.paymentStatus === 'FAILED') return 'FAILED';
    } catch {
      /* keep polling — webhook may still be in flight */
    }
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  return 'PENDING';
}
