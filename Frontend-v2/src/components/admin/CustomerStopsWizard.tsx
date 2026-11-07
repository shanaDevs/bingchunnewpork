'use client';

import { CheckCircle2, MapPin } from 'lucide-react';
import { adminBadgeClass } from '@/lib/adminBadges';
import { formatDateTime } from '@/lib/datetime';
import {
  deriveStepStates,
  segmentColorBetweenNodes,
  type WizardStepState,
} from '@/lib/deliveryStopProgress';
import { STATUS_LABELS } from '@/lib/orderStatus';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types';
import {
  hasDeliveryMapLocation,
  type DeliveryLocationStop,
} from '@/components/admin/AdminDeliveryLocationModal';

export type WizardStopOrder = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  district?: string;
  lat?: number | null;
  lng?: number | null;
  deliveryState: 'Delivered' | 'Failed' | 'Pending';
  terminalEventAt?: string | null;
  failureOutcome?: string | null;
  failureNote?: string | null;
};

type Props = {
  orders: WizardStopOrder[];
  jobStatus: string;
  onViewLocation: (stop: DeliveryLocationStop) => void;
};

function formatTimeline(value?: string | null): string {
  if (!value) return '—';
  return formatDateTime(value, { dateStyle: 'short', timeStyle: 'short' });
}

const CANCEL_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Item out of stock / unavailable',
  CUSTOMER_REQUEST: 'Customer requested cancellation',
  PAYMENT_OR_SYSTEM_ISSUE: 'Payment or system issue',
  CANCELLED: 'Cancelled',
  CUSTOMER_UNREACHABLE: 'Customer not available',
  WRONG_ADDRESS: 'Wrong / incomplete address',
  REFUSED: 'Customer refused delivery',
  PAYMENT_FAILED: 'Payment issue',
  OTHER: 'Driver error',
};

function formatFailureReason(outcome?: string | null, note?: string | null): string {
  const outcomeLabel = outcome
    ? (CANCEL_REASON_LABELS[outcome] ?? outcome.replace(/_/g, ' '))
    : null;
  const noteLabel = note?.trim()
    ? (CANCEL_REASON_LABELS[note.trim()] ?? note.trim())
    : null;
  if (!outcomeLabel && !noteLabel) return 'Not provided';
  if (outcomeLabel && noteLabel && outcomeLabel.toLowerCase() === noteLabel.toLowerCase()) {
    return outcomeLabel;
  }
  return [outcomeLabel, noteLabel].filter(Boolean).join(' — ');
}

function orderLocationStop(order: WizardStopOrder): DeliveryLocationStop {
  return {
    orderNumber: order.orderNumber,
    addressLine: order.addressLine,
    city: order.city,
    district: order.district,
    lat: order.lat,
    lng: order.lng,
  };
}

function formatOrderStatus(status: string): string {
  if (status in STATUS_LABELS) {
    return STATUS_LABELS[status as OrderStatus];
  }
  return status.replace(/_/g, ' ');
}

function stepAriaLabel(state: ReturnType<typeof deriveStepStates>[number], order: WizardStopOrder): string {
  const prefix = `Stop ${order.sequence}, ${order.orderNumber}`;
  switch (state) {
    case 'completed':
      return `${prefix}: delivered`;
    case 'active':
      return `${prefix}: delivering now, ${formatOrderStatus(order.status)}`;
    case 'failed':
      return `${prefix}: failed or cancelled`;
    default:
      return `${prefix}: upcoming`;
  }
}

type StepProps = {
  order: WizardStopOrder;
  state: WizardStepState;
  isLast: boolean;
  lineColor: string;
  onViewLocation: (stop: DeliveryLocationStop) => void;
};

