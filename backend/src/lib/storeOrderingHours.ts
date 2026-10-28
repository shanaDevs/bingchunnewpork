export const DEFAULT_PICKUP_CUTOFF_MINUTES = 50;

export interface StoreOrderingConfig {
  openTime: string;
  closeTime: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number | null;
}

export interface ResolvedStoreOrderingHours {
  openTime: string;
  closeTime: string;
  onlineOrderStartTime: string;
  onlineOrderStopTime: string;
  pickupCutoffMinutes: number;
  /** Earliest schedulable pickup time (online window start). */
  scheduleOpenTime: string;
  /** Last moment customers may place pickup orders (min of store close and online stop). */
  scheduleCloseTime: string;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function earlierTime(a: string, b: string): string {
  return timeToMinutes(a) <= timeToMinutes(b) ? a : b;
}

export function resolveStoreOrderingHours(store: StoreOrderingConfig): ResolvedStoreOrderingHours {
  const openTime = store.openTime;
  const closeTime = store.closeTime;
  const onlineOrderStartTime = store.onlineOrderStartTime?.trim() || openTime;
  const onlineOrderStopTime = store.onlineOrderStopTime?.trim() || closeTime;
  const pickupCutoffMinutes = store.pickupCutoffMinutes ?? DEFAULT_PICKUP_CUTOFF_MINUTES;
  const scheduleOpenTime = onlineOrderStartTime;
  const scheduleCloseTime = earlierTime(closeTime, onlineOrderStopTime);

  return {
    openTime,
    closeTime,
    onlineOrderStartTime,
    onlineOrderStopTime,
    pickupCutoffMinutes,
    scheduleOpenTime,
    scheduleCloseTime,
  };
}

export function parseTimeOnDate(time: string, baseDate: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function isOnlineOrderingOpen(
  store: StoreOrderingConfig,
  now = new Date(),
): boolean {
  const hours = resolveStoreOrderingHours(store);
  const start = parseTimeOnDate(hours.onlineOrderStartTime, now);
  const stop = parseTimeOnDate(hours.onlineOrderStopTime, now);
  return now.getTime() >= start.getTime() && now.getTime() < stop.getTime();
}

export function onlineOrderingClosedMessage(store: StoreOrderingConfig): string {
  const hours = resolveStoreOrderingHours(store);
  return `Online ordering is closed. Orders are accepted ${hours.onlineOrderStartTime} – ${hours.onlineOrderStopTime}.`;
}

export type BranchCloseState = { branchClosedAt?: Date | string | null };

export function isBranchManuallyClosed(store: BranchCloseState): boolean {
  return store.branchClosedAt != null && store.branchClosedAt !== '';
}

export function branchManuallyClosedMessage(): string {
  return 'This branch is temporarily closed and is not accepting online orders.';
}

export function isCustomerOnlineOrderingOpen(
  store: StoreOrderingConfig & BranchCloseState,
  now = new Date(),
): boolean {
  if (isBranchManuallyClosed(store)) return false;
  return isOnlineOrderingOpen(store, now);
}

export function customerOnlineOrderingClosedMessage(
  store: StoreOrderingConfig & BranchCloseState,
): string {
  if (isBranchManuallyClosed(store)) return branchManuallyClosedMessage();
  return onlineOrderingClosedMessage(store);
}
