/** Rows that carry a settlement billing window (payment history + period tables). */
export type PayoutPeriodWindow = {
  periodFrom: string;
  periodTo: string;
};

/** True when the settlement billing window overlaps [from, to] (inclusive YMD). */
export function payoutSettlementPeriodOverlaps(
  row: PayoutPeriodWindow,
  from: string,
  to: string,
): boolean {
  return row.periodFrom <= to && row.periodTo >= from;
}

export function filterPayoutRowsForDisplay<T extends PayoutPeriodWindow>(
  payouts: T[],
  options: {
    periodControlled: boolean;
    embedded: boolean;
    payoutMonth: string;
    payoutDateFrom: string;
    payoutDateTo: string;
    monthRange: (ym: string) => { from: string; to: string };
  },
): T[] {
  if (options.periodControlled || options.embedded) {
    return payouts;
  }
  let from = options.payoutDateFrom;
  let to = options.payoutDateTo;
  if (options.payoutMonth) {
    const range = options.monthRange(options.payoutMonth);
    from = range.from;
    to = range.to;
  }
  if (!from && !to) return payouts;
  return payouts.filter((row) =>
    payoutSettlementPeriodOverlaps(row, from || '1970-01-01', to || '9999-12-31'),
  );
}
