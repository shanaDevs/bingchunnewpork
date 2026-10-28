import { Prisma } from '@prisma/client';

/** Commerce / API whole rupees → integer cents for in-process math. */
export function lkrToCents(lkr: number): number {
  return Math.round(lkr * 100);
}

/** Integer cents → whole rupees (may be fractional when cents are not a multiple of 100). */
export function centsToLkr(cents: number): number {
  return cents / 100;
}

/** Wallet/platform/Jason/delivery job fees/payouts DB amounts are integer cents. API wallet JSON uses cent strings. */
export function centsToDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  const s = typeof value === 'number' ? String(Math.trunc(value)) : String(value).trim();
  if (!/^-?\d+$/.test(s)) {
    throw new Error(`Invalid cents value: ${value}`);
  }
  return new Prisma.Decimal(s);
}

/** Persist a whole-LKR commerce amount into a finance `Decimal(20,4)` integer-cents column. */
export function lkrToDecimal(lkrWhole: number | string | Prisma.Decimal): Prisma.Decimal {
  if (lkrWhole instanceof Prisma.Decimal) {
    return centsToDecimal(decimalFieldToCentsNumber(lkrWhole));
  }
  const n = typeof lkrWhole === 'number' ? lkrWhole : Number(String(lkrWhole).trim());
  if (!Number.isFinite(n)) throw new Error(`Invalid LKR amount: ${lkrWhole}`);
  return centsToDecimal(lkrToCents(n));
}

export function parseDecimalFromDb(value: unknown): Prisma.Decimal {
  if (value == null) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Prisma.Decimal(String(Math.trunc(value)));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return new Prisma.Decimal(value.trim());
  }
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return new Prisma.Decimal(String(value));
  }
  return new Prisma.Decimal(0);
}

/** Integer cents string for JSON (no decimal point). */
export function decimalToCentsString(value: Prisma.Decimal | null | undefined): string {
  if (value == null) return '0';
  return value.toFixed(0);
}

/** In-process integer cents → API cent string (same shape as wallet/platform JSON). */
export function centsNumberToApiString(cents: number): string {
  return decimalToCentsString(centsToDecimal(cents));
}

/** Finance Decimal integer cents → whole-LKR string for delivery job fee API. */
export function decimalToLkrString(value: Prisma.Decimal | null | undefined): string {
  if (value == null) return '0';
  const lkr = centsToLkr(decimalToCentsNumber(value));
  return String(Math.round(lkr));
}

export function decimalToCentsNumber(value: Prisma.Decimal | null | undefined): number {
  const s = decimalToCentsString(value);
  const n = Number(s);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Cents value exceeds safe integer: ${s}`);
  }
  return n;
}

export function sumDecimals(...values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal {
  let acc = new Prisma.Decimal(0);
  for (const v of values) {
    if (v != null) acc = acc.plus(v);
  }
  return acc;
}

export function subtractDecimals(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.minus(b);
}

/** Coerce API input (string or number) to cents for internal math. */
export function coerceInputToCents(value: unknown): number {
  if (typeof value === 'string') {
    const s = value.trim();
    if (!/^-?\d+$/.test(s)) throw new Error('Amount must be an integer cents string');
    const n = Number(s);
    if (!Number.isSafeInteger(n)) throw new Error('Amount exceeds safe integer');
    return n;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  throw new Error('Invalid amount');
}

export const zMoneyCentsInput = (zod: typeof import('zod').z) =>
  zod.union([zod.string(), zod.number()]).transform((v) => coerceInputToCents(v));

/** Prisma aggregate / model field → integer cents for in-process math. */
export function decimalFieldToCentsNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  return Number(parseDecimalFromDb(value).toFixed(0));
}

/** Finance Decimal integer cents → whole LKR for display and commerce comparisons. */
export function decimalFieldToLkrNumber(value: Prisma.Decimal | number | null | undefined): number {
  return centsToLkr(decimalFieldToCentsNumber(value));
}

/** `promotion_usages.platformPaybackAmount` and other commerce Int columns (whole LKR). */
export function promoUsagePaybackLkr(platformPaybackAmount: number | null | undefined): number {
  return platformPaybackAmount ?? 0;
}

/** Settlement / platform earning `platformPaybackAmount` Decimal columns (integer cents). */
export function settlementPaybackCents(
  platformPaybackAmount: Prisma.Decimal | number | null | undefined,
): number {
  return decimalFieldToCentsNumber(platformPaybackAmount);
}

export function centsNumberToDecimalFields(amounts: Record<string, number>): Record<string, Prisma.Decimal> {
  const out: Record<string, Prisma.Decimal> = {};
  for (const [k, v] of Object.entries(amounts)) {
    out[k] = centsToDecimal(v);
  }
  return out;
}
