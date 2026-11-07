'use client';

import { Fragment } from 'react';
import { CheckCircle2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deriveBranchStartState,
  deriveReturnState,
  deriveStepStates,
  deriveUpcomingNodeIndex,
  segmentColorBetweenNodes,
  segmentColorToStop,
  type WizardStepState,
  type WizardStopOrder,
} from '@/lib/deliveryStopProgress';
import { getStatusLabel } from '@/lib/orderStatus';
import type { OrderStatus } from '@/types';

export type JobListOrderStop = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  deliveryState: 'Delivered' | 'Failed' | 'Pending';
  failureOutcome?: string | null;
};

type Props = {
  jobStatus: string;
  pickedUp?: boolean;
  orders: JobListOrderStop[];
  className?: string;
  layout?: 'inline' | 'footer';
};

type RouteNodeKind = 'branch' | 'stop' | 'return';

type CompactNode = {
  key: string;
  state: WizardStepState | ReturnType<typeof deriveReturnState>;
  kind: RouteNodeKind;
  sequence?: number;
  label: string;
};

function railToneClass(color: string): string {
  if (color === 'bg-transparent') return 'bg-transparent';
  if (color === 'bg-brand') return 'delivery-timeline-rail--done';
  if (color === 'bg-red-500/60') return 'delivery-timeline-rail--failed';
  return 'delivery-timeline-rail--pending';
}

function connectorColorToNode(
  dest: CompactNode,
  orders: WizardStopOrder[],
  stopStates: WizardStepState[],
): string {
  if (dest.kind === 'stop') {
    const destIndex = dest.sequence != null ? dest.sequence - 1 : -1;
    if (destIndex >= 0) {
      return segmentColorToStop(destIndex, dest.state as WizardStepState, orders, stopStates);
    }
  }
  return segmentColorBetweenNodes(dest.state);
}

function toWizardOrders(orders: JobListOrderStop[]): WizardStopOrder[] {
  return orders.map((o) => ({
    orderId: o.orderId,
    orderNumber: o.orderNumber,
    sequence: o.sequence,
    status: o.status,
    deliveryState: o.deliveryState,
    failureOutcome: o.failureOutcome ?? null,
  }));
}

function footerNodeCaption(node: CompactNode): string {
  if (node.kind === 'branch') return 'Branch';
  if (node.kind === 'return') return 'Return';
  return `#${node.sequence ?? '?'}`;
}

function footerNodeTitle(node: CompactNode): string {
  if (node.kind === 'stop') return node.label;
  return node.label;
}

function CompactNodeCircle({
  node,
  upcoming,
  footer,
}: {
  node: CompactNode;
  upcoming: boolean;
  footer: boolean;
}) {
  const { state, kind, sequence } = node;
  const isCompleted = state === 'completed';
  const isActive = state === 'active';
  const isFailed = state === 'failed';
  const sizeClass = footer
    ? '!h-7 !w-7 sm:!h-8 sm:!w-8'
    : '!h-6 !w-6 sm:!h-7 sm:!w-7';
  const iconSize = footer ? 14 : 12;
  const wrapClass = footer
    ? 'relative flex h-7 w-7 shrink-0 items-center justify-center sm:h-8 sm:w-8'
    : 'relative flex h-6 w-6 shrink-0 items-center justify-center sm:h-7 sm:w-7';

  return (
    <div className={wrapClass}>
      {upcoming ? (
        <span
          className="delivery-wizard-pulse pointer-events-none absolute inset-0 rounded-full"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'delivery-timeline-node relative z-[1] !min-h-0 !min-w-0',
          sizeClass,
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
            <CheckCircle2 size={iconSize} strokeWidth={2.5} />
          ) : (
            <Store size={iconSize} strokeWidth={2} />
          )
        ) : isCompleted ? (
          <CheckCircle2 size={iconSize} strokeWidth={2.5} />
        ) : (
          <span className={cn('font-semibold tabular-nums', footer ? 'text-[10px]' : 'text-[9px]')}>
            {sequence}
          </span>
        )}
      </span>
    </div>
  );
}

