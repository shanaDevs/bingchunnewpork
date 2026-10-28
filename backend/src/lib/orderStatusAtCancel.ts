import type { OrderStatus } from '@prisma/client';

type StatusEvent = {
  status: string;
  createdAt: string | Date;
};

export function getOrderStatusAtCancellation(params: {
  statusEvents?: StatusEvent[] | null;
}): OrderStatus | null {
  const events = [...(params.statusEvents ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const cancelledIdx = events.findIndex((event) => event.status === 'CANCELLED');
  if (cancelledIdx < 0) return null;

  for (let i = cancelledIdx - 1; i >= 0; i--) {
    if (events[i].status !== 'CANCELLED') {
      return events[i].status as OrderStatus;
    }
  }

  return 'RECEIVED';
}
