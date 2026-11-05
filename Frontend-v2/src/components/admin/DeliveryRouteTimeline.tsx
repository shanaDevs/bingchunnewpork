'use client';

import TimelineScooterIcon from '@/components/admin/TimelineScooterIcon';
import { CheckCircle2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/datetime';
import {
  deriveBranchStartState,
  deriveReturnState,
  deriveStepStates,
  deriveTargetRiderNodeIndex,
  deriveUpcomingNodeIndex,
  isRiderOnLine,
  lastCompletedStopSequence,
  riderLinePositionPercentage,
  riderOccupiedNodeIndex,
  segmentColorBetweenNodes,
  segmentColorToStop,
  isVehicleFailureStop,
  type ReturnNodeState,
  type WizardStepState,
  type WizardStopOrder,
} from '@/lib/deliveryStopProgress';
import { useTimelineRiderPosition } from '@/components/admin/useTimelineRiderPosition';

type Props = {
  orders: WizardStopOrder[];
  jobStatus: string;
  pickedUp: boolean;
  jobId?: string;
  sheetOpen?: boolean;
  startedAt?: string | null;
  returnStartedAt?: string | null;
  completedAt?: string | null;
  /** When set, the first node is a breakdown pickup instead of the outlet branch. */
  pickupLabel?: string | null;
};

type RouteNodeData = {
  key: string;
  state: WizardStepState | ReturnNodeState;
  label: string;
  sublabel?: string;
  timeLabel?: string;
  reasonLabel?: string;
  kind: 'branch' | 'stop' | 'return';
  sequence?: number;
};

const CANCEL_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Out of stock',
  CUSTOMER_REQUEST: 'Customer cancelled',
  PAYMENT_OR_SYSTEM_ISSUE: 'Payment issue',
  CUSTOMER_UNREACHABLE: 'Customer not available',
  WRONG_ADDRESS: 'Wrong / incomplete address',
  REFUSED: 'Customer refused delivery',
  PAYMENT_FAILED: 'Payment issue',
  OTHER: 'Driver error',
};

function formatNodeTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return formatTime(value);
}

function connectorColorToNode(
  dest: RouteNodeData,
  orders: WizardStopOrder[],
  stopStates: WizardStepState[],
): string {
  if (dest.kind === 'stop') {
    const destIndex = dest.sequence != null ? dest.sequence - 1 : -1;
    if (destIndex >= 0) {
      return segmentColorToStop(destIndex, dest.state, orders, stopStates);
    }
  }
  return segmentColorBetweenNodes(dest.state);
}

function vehicleFailureCaption(order: WizardStopOrder): { label: string; timeLabel?: string } {
  const note = order.failureNote?.trim();
  const label =
    note && note.toLowerCase() !== 'vehicle failure' ? note : 'Vehicle failure';
  return { label, timeLabel: formatNodeTime(order.terminalEventAt) };
}

function stopReasonLabel(order: WizardStopOrder): string | undefined {
  if (isVehicleFailureStop(order)) return undefined;
  if (order.status === 'CANCELLED') {
    const reason = order.cancelReason ?? order.failureOutcome;
    return (reason && CANCEL_REASON_LABELS[reason]) || reason?.replace(/_/g, ' ') || 'Cancelled';
  }
  if (order.deliveryState !== 'Failed') return undefined;
  const note = order.failureNote?.trim();
  if (note) return note;
  const outcome = order.failureOutcome?.trim();
  if (outcome) return CANCEL_REASON_LABELS[outcome] ?? outcome.replace(/_/g, ' ');
  return 'Failed';
}

function nodeAriaLabel(
  label: string,
  state: string,
  sublabel?: string,
  timeLabel?: string,
  reasonLabel?: string,
): string {
  const detailText = [sublabel, timeLabel, reasonLabel].filter(Boolean).join(', ');
  return detailText ? `${label}: ${state}, ${detailText}` : `${label}: ${state}`;
}

function railToneClass(color: string): string {
  if (color === 'bg-transparent') return 'bg-transparent';
  if (color === 'bg-brand') return 'delivery-timeline-rail--done';
  if (color === 'bg-red-500/60') return 'delivery-timeline-rail--failed';
  return 'delivery-timeline-rail--pending';
}

