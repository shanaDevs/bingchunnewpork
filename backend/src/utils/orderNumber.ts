import { randomInt } from 'crypto';

export function generateOrderNumber(): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = randomInt(1000, 10000);
  return `BC${yy}${mm}${dd}-${rand}`;
}
