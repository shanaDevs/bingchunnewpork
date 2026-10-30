import { randomInt } from 'crypto';

export function generateOrderNumber(): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = randomInt(100_000, 1_000_000);
  return `BC${yy}${mm}${dd}-${rand}`;
}