function buildTooltip(orders: JobListOrderStop[], jobStatus: string): string {
  const wizard = toWizardOrders(orders);
  const states = deriveStepStates(wizard, jobStatus);
  return orders
    .map((o, i) => {
      const step = states[i] ?? 'pending';
      const statusLabel = getStatusLabel(o.status as OrderStatus, 'DELIVERY');
      return `${o.orderNumber}: ${statusLabel} (${step})`;
    })
    .join(' · ');
}

export default function DeliveryJobTableTimeline({
  jobStatus,
  pickedUp = false,
  orders,
  className,
  layout = 'inline',
}: Props) {
  if (!orders.length) return null;

  const footer = layout === 'footer';
  const wizardOrders = toWizardOrders(orders);
  const stopStates =
    jobStatus === 'COMPLETED'
      ? wizardOrders.map((order) =>
          order.deliveryState === 'Failed' || order.status === 'CANCELLED' ? 'failed' : 'completed',
        )
      : deriveStepStates(wizardOrders, jobStatus);
  const branchState = deriveBranchStartState(pickedUp, jobStatus);
  const returnState = deriveReturnState(jobStatus);

  const nodes: CompactNode[] = [
    { key: 'branch-start', state: branchState, kind: 'branch', label: 'Branch' },
    ...orders.map((order, index) => ({
      key: order.orderId,
      state: (stopStates[index] ?? 'pending') as WizardStepState,
      kind: 'stop' as const,
      sequence: order.sequence,
      label: order.orderNumber,
    })),
    { key: 'branch-return', state: returnState, kind: 'return', label: 'Return' },
  ];

  const upcomingNodeIndex = deriveUpcomingNodeIndex(jobStatus, stopStates, wizardOrders);
  const tooltip = buildTooltip(orders, jobStatus);

  return (
    <div
      className={cn(footer ? 'w-full' : 'min-w-[12rem] max-w-[22rem]', className)}
      role="group"
      aria-label="Delivery route progress"
      title={tooltip}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {footer ? (
        <div className="flex justify-center sm:justify-start sm:pl-8">
          <div className="max-w-full overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:thin]">
            <div className="w-fit min-w-min rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-sm dark:border-navy-border dark:bg-navy-light/30">
              <div className="inline-flex items-start">
                {nodes.map((node, index) => (
                  <Fragment key={node.key}>
                    {index > 0 ? (
                      <div
                        className={cn(
                          'delivery-timeline-rail delivery-job-table-timeline__connector mt-3.5 !h-0.5 shrink-0 self-start sm:mt-4 sm:!h-1',
                          railToneClass(connectorColorToNode(node, wizardOrders, stopStates)),
                        )}
                        aria-hidden
                      />
                    ) : null}
                    <div className="flex shrink-0 flex-col items-center">
                      <CompactNodeCircle
                        node={node}
                        upcoming={upcomingNodeIndex === index}
                        footer={footer}
                      />
                      <p
                        className="mt-1.5 max-w-[4.5rem] truncate px-0.5 text-center text-[10px] font-medium tabular-nums text-muted"
                        title={footerNodeTitle(node)}
                      >
                        {footerNodeCaption(node)}
                      </p>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/80 px-1.5 py-1.5 dark:border-navy-border dark:bg-navy-light/20">
          <div className="flex w-full min-w-0 items-center">
            {nodes.map((node, index) => {
              const next = index < nodes.length - 1 ? nodes[index + 1] : null;
              const lineBefore =
                index > 0 ? connectorColorToNode(node, wizardOrders, stopStates) : 'bg-transparent';
              const lineAfter =
                next != null ? connectorColorToNode(next, wizardOrders, stopStates) : 'bg-transparent';

              return (
                <div key={node.key} className="flex min-w-0 flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    <div
                      className={cn(
                        'delivery-timeline-rail !h-0.5',
                        index === 0 ? 'bg-transparent' : railToneClass(lineBefore),
                      )}
                      aria-hidden
                    />
                    <CompactNodeCircle
                      node={node}
                      upcoming={upcomingNodeIndex === index}
                      footer={footer}
                    />
                    <div
                      className={cn(
                        'delivery-timeline-rail !h-0.5',
                        index === nodes.length - 1 ? 'bg-transparent' : railToneClass(lineAfter),
                      )}
                      aria-hidden
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="sr-only">{tooltip}</p>
    </div>
  );
}
