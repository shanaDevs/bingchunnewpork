/** First 8 chars of a delivery job UUID, uppercased — used when rideCode is absent. */
export function shortJobId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Strip the "Bing Chun - " prefix from branch store names for compact display. */
export function formatBranchName(name?: string | null): string {
  if (!name) return '—';
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}