function RouteCircle({
  state,
  kind,
  sequence,
  upcoming,
}: Pick<RouteNodeData, 'state' | 'kind' | 'sequence'> & { upcoming: boolean }) {
  const isCompleted = state === 'completed';
  const isActive = state === 'active';
  const isFailed = state === 'failed';

  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9">
      {isActive || upcoming ? (
        <span
          className="delivery-wizard-pulse pointer-events-none absolute inset-0 rounded-full"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'delivery-timeline-node relative z-[1]',
          kind === 'branch' && isCompleted && 'border-brand bg-brand text-white',
          kind === 'branch' &&
            !isCompleted &&
            'border-navy-border bg-white text-muted dark:bg-navy-light',
          kind === 'stop' && isCompleted && 'border-brand bg-brand text-white',
          kind === 'stop' && isActive && 'border-brand bg-brand text-white',
          kind === 'stop' &&
            isFailed &&
            'border-red-500 bg-red-500/15 text-red-500 dark:text-red-400',
          kind === 'stop' &&
            state === 'pending' &&
            'border-navy-border bg-white text-muted dark:bg-navy-light',
          kind === 'return' && isCompleted && 'border-brand bg-brand text-white',
          kind === 'return' && isActive && 'border-brand bg-brand text-white',
          kind === 'return' &&
            state === 'pending' &&
            'border-navy-border bg-white text-muted dark:bg-navy-light',
        )}
        aria-hidden
      >
        {kind === 'branch' || kind === 'return' ? (
          isCompleted && kind === 'return' ? (
            <CheckCircle2 size={15} strokeWidth={2.5} />
          ) : (
            <Store size={15} strokeWidth={2} />
          )
        ) : isCompleted ? (
          <CheckCircle2 size={15} strokeWidth={2.5} />
        ) : (
          <span className="text-[11px] font-semibold tabular-nums">{sequence}</span>
        )}
      </span>
    </div>
  );
}

function RouteNodeColumn({
  node,
  index,
  total,
  lineBefore,
  lineAfter,
  riderHere,
  upcoming,
}: {
  node: RouteNodeData;
  index: number;
  total: number;
  lineBefore: string;
  lineAfter: string;
  riderHere: boolean;
  upcoming: boolean;
}) {
  const isCompleted = node.state === 'completed';
  const isActive = node.state === 'active';
  const isFailed = node.state === 'failed';

  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center"
      aria-label={nodeAriaLabel(node.label, node.state, node.sublabel, node.timeLabel, node.reasonLabel)}
    >
      <div className="flex w-full items-center">
        <div
          className={cn(
            'delivery-timeline-rail',
            index === 0 ? 'bg-transparent' : railToneClass(lineBefore),
          )}
          aria-hidden
        />
        <RouteCircle
          state={node.state}
          kind={node.kind}
          sequence={node.sequence}
          upcoming={upcoming}
        />
        <div
          className={cn(
            'delivery-timeline-rail',
            index === total - 1 ? 'bg-transparent' : railToneClass(lineAfter),
          )}
          aria-hidden
        />
      </div>
      <p
        className={cn(
          'mt-1.5 w-full truncate px-0.5 text-center text-[11px] font-semibold leading-tight',
          isCompleted || isActive ? 'text-brand' : isFailed ? 'text-red-500 dark:text-red-400' : 'text-muted',
        )}
      >
        {node.label}
      </p>
      {node.sublabel ? (
        <p className="mt-0.5 w-full truncate px-0.5 text-center text-[10px] tabular-nums text-muted">
          {node.sublabel}
        </p>
      ) : null}
      {node.timeLabel ? (
        <p className="mt-0.5 w-full truncate px-0.5 text-center text-[10px] tabular-nums text-muted">
          {node.timeLabel}
        </p>
      ) : null}
      {node.reasonLabel ? (
        <p className="mt-0.5 w-full truncate px-0.5 text-center text-[10px] leading-tight text-red-500 dark:text-red-400">
          {node.reasonLabel}
        </p>
      ) : null}
      <span className="sr-only">
        {riderHere
          ? 'Rider here'
          : upcoming
            ? node.kind === 'return'
              ? 'Next: return to branch'
              : 'Next stop'
            : node.state === 'completed'
              ? 'Completed'
              : node.state === 'active'
                ? 'Current step'
                : node.state === 'failed'
                  ? 'Failed'
                  : 'Upcoming'}
      </span>
    </div>
  );
}

