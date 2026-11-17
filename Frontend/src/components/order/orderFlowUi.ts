import { cn } from '@/components/home-redesign/lib/cn';

export const ORDER_FLOW_FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export const orderFlowPrimaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-7 py-3.5 font-semibold text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none',
  ORDER_FLOW_FOCUS_RING,
);

export const orderFlowSecondaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50',
  ORDER_FLOW_FOCUS_RING,
);

export const DEFAULT_OPEN_TIME = '09:00';
export const DEFAULT_CLOSE_TIME = '23:00';

export function orderingFieldsFromStore(store: {
  openTime?: string;
  closeTime?: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number | null;
  branchClosedAt?: string | null;
}) {
  return {
    openTime: store.openTime ?? DEFAULT_OPEN_TIME,
    closeTime: store.closeTime ?? DEFAULT_CLOSE_TIME,
    onlineOrderStartTime: store.onlineOrderStartTime,
    onlineOrderStopTime: store.onlineOrderStopTime,
    pickupCutoffMinutes: store.pickupCutoffMinutes ?? undefined,
    branchClosedAt: store.branchClosedAt,
  };
}

/** "0.4" → "400 m", "3.25" → "3.3 km". */
export function formatOrderFlowDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(1)} km`;
}

/** "09:00" → "9 AM", "23:30" → "11:30 PM". */
export function formatOrderFlowHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

export const shortOrderAddress = (address: string) => address.split(',')[0]?.trim() || address;