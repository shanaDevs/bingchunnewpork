/** Per-job driven distance: GPS actual when present, else planned/legacy total. */
export type RiderJobDistanceFields = {
  actualDistanceKm?: number | null;
  totalDistanceKm?: number | null;
};

export function jobRiderDistanceKm(job: RiderJobDistanceFields): number {
  return job.actualDistanceKm ?? job.totalDistanceKm ?? 0;
}

export function sumRiderDistanceKm(jobs: readonly RiderJobDistanceFields[]): number {
  let total = 0;
  for (const job of jobs) {
    total += jobRiderDistanceKm(job);
  }
  return total;
}

export function roundDistanceKm(km: number): number {
  return Math.round(km * 10) / 10;
}