export default function DeliveryRouteTimeline({
  orders,
  jobStatus,
  pickedUp,
  jobId,
  sheetOpen = true,
  startedAt,
  returnStartedAt,
  completedAt,
  pickupLabel,
}: Props) {
  const stopStates =
    jobStatus === 'COMPLETED'
      ? orders.map((order) =>
          order.deliveryState === 'Failed' || order.status === 'CANCELLED' ? 'failed' : 'completed',
        )
      : deriveStepStates(orders, jobStatus);
  const branchState = deriveBranchStartState(pickedUp, jobStatus);
  const returnState = deriveReturnState(jobStatus);
  const returnTimeLabel = formatNodeTime(completedAt) ?? formatNodeTime(returnStartedAt);
  const showRider = jobStatus !== 'COMPLETED';

  const nodes: RouteNodeData[] = [
    {
      key: 'branch-start',
      state: branchState,
      label: pickupLabel?.trim() || 'Branch',
      kind: 'branch',
      timeLabel: formatNodeTime(startedAt),
    },
    ...orders.map((order, index) => ({
      key: order.orderId,
      state: stopStates[index] ?? 'pending',
      label: `Stop ${order.sequence}`,
      sublabel: order.orderNumber,
      timeLabel: isVehicleFailureStop(order) ? undefined : formatNodeTime(order.terminalEventAt),
      reasonLabel: stopReasonLabel(order),
      kind: 'stop' as const,
      sequence: order.sequence,
    })),
    {
      key: 'branch-return',
      state: returnState,
      label: 'Return to branch',
      kind: 'return',
      timeLabel: returnTimeLabel,
    },
  ];

  const totalNodes = nodes.length;
  const targetRiderNodeIndex = deriveTargetRiderNodeIndex(jobStatus, stopStates, orders);
  const upcomingNodeIndex = deriveUpcomingNodeIndex(jobStatus, stopStates, orders);
  const displayPositionIndex = useTimelineRiderPosition(
    targetRiderNodeIndex,
    jobId ?? orders.map((order) => order.orderId).join(','),
    sheetOpen,
  );
  const riderOnLine =
    showRider && displayPositionIndex != null && isRiderOnLine(displayPositionIndex);
  const riderNodeIndex =
    showRider && displayPositionIndex != null ? riderOccupiedNodeIndex(displayPositionIndex) : null;
  const riderStrandedOrder = orders.find((order) => isVehicleFailureStop(order));
  const riderStranded = Boolean(riderStrandedOrder);
  const strandedCaption = riderStrandedOrder ? vehicleFailureCaption(riderStrandedOrder) : null;
  const scooterLeftPercentage =
    showRider && displayPositionIndex != null
      ? riderLinePositionPercentage(displayPositionIndex, totalNodes)
      : null;

  return (
    <div
      className={cn(
        'delivery-timeline-card rounded-xl border border-navy-border px-3 pt-5 sm:px-4',
        strandedCaption ? 'pb-11' : 'pb-4',
      )}
      role="group"
      aria-label="Delivery route progress"
    >
      <div className="relative min-w-0">
        <div className="relative flex w-full min-w-0 items-start overflow-visible pt-2">
          {scooterLeftPercentage != null ? (
            <div
              className={cn(
                'delivery-timeline-scooter-wrap',
                strandedCaption && 'delivery-timeline-scooter-wrap--stranded',
              )}
              style={{ left: `${scooterLeftPercentage}%` }}
              aria-hidden={strandedCaption ? undefined : true}
              aria-label={
                strandedCaption
                  ? [strandedCaption.label, strandedCaption.timeLabel].filter(Boolean).join(', ')
                  : undefined
              }
            >
              <span
                className={cn(
                  'delivery-timeline-scooter-badge',
                  riderStranded && 'delivery-timeline-scooter-badge--failed',
                )}
              >
                <TimelineScooterIcon moving={riderOnLine} stranded={riderStranded} />
              </span>
              {strandedCaption ? (
                <span className="delivery-timeline-scooter-caption">
                  <span className="delivery-timeline-scooter-caption__label">{strandedCaption.label}</span>
                  {strandedCaption.timeLabel ? (
                    <span className="delivery-timeline-scooter-caption__time">
                      {strandedCaption.timeLabel}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          ) : null}

          {nodes.map((node, index) => {
            const next = index < nodes.length - 1 ? nodes[index + 1] : null;
            const lineBefore =
              index > 0
                ? connectorColorToNode(node, orders, stopStates)
                : 'bg-transparent';
            const lineAfter =
              next != null
                ? connectorColorToNode(next, orders, stopStates)
                : 'bg-transparent';

            return (
              <RouteNodeColumn
                key={node.key}
                node={node}
                index={index}
                total={nodes.length}
                lineBefore={lineBefore}
                lineAfter={lineAfter}
                riderHere={riderNodeIndex === index}
                upcoming={upcomingNodeIndex === index}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function deliveryRouteTimelineHeadingExtra(
  orders: WizardStopOrder[],
  jobStatus: string,
): string | null {
  if (jobStatus === 'COMPLETED') return null;
  const stopStates = deriveStepStates(orders, jobStatus);
  const lastStop = lastCompletedStopSequence(orders, stopStates);
  if (lastStop != null && (jobStatus === 'IN_PROGRESS' || jobStatus === 'RETURNING')) {
    return `Stop ${lastStop}`;
  }
  return null;
}
