export type ApiSurface = 'core' | 'shop' | 'pos' | 'admin';

const SURFACES = new Set<ApiSurface>(['core', 'shop', 'pos', 'admin']);

export function resolveApiSurface(raw = process.env.API_SURFACE): ApiSurface {
  const value = (raw ?? 'core').trim().toLowerCase();
  if (!value) return 'core';
  if (SURFACES.has(value as ApiSurface)) return value as ApiSurface;
  throw new Error(`Invalid API_SURFACE "${raw}". Use core, shop, pos, or admin.`);
}

/**
 * Only core runs schedulers by default. Shop/pos/admin share the same DB pool on
 * CapRover; duplicate crons on shop caused P2024 pool timeouts under load.
 * Set RUN_BACKGROUND_JOBS=true explicitly on a non-core surface if needed.
 */
export function resolveRunBackgroundJobs(
  surface = resolveApiSurface(),
  raw = process.env.RUN_BACKGROUND_JOBS,
): boolean {
  const explicit = raw?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return surface === 'core';
}
