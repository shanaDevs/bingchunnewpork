import { getApiBaseUrl } from '@/lib/apiBase';

export type CancelReasonOption = {
  value: string;
  label: string;
  minRefundPercentage?: number;
  maxRefundPercentage?: number;
};

export const OTHER_CANCEL_REASON_VALUE = 'OTHER';

export const FALLBACK_CANCELLATION_REASONS: CancelReasonOption[] = [
  { value: 'CHANGED_MIND', label: 'Changed my mind' },
  { value: 'ORDERED_BY_MISTAKE', label: 'Ordered by mistake' },
  { value: 'TAKING_TOO_LONG', label: 'Taking too long' },
  { value: 'FOUND_CHEAPER_ELSEWHERE', label: 'Found a better price elsewhere' },
  { value: 'PAYMENT_ISSUES', label: 'Payment issues' },
  { value: OTHER_CANCEL_REASON_VALUE, label: 'Other (please specify)' },
];

export async function fetchActiveCancelReasons(): Promise<CancelReasonOption[]> {
  const res = await fetch(`${getApiBaseUrl()}/settings/cancel-reasons`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
    return FALLBACK_CANCELLATION_REASONS;
  }
  return json.data as CancelReasonOption[];
}

export function cancellationReasonLabel(
  value: string,
  reasons: CancelReasonOption[] = FALLBACK_CANCELLATION_REASONS,
): string {
  return reasons.find((reason) => reason.value === value)?.label ?? value.replace(/_/g, ' ');
}
