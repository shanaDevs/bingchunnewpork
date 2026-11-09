/** LKR price for menu cards (drops trailing .00 when whole number). */
export function formatLkrShort(price: number): string {
  const rounded = Math.round(price);
  if (rounded === price) {
    return `LKR ${rounded.toLocaleString('en-US')}`;
  }
  return `LKR ${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatLkr(price: number): string {
  return `LKR ${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