function CustomerStopStep({ order, state, isLast, lineColor, onViewLocation }: StepProps) {
  const stop = orderLocationStop(order);
  const hasLocation = hasDeliveryMapLocation(stop) && order.lat != null && order.lng != null;
  const address = [order.addressLine, order.city, order.district].filter(Boolean).join(', ');
  const isActive = state === 'active';
  const isCompleted = state === 'completed';
  const isFailed = state === 'failed';

  return (
    <li className="flex gap-3 sm:gap-4" aria-label={stepAriaLabel(state, order)}>
      <div className="flex w-8 shrink-0 flex-col items-center sm:w-9">
        <div className="relative flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
          {isActive ? (
            <span
              className="delivery-wizard-pulse pointer-events-none absolute inset-0 rounded-full"
              aria-hidden
            />
          ) : null}
          <span
            className={cn(
              'relative z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold sm:h-9 sm:w-9',
              isCompleted && 'border-brand bg-brand text-white',
              isActive && 'border-brand bg-brand text-white',
              isFailed && 'border-red-500 bg-red-500/20 text-red-500 dark:text-red-400',
              state === 'pending' &&
                'border-navy-border bg-slate-50 text-muted dark:bg-navy-light',
            )}
            aria-hidden
          >
            {isCompleted ? <CheckCircle2 size={16} strokeWidth={2.5} /> : order.sequence}
          </span>
        </div>
        {!isLast ? (
          <div className={cn('my-1 w-0.5 min-h-[1.25rem] flex-1', lineColor)} aria-hidden />
        ) : null}
      </div>

      <article
        className={cn(
          'mb-3 min-w-0 flex-1 rounded-xl border p-3.5 sm:p-4',
          isCompleted && 'border-navy-border bg-white dark:bg-navy-light/10',
          isActive && 'border-brand/40 bg-brand/5 dark:bg-brand/10',
          isFailed && 'border-red-500/30 bg-white dark:bg-navy-light/10',
          state === 'pending' && 'border-navy-border bg-white dark:bg-navy-light/10',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-sm font-semibold text-fg',
              isActive && 'text-[15px]',
            )}
          >
            {order.orderNumber}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {isActive ? (
              <>
                <span className={adminBadgeClass('orange', 'md')}>
                  <span
                    className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange-400 motion-safe:animate-pulse"
                    aria-hidden
                  />
                  Delivering now
                </span>
                <span className={adminBadgeClass('blue', 'md')}>{formatOrderStatus(order.status)}</span>
              </>
            ) : isCompleted ? (
              <span className={adminBadgeClass('green', 'md')}>Delivered</span>
            ) : isFailed ? (
              <span className={adminBadgeClass('red', 'md')}>
                {order.status === 'CANCELLED' ? 'Cancelled' : 'Failed'}
              </span>
            ) : (
              <span className={adminBadgeClass('neutral', 'md')}>Upcoming</span>
            )}
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Customer</p>
            <p className={cn('mt-0.5 text-sm text-fg', isActive && 'font-medium')}>
              {order.customerName || '—'}
            </p>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Delivery address
            </p>
            <p className="mt-0.5 break-words text-sm text-fg">{address || '—'}</p>
          </div>
          {(isCompleted || isFailed) && (
            <div className="min-w-0 sm:col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {isFailed ? 'Failed / cancelled time' : 'Delivered time'}
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-fg">
                {formatTimeline(order.terminalEventAt)}
              </p>
            </div>
          )}
          {isFailed ? (
            <div className="min-w-0 sm:col-span-2">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
                  {order.status === 'CANCELLED' ? 'Cancel reason' : 'Failure reason'}
                </p>
                <p className="mt-0.5 break-words text-sm text-red-800 dark:text-red-200">
                  {formatFailureReason(order.failureOutcome, order.failureNote)}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-2.5 border-t border-navy-border/60 pt-2.5">
          {hasLocation ? (
            <button
              type="button"
              onClick={() => onViewLocation(stop)}
              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand transition-colors hover:text-brand/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <MapPin size={14} />
              View location
            </button>
          ) : (
            <span className="text-sm text-muted">Location unavailable</span>
          )}
        </div>
      </article>
    </li>
  );
}

export default function CustomerStopsWizard({ orders, jobStatus, onViewLocation }: Props) {
  const stepStates = deriveStepStates(orders, jobStatus);

  return (
    <ol className="list-none space-y-0 p-0 m-0" aria-label="Delivery stop progress">
      {orders.map((order, index) => (
        <CustomerStopStep
          key={order.orderId}
          order={order}
          state={stepStates[index] ?? 'pending'}
          isLast={index === orders.length - 1}
          lineColor={
            index < orders.length - 1
              ? segmentColorBetweenNodes(stepStates[index + 1] ?? 'pending')
              : 'bg-transparent'
          }
          onViewLocation={onViewLocation}
        />
      ))}
    </ol>
  );
}
