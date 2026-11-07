'use client';

import { useThemeStore, type Theme } from '@/store/themeStore';
import type { OrderMode, OrderStatus } from '@/types';

const STATUS_FILL: Record<Theme, Record<OrderStatus, string>> = {
  dark: {
    RECEIVED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    PREPARING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    READY: 'bg-green-500/15 text-green-400 border-green-500/30',
    OUT_FOR_DELIVERY: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    DELIVERED: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  light: {
    RECEIVED: 'bg-blue-500/10 text-blue-700 border-blue-300/55',
    PREPARING: 'bg-amber-500/10 text-amber-700 border-amber-300/55',
    READY: 'bg-green-500/10 text-green-700 border-green-300/55',
    OUT_FOR_DELIVERY: 'bg-orange-500/10 text-orange-700 border-orange-300/55',
    DELIVERED: 'bg-teal-500/10 text-teal-700 border-teal-300/55',
    CANCELLED: 'bg-red-500/10 text-red-700 border-red-300/55',
  },
};

function statusLabel(status: OrderStatus, orderMode: OrderMode): string {
  if (status === 'DELIVERED' && orderMode === 'TAKEAWAY') return 'Picked up';
  const labels: Record<OrderStatus, string> = {
    RECEIVED: 'Received',
    PREPARING: 'Preparing',
    READY: 'Ready',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };
  return labels[status];
}

type Props = {
  status: string;
  orderMode: string;
};

export default function AdminOrderStatusReadonly({ status, orderMode }: Props) {
  const theme = useThemeStore((s) => s.theme);
  const orderStatus = status as OrderStatus;
  const mode = orderMode as OrderMode;
  const fill = STATUS_FILL[theme][orderStatus] ?? STATUS_FILL[theme].RECEIVED;

  return (
    <span
      className={`inline-flex items-center justify-center text-xs font-semibold border rounded-lg px-3 py-1.5 whitespace-nowrap select-none ${fill}`}
      aria-label={`Status: ${statusLabel(orderStatus, mode)}`}
    >
      {statusLabel(orderStatus, mode)}
    </span>
  );
}
