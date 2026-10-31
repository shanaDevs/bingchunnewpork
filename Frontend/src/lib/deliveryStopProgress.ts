export type WizardStopOrder = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  deliveryState: 'Delivered' | 'Failed' | 'Pending';
  terminalEventAt?: string | null;
  cancelReason?: string | null;
  failureOutcome?: string | null;
  failureNote?: string | null;
};

export type WizardStepState = 'completed' | 'active' | 'failed' | 'pending';

export type ReturnNodeState = 'completed' | 'active' | 'pending';

const POST_PICKUP_JOB_STATUSES = new Set(['IN_PROGRESS', 'RETURNING', 'COMPLETED']);

/** Admin map replay: stored or GPS-fallback actual path (not live tracking). */
export function jobSupportsActualRouteReplay(status: string): boolean {
  return status === 'COMPLETED' || status === 'VEHICLE_FAILURE';
}

/** Branch is completed after Confirm Pickup or once delivery has started. */
export function deriveBranchStartState(pickedUp: boolean, jobStatus: string): WizardStepState {
  if (pickedUp || POST_PICKUP_JOB_STATUSES.has(jobStatus)) return 'completed';
  return 'pending';
}

/** Return is completed only after the rider finishes at the branch. */
export function deriveReturnState(jobStatus: string): ReturnNodeState {
  if (jobStatus === 'COMPLETED') return 'completed';
  return 'pending';
}

/**
 * Stops turn blue only after Mark as Delivered (or failed/cancelled).
 * No in-transit "active" stop while the rider is travelling.
 */
export function deriveStepStates(orders: WizardStopOrder[], jobStatus: string): WizardStepState[] {
  void jobStatus;
  return orders.map((order) => {
    if (order.deliveryState === 'Delivered' || order.status === 'DELIVERED') return 'completed';
    // Mid-route breakdown is not arrival — keep the destination looking like a normal pending stop.
    if (isVehicleFailureStop(order)) return 'pending';
    if (order.deliveryState === 'Failed' || order.status === 'CANCELLED') return 'failed';
    return 'pending';
  });
}

/** Connector segment is filled once the destination node is reached or active. */
export function segmentColorBetweenNodes(
  toState?: WizardStepState | ReturnNodeState | null,
): string {
  if (toState === 'completed' || toState === 'active') return 'bg-brand';
  if (toState === 'failed') return 'bg-red-500/60';
  return 'bg-slate-200 dark:bg-navy-border';
}

export function lineColorForStep(state: WizardStepState): string {
  if (state === 'completed' || state === 'active') return 'bg-brand';
  if (state === 'failed') return 'bg-red-500/60';
  return 'bg-slate-200 dark:bg-navy-border';
}

/** @deprecated Prefer segmentColorBetweenNodes for sequential fill between nodes. */
export function segmentColorAfterNode(state: WizardStepState): string {
  if (state === 'completed' || state === 'failed' || state === 'active') {
    return state === 'failed' ? 'bg-red-500/60' : 'bg-brand';
  }
  return 'bg-slate-200 dark:bg-navy-border';
}

/** Customer-cancelled stops stay on the rail but are skipped for progress. */
export function isSkippedCancelledStop(order?: WizardStopOrder): boolean {
  return order?.status === 'CANCELLED';
}

/** Mid-route breakdown — rider never arrived at this stop. */
export function isVehicleFailureStop(order?: WizardStopOrder): boolean {
  return order?.failureOutcome === 'VEHICLE_FAILURE';
}

/** Delivered, or failed because the rider was at the stop (not cancel / vehicle failure). */
export function isReachedStop(
  state: WizardStepState | ReturnNodeState | null | undefined,
  order?: WizardStopOrder,
): boolean {
  if (state === 'completed' || state === 'active') return true;
  if (state === 'failed' && !isSkippedCancelledStop(order) && !isVehicleFailureStop(order)) {
    return true;
  }
  return false;
}

function firstVehicleFailureStopIndex(
  orders: WizardStopOrder[],
  afterIndex: number,
): number {
  for (let i = afterIndex + 1; i < orders.length; i++) {
    if (isVehicleFailureStop(orders[i])) return i;
  }
  return -1;
}

