'use client';

import { motion } from 'framer-motion';
import type { OrderStatus } from '@/types';
import { formatDateTime } from '@/lib/datetime';
import { isTrackingComplete, type TrackingStep } from '@/lib/orderStatus';

export type { TrackingStep };

interface Props {
  steps: TrackingStep[];
  currentStep: number;
  currentStatus: OrderStatus;
  isDelivery: boolean;
  statusTimestamps?: Partial<Record<string, string>>;
}

function formatStatusChangedAt(iso: string): string {
  return formatDateTime(iso, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderTrackingProgress({
  steps,
  currentStep,
  currentStatus,
  isDelivery,
  statusTimestamps,
}: Props) {
  const isComplete = isTrackingComplete(currentStatus, isDelivery);
  const maxStep = steps.length - 1;
  const progressPct = isComplete ? 100 : Math.max(0, Math.min(100, (currentStep / maxStep) * 100));
  const activeStep = steps[currentStep] ?? steps[0];
  const activeChangedAt = statusTimestamps?.[activeStep.status];

  return (
    <div className="order-tracking-progress">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-light">
            {isDelivery ? 'Delivery progress' : 'Pickup progress'}
          </p>
          <p className="text-sm font-semibold text-white mt-0.5">{activeStep.label}</p>
          <p className="text-xs text-muted mt-0.5">{activeStep.desc}</p>
          {activeChangedAt && (
            <p className="text-[11px] text-muted/90 mt-1 tabular-nums">
              <time dateTime={activeChangedAt}>Updated {formatStatusChangedAt(activeChangedAt)}</time>
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-brand leading-none">{Math.round(progressPct)}%</p>
          <p className="text-[10px] text-muted uppercase tracking-wide mt-1">complete</p>
        </div>
      </div>

      <div className="order-tracking-progress__track" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className="order-tracking-progress__fill"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        {isComplete && (
          <motion.div
            className="order-tracking-progress__shine"
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2 }}
          />
        )}
      </div>

      <div className="order-tracking-progress__steps">
        {steps.map((step, i) => {
          const stepIndex = i;
          const isDone = currentStep > stepIndex || isComplete;
          const isCurrent = currentStep === stepIndex && !isComplete;
          const changedAt = statusTimestamps?.[step.status];
          return (
            <div key={step.status} className="order-tracking-progress__step">
              <div
                className={`order-tracking-progress__dot ${
                  isDone ? 'order-tracking-progress__dot--done' : isCurrent ? 'order-tracking-progress__dot--current' : ''
                }`}
              >
                <step.icon size={12} className={isDone || isCurrent ? 'text-white' : 'text-muted'} />
              </div>
              <div className="order-tracking-progress__step-text">
                <span className={`order-tracking-progress__label ${isDone || isCurrent ? 'text-white' : 'text-muted'}`}>
                  {step.label.replace(/^Order /, '').replace(/^Out for /, '').replace(/^Ready for /, '')}
                </span>
                {changedAt && (isDone || isCurrent) && (
                  <time
                    dateTime={changedAt}
                    className="order-tracking-progress__time"
                    title={formatStatusChangedAt(changedAt)}
                  >
                    {formatStatusChangedAt(changedAt)}
                  </time>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
