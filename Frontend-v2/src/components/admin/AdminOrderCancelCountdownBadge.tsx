'use client';

import { useEffect, useMemo, useState } from 'react';
import { Timer } from 'lucide-react';
import { formatCountdown, secondsUntil } from '@/lib/orderCancel';

type Row = {
  status: string;
  createdAt: string;
  canCancel?: boolean;
  cancelWindowEndsAt?: string | null;
};

function resolveCancelWindowEndsAt(order: Row): string | null {
  if (order.cancelWindowEndsAt) return order.cancelWindowEndsAt;
  return null;
}

function resolveCanCancel(order: Row, endsAt: string | null): boolean {
  if (order.canCancel != null) return order.canCancel;
  return order.status === 'RECEIVED' && endsAt != null && secondsUntil(endsAt) > 0;
}

export default function AdminOrderCancelCountdownBadge({ order }: { order: Row }) {
  const endsAt = useMemo(() => resolveCancelWindowEndsAt(order), [order]);
  const canCancel = resolveCanCancel(order, endsAt);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(endsAt));

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setSecondsLeft(secondsUntil(endsAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (order.status !== 'RECEIVED' || !canCancel || !endsAt || secondsLeft <= 0) return null;

  return (
    <span className="admin-order-cancel-countdown-badge admin-order-cancel-countdown-badge--blink">
      <Timer size={14} aria-hidden />
      {formatCountdown(secondsLeft)}
    </span>
  );
}
