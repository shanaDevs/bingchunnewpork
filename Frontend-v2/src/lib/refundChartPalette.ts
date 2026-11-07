/** Refund analytics chart palette — brand blues + neutral slate (matches admin theme). */
export const REFUND_CHART_PALETTE = [
  '#307ef2',
  '#4d88eb',
  '#1a5cd4',
  '#64748b',
  '#94a3b8',
] as const;

export function refundChartColor(index: number): string {
  return REFUND_CHART_PALETTE[index % REFUND_CHART_PALETTE.length];
}

export function withRefundChartFill<T extends { label: string; count: number; percent: number }>(
  rows: T[],
  keyOf: (row: T, index: number) => string,
): Array<T & { fill: string; key: string }> {
  return rows.map((row, index) => ({
    ...row,
    key: keyOf(row, index),
    fill: refundChartColor(index),
  }));
}
