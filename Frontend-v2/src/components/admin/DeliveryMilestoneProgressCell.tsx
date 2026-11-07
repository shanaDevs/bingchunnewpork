'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import BrandedChartTooltipShell from '@/components/ui/BrandedChartTooltipShell';
import {
  getMilestoneConnectorColor,
  getMilestoneConnectorFill,
  getMilestoneStepColor,
  getMilestoneStepDotColor,
  getMilestoneStepState,
  MILESTONE_LABELS,
  type DeliveryMilestoneProgress,
} from '@/lib/deliveryAccessMilestones';

type Props = {
  milestone: DeliveryMilestoneProgress;
};

const STEP_COUNT = 3;

type TooltipPosition = {
  x: number;
  y: number;
};

function statusBadge(milestone: DeliveryMilestoneProgress) {
  if (milestone.status === 'active') {
    return (
      <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
        Delivery active
      </span>
    );
  }
  if (milestone.status === 'ready') {
    return (
      <span className="inline-block rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-500">
        Ready for review
      </span>
    );
  }
  return null;
}

function MilestoneProgressTooltip({ milestone }: { milestone: DeliveryMilestoneProgress }) {
  const title =
    milestone.status === 'active'
      ? 'Delivery active'
      : milestone.status === 'ready'
        ? 'Ready for review'
        : `Milestone ${milestone.currentIndex + 1} · ${milestone.currentLabel}`;

  return (
    <BrandedChartTooltipShell className="min-w-44">
      <div className="font-medium text-foreground">{title}</div>
      <div className="grid gap-1.5">
        {milestone.thresholds.map((target, index) => {
          const met = milestone.status === 'active' || milestone.ordersThisMonth >= target;
          const state = getMilestoneStepState(milestone, index);
          return (
            <div key={MILESTONE_LABELS[index]} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: getMilestoneStepDotColor(milestone, index) }}
                />
                <span className={met ? 'text-foreground' : 'text-muted-foreground'}>
                  {MILESTONE_LABELS[index]}
                </span>
              </div>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {target.toLocaleString()}
                {state === 'current' ? (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({Math.round(milestone.progressPercent)}%)
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-1.5 font-semibold text-foreground">
        <span>This month</span>
        <span className="font-mono tabular-nums">
          {milestone.ordersThisMonth.toLocaleString()} orders
        </span>
      </div>
    </BrandedChartTooltipShell>
  );
}

function MilestoneConnector({
  milestone,
  connectorIndex,
}: {
  milestone: DeliveryMilestoneProgress;
  connectorIndex: number;
}) {
  const fill = getMilestoneConnectorFill(milestone, connectorIndex);
  const fillColor = getMilestoneConnectorColor(milestone, connectorIndex);

  return (
    <div className="relative h-1 min-w-[1.75rem] flex-1 overflow-hidden rounded-full bg-navy-border/70">
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${fillColor}`}
        style={{ width: `${Math.max(fill, 0)}%` }}
      />
    </div>
  );
}

function MilestoneStep({
  milestone,
  stepIndex,
}: {
  milestone: DeliveryMilestoneProgress;
  stepIndex: number;
}) {
  const state = getMilestoneStepState(milestone, stepIndex);
  const colorClass = getMilestoneStepColor(milestone, stepIndex, state);

  return (
    <div
      className={[
        'relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300',
        colorClass,
        state === 'current' ? 'ring-2 ring-white/30 ring-offset-1 ring-offset-[var(--color-card)]' : '',
      ].join(' ')}
      aria-current={state === 'current' ? 'step' : undefined}
    >
      {stepIndex + 1}
    </div>
  );
}

export default function DeliveryMilestoneProgressCell({ milestone }: Props) {
  const isActive = milestone.status === 'active';
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const caption =
    milestone.nextTarget != null
      ? `${milestone.ordersThisMonth} / ${milestone.nextTarget} orders`
      : `${milestone.ordersThisMonth} orders this month`;

  function showTooltip(event: React.MouseEvent<HTMLDivElement>) {
    setTooltipPos({ x: event.clientX, y: event.clientY });
  }

  function moveTooltip(event: React.MouseEvent<HTMLDivElement>) {
    setTooltipPos({ x: event.clientX, y: event.clientY });
  }

  function hideTooltip() {
    setTooltipPos(null);
  }

  return (
    <>
      <div
        className="min-w-[160px]"
        onMouseEnter={showTooltip}
        onMouseMove={moveTooltip}
        onMouseLeave={hideTooltip}
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] font-medium text-muted">
            {isActive
              ? 'Delivery active'
              : milestone.status === 'ready'
                ? milestone.currentLabel
                : `Milestone ${milestone.currentIndex + 1} · ${milestone.currentLabel}`}
          </span>
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-fg">
            {Math.round(milestone.progressPercent)}%
          </span>
        </div>

        <div
          className="mt-2 flex w-full cursor-default items-center"
          role="group"
          aria-label={`Milestone progress: step ${milestone.currentIndex + 1} of ${STEP_COUNT}, ${Math.round(milestone.progressPercent)}%`}
        >
          {Array.from({ length: STEP_COUNT }, (_, stepIndex) => (
            <div key={stepIndex} className="contents">
              {stepIndex > 0 && (
                <MilestoneConnector milestone={milestone} connectorIndex={stepIndex - 1} />
              )}
              <MilestoneStep milestone={milestone} stepIndex={stepIndex} />
            </div>
          ))}
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="truncate text-[10px] text-muted">{caption}</span>
          {statusBadge(milestone)}
        </div>
      </div>

      {portalReady &&
        tooltipPos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
          >
            <MilestoneProgressTooltip milestone={milestone} />
          </div>,
          document.body,
        )}
    </>
  );
}
