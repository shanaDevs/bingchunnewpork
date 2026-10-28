/** Seed scripts must not run against production data. */
export function assertDevSeedOnly(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed scripts are refused when NODE_ENV=production');
  }
}
