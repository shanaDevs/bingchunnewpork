/** API wallet/platform amounts are integer cent strings. */

export function parseCentsString(value: string | number | null | undefined): bigint {
  if (value == null || value === '') return BigInt(0);
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  const s = String(value).trim();
  if (!/^-?\d+$/.test(s)) return BigInt(0);
  return BigInt(s);
}

export function centsStringToNumber(value: string | number | null | undefined): number {
  const bi = parseCentsString(value);
  if (bi > BigInt(Number.MAX_SAFE_INTEGER) || bi < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('Amount exceeds safe JavaScript integer for this UI path');
  }
  return Number(bi);
}

export function formatCentsStringAsLkr(value: string | number | null | undefined): string {
  const bi = parseCentsString(value);
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const negative = bi < zero;
  const abs = negative ? -bi : bi;
  const whole = abs / hundred;
  const frac = abs % hundred;
  const fracStr = frac.toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-LK')}.${fracStr}`;
}

export function parseLkrString(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

type CentsField = string | number | null | undefined;

const WALLET_SUMMARY_CENT_FIELDS = [
  'currentBalance',
  'totalEarnings',
  'grossLedgerCredits',
  'netTransferableEarnings',
  'totalWithdrawn',
  'pendingWithdrawalTotal',
  'availableBalance',
  'onlineWalletAvailableBalance',
  'allTimeAvailableBalanceCents',
] as const;

function centsFieldToNumber(value: CentsField): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  try {
    return centsStringToNumber(value);
  } catch {
    return Number(value);
  }
}

/** Normalize wallet list row from API (cent strings) to numbers for existing UI formatters. */
export function normalizeStoreWalletFromApi<T extends object>(row: T): T & {
  balance: number;
  totalEarnings?: number;
  totalWithdrawn?: number;
  currentBalance?: number;
  availableBalance?: number;
  allTimeAvailableBalanceCents?: number;
  netTransferableEarnings?: number;
} {
  const r = row as T & Record<string, CentsField>;
  return {
    ...row,
    balance: centsFieldToNumber(r.balance),
    totalEarnings: centsFieldToNumber(r.totalEarnings),
    totalWithdrawn: centsFieldToNumber(r.totalWithdrawn),
    currentBalance: centsFieldToNumber(r.currentBalance ?? r.balance),
    availableBalance: centsFieldToNumber(r.availableBalance),
    allTimeAvailableBalanceCents: centsFieldToNumber(r.allTimeAvailableBalanceCents),
    netTransferableEarnings: centsFieldToNumber(r.netTransferableEarnings),
  };
}

export function normalizeWalletSummaryFromApi<T extends object>(summary: T) {
  const out = { ...summary } as T & Record<string, number>;
  for (const k of WALLET_SUMMARY_CENT_FIELDS) {
    if (k in summary) {
      (out as Record<string, number>)[k] = centsFieldToNumber(
        (summary as Record<string, CentsField>)[k],
      );
    }
  }
  return out;
}

export function normalizeWithdrawalFromApi<T extends { amount?: CentsField }>(row: T) {
  return {
    ...row,
    amount: centsFieldToNumber(row.amount),
  };
}
