/**
 * Central delivery job / order transition rules.
 * Keep backend and delivery-service behaviour aligned by importing from here
 * where possible, or mirroring these helpers when the service cannot depend on backend.
 */

export const ACTIVE_JOB_STATUSES = ['ASSIGNED', 'QUEUED', 'IN_PROGRESS'] as const;
export const CLAIMABLE_JOB_STATUS = 'SCHEDULED' as const;

export type DeliveryJobStatusValue =
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'RETURNING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'VEHICLE_FAILURE';

export type DeliveryDomainStateValue =
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'AWAITING_OTP'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURNED_TO_STORE';

const ALLOWED_JOB: Record<string, DeliveryJobStatusValue[]> = {
  SCHEDULED: ['ASSIGNED', 'QUEUED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'SCHEDULED', 'CANCELLED'], // SCHEDULED = reject/unassign
  QUEUED: ['IN_PROGRESS', 'ASSIGNED', 'SCHEDULED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'RETURNING', 'VEHICLE_FAILURE'],
  RETURNING: ['COMPLETED', 'VEHICLE_FAILURE'],
  COMPLETED: [],
  CANCELLED: [],
  VEHICLE_FAILURE: [],
};

export function canTransitionJob(
  from: DeliveryJobStatusValue | string,
  to: DeliveryJobStatusValue | string,
): boolean {
  return (ALLOWED_JOB[from] ?? []).includes(to as DeliveryJobStatusValue);
}

/** Reject/cancel allowed only before any order on the job has been picked up. */
export function isRejectAllowed(domainStates: DeliveryDomainStateValue[]): boolean {
  const blocked = new Set<DeliveryDomainStateValue>([
    'PICKED_UP',
    'EN_ROUTE',
    'ARRIVED',
    'AWAITING_OTP',
    'DELIVERED',
  ]);
  return !domainStates.some((s) => blocked.has(s));
}

export function meritStatusBand(points: number): 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'WARNING' | 'CRITICAL' {
  const p = Math.max(0, Math.min(100, points));
  if (p >= 90) return 'EXCELLENT';
  if (p >= 75) return 'GOOD';
  if (p >= 60) return 'AVERAGE';
  if (p >= 40) return 'WARNING';
  return 'CRITICAL';
}

export function clampMeritPoints(points: number): number {
  return Math.max(0, Math.min(100, Math.round(points)));
}

export const MERIT_DELTAS = {
  LATE_DELIVERY: -2,
  CANCEL_BEFORE_PICKUP: -5,
  CONFIRMED_COMPLAINT: -5,
  SERIOUS_VIOLATION: -10,
  RECOVERY_BONUS: 5,
} as const;

export const RECOVERY_STREAK = 20;
