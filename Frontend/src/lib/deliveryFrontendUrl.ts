const DEV_DELIVERY_FRONTEND_ORIGIN = 'http://localhost:3100';

/** Origin of the delivery ops console, without a trailing slash. */
export function deliveryFrontendOrigin(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_DELIVERY_FRONTEND_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return DEV_DELIVERY_FRONTEND_ORIGIN;
  return null;
}

/**
 * Absolute delivery-console URL for a main-admin path that still lives on the portal.
 * Delivery operations and live drivers stay in this app. Only the wallet leaves.
 * Returns null when no console origin is configured.
 */
export function deliveryFrontendHref(pathname: string): string | null {
  const origin = deliveryFrontendOrigin();
  if (!origin) return null;

  if (pathname === '/admin/delivery-wallet' || pathname.startsWith('/admin/delivery-wallet/')) {
    return `${origin}/wallet`;
  }
  return null;
}

export function isExternalHref(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://');
}
