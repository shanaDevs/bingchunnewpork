/** First 8 chars of a delivery job UUID, uppercased — used when rideCode is absent. */
export function shortJobId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * Same visible ride identifier as the rider app (`Format.displayRideId`):
 * `rideCode` when set, otherwise `#` + first 8 chars of job UUID (uppercase).
 */
export function displayRideId(rideCode: string | null | undefined, jobId: string): string {
  if (rideCode != null && rideCode.trim() !== '') return rideCode;
  const short = jobId.length > 8 ? jobId.slice(0, 8) : jobId;
  return `#${short.toUpperCase()}`;
}

/** Strip the "Bing Chun - " prefix from branch store names for compact display. */
export function formatBranchName(name?: string | null): string {
  if (!name) return '—';
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}
