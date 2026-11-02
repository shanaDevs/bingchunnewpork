/** Seed scripts must not run against production data. */
export function assertDevSeedOnly(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed scripts are refused when NODE_ENV=production');
  }
}

/** Nugegoda app-logic seed — dev or live (DO console) with explicit flags. */
export function assertNugegodaAppSeedAllowed(): void {
  if (process.env.ALLOW_NUGEGODA_APP_SEED !== 'true') {
    throw new Error('Set ALLOW_NUGEGODA_APP_SEED=true to run Nugegoda app seed');
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_ON_LIVE !== 'true') {
    throw new Error('Set ALLOW_SEED_ON_LIVE=true to run this seed when NODE_ENV=production');
  }
}
