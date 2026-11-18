import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';

type PeriodInput = {
  periodFrom?: string | null;
  periodTo?: string | null;
};

/** Label for a stored withdrawal / payout row period. */
export function formatStoredPayoutPeriodLabel(row: PeriodInput): string {
  const from = row.periodFrom?.slice(0, 10);
  const to = row.periodTo?.slice(0, 10);
  if (!from || !to) return '—';
  return formatBiweeklyPeriodLabel(from, to);
}

export function resolvePayoutCycleDisplayRange(input: {
  cycleStage?: 'FIRST' | 'SECOND' | null;
  cycleFrom?: string | null;
  periodFrom: string;
  periodTo: string;
}): { displayFrom: string; displayTo: string } {
  const periodFrom = input.periodFrom.slice(0, 10);
  const periodTo = input.periodTo.slice(0, 10);
  if (input.cycleStage === 'SECOND' && input.cycleFrom) {
    return { displayFrom: input.cycleFrom.slice(0, 10), displayTo: periodTo };
  }
  return { displayFrom: periodFrom, displayTo: periodTo };
}