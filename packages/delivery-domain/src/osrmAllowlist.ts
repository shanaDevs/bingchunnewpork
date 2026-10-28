/** Default public OSRM demo host — always allowed for https. */
export const DEFAULT_OSRM_HOST = 'router.project-osrm.org';

function parseAllowedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const hosts = new Set<string>([DEFAULT_OSRM_HOST]);
  const extra = env.OSRM_ALLOWED_HOSTS ?? '';
  for (const part of extra.split(',')) {
    const host = part.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

/**
 * Fail closed if OSRM_URL points at a non-allowlisted host (SSRF hardening).
 * Does not change routing math — call before fetch only.
 */
export function assertOsrmBaseUrlAllowed(
  base: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`OSRM_URL is not a valid URL: ${base}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('OSRM_URL must not include credentials');
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = parseAllowedHosts(env);
  if (!allowed.has(host)) {
    throw new Error(
      `OSRM_URL host "${host}" is not allowlisted (default: ${DEFAULT_OSRM_HOST}; extend via OSRM_ALLOWED_HOSTS)`,
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'https:') return;

  if (protocol === 'http:') {
    // Prefer https for the public default; http only for explicitly listed self-hosted hosts.
    const extras = new Set(
      (env.OSRM_ALLOWED_HOSTS ?? '')
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!extras.has(host)) {
      throw new Error(
        'OSRM_URL must use https unless the host is listed in OSRM_ALLOWED_HOSTS (self-hosted)',
      );
    }
    return;
  }

  throw new Error(`OSRM_URL scheme "${parsed.protocol}" is not allowed`);
}