function lastReachedStopIndex(
  stopStates: WizardStepState[],
  orders: WizardStopOrder[],
): number {
  let lastReachedIdx = -1;
  stopStates.forEach((state, index) => {
    if (isReachedStop(state, orders[index])) lastReachedIdx = index;
  });
  return lastReachedIdx;
}

export function lastCompletedStopSequence(
  orders: WizardStopOrder[],
  stepStates: WizardStepState[],
): number | null {
  let last: number | null = null;
  stepStates.forEach((state, index) => {
    if (isReachedStop(state, orders[index])) {
      last = orders[index]?.sequence ?? null;
    }
  });
  return last;
}

/**
 * Route nodes: Branch (0) → stops (1…n) → Return (n+1).
 * Rider stays at branch until the first delivery, then on the last reached stop.
 * A vehicle failure sits halfway to that failed stop (never “arrived”).
 * Cancelled future stops are skipped. Returning stays on the last reached stop;
 * completed jobs land on Return.
 */
export function deriveTargetRiderNodeIndex(
  jobStatus: string,
  stopStates: WizardStepState[],
  orders: WizardStopOrder[] = [],
): number | null {
  if (jobStatus === 'COMPLETED') return stopStates.length + 1;

  const lastReachedIdx = lastReachedStopIndex(stopStates, orders);
  const vehicleFailureIdx = firstVehicleFailureStopIndex(orders, lastReachedIdx);
  if (vehicleFailureIdx >= 0) {
    const fromNode = lastReachedIdx >= 0 ? lastReachedIdx + 1 : 0;
    const toNode = vehicleFailureIdx + 1;
    return fromNode + (toNode - fromNode) * 0.5;
  }

  if (lastReachedIdx >= 0) return lastReachedIdx + 1;

  if (jobStatus === 'ASSIGNED' || jobStatus === 'IN_PROGRESS' || jobStatus === 'RETURNING') {
    return 0;
  }

  return null;
}

/**
 * Next real pending stop to pulse. Skips cancelled nodes. Pulse-only: does not
 * mark the stop reached or fill connectors. If no pending stop remains, pulse
 * Return until the job is completed.
 */
export function deriveUpcomingNodeIndex(
  jobStatus: string,
  stopStates: WizardStepState[],
  orders: WizardStopOrder[] = [],
): number | null {
  if (jobStatus === 'COMPLETED') return null;

  const lastReachedIdx = lastReachedStopIndex(stopStates, orders);
  for (let i = lastReachedIdx + 1; i < stopStates.length; i++) {
    const order = orders[i];
    if (isReachedStop(stopStates[i], order) || isSkippedCancelledStop(order)) continue;
    return i + 1;
  }

  if (jobStatus === 'ASSIGNED' || jobStatus === 'IN_PROGRESS' || jobStatus === 'RETURNING') {
    return stopStates.length + 1;
  }

  return null;
}

/** Fill inbound line to a stop. Cancelled skips stay grey until a later stop is reached. */
export function segmentColorToStop(
  destIndex: number,
  destState: WizardStepState | ReturnNodeState | null | undefined,
  orders: WizardStopOrder[],
  stopStates: WizardStepState[],
): string {
  if (destState === 'completed' || destState === 'active') return 'bg-brand';
  if (destState === 'failed') {
    if (isSkippedCancelledStop(orders[destIndex]) || isVehicleFailureStop(orders[destIndex])) {
      const laterReached = stopStates.some(
        (state, index) => index > destIndex && isReachedStop(state, orders[index]),
      );
      return laterReached ? 'bg-red-500/60' : 'bg-slate-200 dark:bg-navy-border';
    }
    return 'bg-red-500/60';
  }
  return 'bg-slate-200 dark:bg-navy-border';
}

export function riderLinePositionPercentage(
  positionIndex: number,
  totalNodes: number,
): number {
  if (totalNodes <= 0) return 0;
  return ((positionIndex + 0.5) / totalNodes) * 100;
}

export function isRiderOnLine(positionIndex: number): boolean {
  return !Number.isInteger(positionIndex);
}

export function riderOccupiedNodeIndex(positionIndex: number): number | null {
  return Number.isInteger(positionIndex) ? positionIndex : null;
}
