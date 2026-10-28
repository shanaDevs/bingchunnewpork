'use client';

import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Ban,
  ChefHat,
  Circle,
  Package,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import type { Refund, OrderStatus } from '@/types';
import { getStatusLabel } from '@/lib/orderStatus';
import { formatReceiptDate } from '@/lib/receipt';

const RECEIVED_MERGE_WINDOW_MS = 120_000;

const ORDER_STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Order received',
  PREPARING: 'Preparing',
  READY: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Order cancelled',
};

type TimelineTone = 'default' | 'cancel' | 'refund';

type TimelineKind =
  | 'placed'
  | 'received'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_requested'
  | 'refund_approved'
  | 'refund_rejected'
  | 'other';

export type TimelineEntry = {
  id: string;
  label: string;
  at: string;
  tone: TimelineTone;
  kind: TimelineKind;
  sortTie: number;
};

const KIND_ICONS: Record<TimelineKind, LucideIcon> = {
  placed: ShoppingBag,
  received: Package,
  preparing: ChefHat,
  ready: PackageCheck,
  out_for_delivery: Truck,
  delivered: PackageCheck,
  cancelled: XCircle,
  refund_requested: RotateCcw,
  refund_approved: BadgeCheck,
  refund_rejected: Ban,
  other: Circle,
};

function statusToKind(status: string): TimelineKind {
  switch (status) {
    case 'RECEIVED':
      return 'received';
    case 'PREPARING':
      return 'preparing';
    case 'READY':
      return 'ready';
    case 'OUT_FOR_DELIVERY':
      return 'out_for_delivery';
    case 'DELIVERED':
      return 'delivered';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'other';
  }
}

export function buildRefundOrderTimeline(
  refund: Refund,
  order: NonNullable<Refund['order']>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: 'order-placed',
      label: 'Order placed',
      at: order.createdAt,
      tone: 'default',
      kind: 'placed',
      sortTie: 0,
    },
  ];

  const statusEvents = [...(order.statusEvents ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const seenStatuses = new Set<string>();
  const earliest = statusEvents[0];
  let skipEventId: string | null = null;

  if (earliest?.status === 'RECEIVED') {
    const deltaMs = Math.abs(
      new Date(earliest.createdAt).getTime() - new Date(order.createdAt).getTime(),
    );
    if (deltaMs <= RECEIVED_MERGE_WINDOW_MS) {
      skipEventId = earliest.id;
      seenStatuses.add('RECEIVED');
    }
  }

  statusEvents.forEach((event, index) => {
    if (event.id === skipEventId) return;
    if (seenStatuses.has(event.status)) return;
    seenStatuses.add(event.status);

    entries.push({
      id: `order-status-${event.id}`,
      label: ORDER_STATUS_LABELS[event.status] ?? event.status.replace(/_/g, ' '),
      at: event.createdAt,
      tone: event.status === 'CANCELLED' ? 'cancel' : 'default',
      kind: statusToKind(event.status),
      sortTie: index + 1,
    });
  });

  entries.push({
    id: 'refund-requested',
    label: 'Refund requested',
    at: refund.createdAt,
    tone: 'refund',
    kind: 'refund_requested',
    sortTie: 100,
  });

  if (refund.processedAt) {
    const rejected = refund.status === 'REJECTED';
    entries.push({
      id: 'refund-approved',
      label: rejected ? 'Refund rejected' : 'Refund approved',
      at: refund.processedAt,
      tone: rejected ? 'cancel' : 'refund',
      kind: rejected ? 'refund_rejected' : 'refund_approved',
      sortTie: 101,
    });
  }

  return entries.sort((a, b) => {
    const timeDiff = new Date(a.at).getTime() - new Date(b.at).getTime();
    return timeDiff !== 0 ? timeDiff : a.sortTie - b.sortTie;
  });
}

export function getOrderStatusAtCancellation(
  order: NonNullable<Refund['order']>,
): OrderStatus | null {
  const events = [...(order.statusEvents ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const cancelledIdx = events.findIndex((event) => event.status === 'CANCELLED');
  if (cancelledIdx < 0) return null;

  for (let i = cancelledIdx - 1; i >= 0; i--) {
    if (events[i].status !== 'CANCELLED') {
      return events[i].status;
    }
  }

  return 'RECEIVED';
}

interface RefundOrderTimelineProps {
  refund: Refund;
  order: NonNullable<Refund['order']>;
  className?: string;
}

export default function RefundOrderTimeline({
  refund,
  order,
  className,
}: RefundOrderTimelineProps) {
  const timeline = useMemo(() => buildRefundOrderTimeline(refund, order), [refund, order]);
  const statusAtCancel = useMemo(() => getOrderStatusAtCancellation(order), [order]);
  const statusAtCancelLabel = statusAtCancel
    ? getStatusLabel(statusAtCancel, order.orderMode)
    : null;

  return (
    <div className={`refund-order-timeline${className ? ` ${className}` : ''}`}>
      {statusAtCancelLabel && (
        <div className="refund-order-timeline__cancel-status">
          <p className="refund-order-timeline__cancel-status-label">Cancelled at status</p>
          <p className="refund-order-timeline__cancel-status-value">{statusAtCancelLabel}</p>
        </div>
      )}
      <p className="refund-order-timeline__title">Order timeline</p>
      <ol className="refund-order-timeline__track" aria-label="Order timeline">
        {timeline.map((entry, index) => {
          const Icon = KIND_ICONS[entry.kind];
          const isCurrent = index === timeline.length - 1;

          return (
            <li
              key={entry.id}
              className="refund-order-timeline__step"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={`refund-order-timeline__dot refund-order-timeline__dot--${entry.tone}${
                  isCurrent ? ' refund-order-timeline__dot--current' : ''
                }`}
              >
                <Icon size={14} aria-hidden />
              </span>
              <div className="refund-order-timeline__body">
                <p
                  className={`refund-order-timeline__label${
                    isCurrent ? ' refund-order-timeline__label--current' : ''
                  }`}
                >
                  {entry.label}
                </p>
                <time dateTime={entry.at} className="refund-order-timeline__date">
                  {formatReceiptDate(entry.at)}
                </time>
              </div>
              {index < timeline.length - 1 && (
                <span className="refund-order-timeline__line" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
