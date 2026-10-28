const DEV_MAIN_ADMIN_URL = 'http://localhost:3000/admin';

/** Main admin home. Superadmins use this to leave the delivery console. */
export function mainAdminHref(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_MAIN_ADMIN_URL?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return DEV_MAIN_ADMIN_URL;
  return null;
}
