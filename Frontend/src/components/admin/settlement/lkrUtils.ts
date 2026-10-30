export const LKR_EPSILON = 0.001;

export function hasPositiveLkr(value: number | null | undefined): boolean {
  return (value ?? 0) > LKR_EPSILON;
}

export function hasAnyPositiveLkr(
  ...values: Array<number | null | undefined>
): boolean {
  return values.some((value) => hasPositiveLkr(value));
}

export function roundLkr(value: number): number {
  return Math.round(value * 100) / 100;
}

export function centsToLkrAmount(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

export function coerceBreakdownNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Parse JSON string payloads; returns null on failure. */
export function parseJsonObjectIfString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
