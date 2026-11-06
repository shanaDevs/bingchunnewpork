import { formatMoneyAmount } from '@/lib/receipt';

export function finalLkr(value: number): string {
  return `LKR ${formatMoneyAmount(value)}`;
}

export function plainAmount(value: number): string {
  return formatMoneyAmount(value);
}

export function signedAmount(value: number, sign: '+' | '−'): string {
  return `${sign} ${plainAmount(value)}`;
}
