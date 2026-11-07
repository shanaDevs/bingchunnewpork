'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Hash } from 'lucide-react';
import { formatTime } from '@/lib/datetime';

type Props = {
  queuePosition?: number | null;
  scheduledPickupAt?: string | null;
  estimatedMinutes?: number;
  status: string;
};

function minutesUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 60000));
}

export default function TakeawayPickupQueue({
  queuePosition,
  scheduledPickupAt,
  estimatedMinutes,
  status,
}: Props) {
  const [minsLeft, setMinsLeft] = useState<number | null>(minutesUntil(scheduledPickupAt ?? null));

  useEffect(() => {
    if (!scheduledPickupAt) return;
    const tick = () => setMinsLeft(minutesUntil(scheduledPickupAt));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [scheduledPickupAt]);

  if (!queuePosition && !scheduledPickupAt) return null;

  const pickupLabel = scheduledPickupAt ? formatTime(scheduledPickupAt) : null;

  const isReady = status === 'READY';
  const progressPct = scheduledPickupAt
    ? Math.min(
        100,
        Math.max(
          5,
          100 -
            ((minsLeft ?? estimatedMinutes ?? 15) /
              Math.max(estimatedMinutes ?? 15, 15)) *
              100
        )
      )
    : isReady
      ? 100
      : 40;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="takeaway-pickup-queue card p-5 mb-5"
    >
      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
        Pickup queue
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {queuePosition != null && (
          <div className="takeaway-pickup-queue__stat rounded-xl bg-navy-light p-3 text-center">
            <Hash size={16} className="mx-auto text-brand mb-1" />
            <p className="text-[10px] uppercase tracking-wide text-muted">Your number</p>
            <p className="text-2xl font-bold text-brand">{queuePosition}</p>
          </div>
        )}
        {pickupLabel && (
          <div className="takeaway-pickup-queue__stat rounded-xl bg-navy-light p-3 text-center">
            <Clock size={16} className="mx-auto text-brand mb-1" />
            <p className="text-[10px] uppercase tracking-wide text-muted">Pick up at</p>
            <p className="text-xl font-bold text-white">{pickupLabel}</p>
            {minsLeft != null && !isReady && (
              <p className="text-xs text-muted mt-0.5">~{minsLeft} min</p>
            )}
          </div>
        )}
      </div>

      <div className="order-tracking-progress__track" role="progressbar" aria-valuenow={Math.round(progressPct)}>
        <motion.div
          className="order-tracking-progress__fill"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
      <p className="text-xs text-muted mt-2 text-center">
        {isReady
          ? 'Your order is ready — please collect at the counter!'
          : minsLeft != null && minsLeft <= 5
            ? 'Almost ready — head to the store soon!'
            : 'We will notify you 5 minutes before pickup'}
      </p>
    </motion.div>
  );
}
