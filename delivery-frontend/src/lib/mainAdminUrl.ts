const DEV_MAIN_ADMIN_URL = 'http://localhost:3000/admin';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

/** Main admin home (…/admin). Superadmins use this to leave the delivery console. */
export function mainAdminHref(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_MAIN_ADMIN_URL?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);
  if (process.env.NODE_ENV !== 'production') return DEV_MAIN_ADMIN_URL;
  return null;
}

/**
 * Absolute URL into the main admin app for a path under /admin.
 * Accepts `/admin/orders`, `orders`, or `/orders`.
 * Falls back to a same-origin `/admin/…` path when the env is unset (middleware redirects).
 */
export function mainAdminPage(adminPath: string): string {
  let path = adminPath.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.startsWith('/admin')) {
    path = `/admin${path}`;
  }

  const base = mainAdminHref();
  if (!base) return path;

  const origin = base.endsWith('/admin') ? base.slice(0, -'/admin'.length) : base;
  return `${trimTrailingSlash(origin)}${path}`;
}

export function openMainAdminPage(adminPath: string): void {
  const url = mainAdminPage(adminPath);
  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
}
