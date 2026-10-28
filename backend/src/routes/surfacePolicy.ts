import type { ApiSurface } from '../lib/apiSurface';

/** Prefixes a surface must never register. Shop must not expose staff admin writers. */
const FORBIDDEN_PREFIXES: Record<ApiSurface, readonly string[]> = {
  core: [],
  shop: ['/admin', '/refunds', '/internal', '/delivery'],
  pos: ['/payments', '/refunds', '/internal', '/delivery'],
  admin: ['/payments'],
};

export function assertSurfacePrefixes(surface: ApiSurface, prefixes: readonly string[]): void {
  const forbidden = new Set(FORBIDDEN_PREFIXES[surface]);
  const mounted = prefixes.filter((prefix) => forbidden.has(prefix));
  if (mounted.length > 0) {
    throw new Error(`${surface} API must not mount ${mounted.join(', ')}`);
  }
  if (surface === 'shop' && !prefixes.includes('/payments')) {
    throw new Error('shop API must mount /payments so checkout callbacks stay up when admin is down');
  }
  if (surface === 'shop' && prefixes.includes('/admin')) {
    throw new Error('shop API must not mount /admin');
  }
}

export type RouteRule = { methods: readonly string[]; pattern: RegExp };

const ID = '[^/]+';

export const SHOP_AUTH: RouteRule[] = [
  { methods: ['POST'], pattern: /^\/(register|login|phone\/login|phone\/check|google|facebook|otp\/request|otp\/verify|refresh|logout-all|password\/forgot|password\/reset|phone\/link\/request|phone\/link\/verify)$/ },
  { methods: ['GET'], pattern: /^\/(facebook\/start|facebook\/callback|social-config|me)$/ },
  { methods: ['PUT'], pattern: /^\/me$/ },
  { methods: ['DELETE'], pattern: /^\/me$/ },
];

export const STAFF_AUTH: RouteRule[] = [
  { methods: ['POST'], pattern: /^\/admin\/(login|refresh|logout|password\/forgot|password\/reset)$/ },
];

export const SHOP_MENU: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/(categories|toppings|products|specials\/today)$/ },
  { methods: ['GET'], pattern: new RegExp(`^/products/${ID}(/ratings)?$`) },
  { methods: ['POST'], pattern: new RegExp(`^/products/${ID}/rating$`) },
];

export const MENU_READ: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/(categories|toppings|products|specials\/today)$/ },
  { methods: ['GET'], pattern: new RegExp(`^/products/${ID}(/ratings)?$`) },
];

export const SHOP_STORES: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/(address\/autocomplete|address\/geocode|address\/reverse)$/ },
  { methods: ['GET'], pattern: /^\/$/ },
  { methods: ['GET'], pattern: new RegExp(`^/${ID}$`) },
  { methods: ['POST'], pattern: /^\/validate-delivery$/ },
];

export const SHOP_ORDERS: RouteRule[] = [
  { methods: ['POST'], pattern: /^\/$/ },
  { methods: ['GET'], pattern: /^\/my$/ },
  { methods: ['POST'], pattern: new RegExp(`^/${ID}/(confirm-payment|confirm-payhere-popup|rating|rider-rating|cancel)$`) },
  { methods: ['GET'], pattern: new RegExp(`^/${ID}$`) },
  { methods: ['POST'], pattern: /^\/payment-notify$/ },
];

export const POS_ORDERS: RouteRule[] = [
  { methods: ['POST'], pattern: /^\/$/ },
  { methods: ['GET'], pattern: /^\/(takeaway-queue|cashier-activity)$/ },
  { methods: ['PUT'], pattern: /^\/takeaway-queue\/reorder$/ },
  { methods: ['GET'], pattern: /^\/$/ },
  { methods: ['GET'], pattern: new RegExp(`^/${ID}$`) },
  { methods: ['PUT'], pattern: new RegExp(`^/${ID}/(status|items)$`) },
  { methods: ['PATCH'], pattern: new RegExp(`^/${ID}/contact$`) },
  { methods: ['POST'], pattern: new RegExp(`^/${ID}/(complete-takeaway|collect-payment)$`) },
];

export const ADMIN_ORDERS: RouteRule[] = [
  ...POS_ORDERS,
  { methods: ['GET'], pattern: new RegExp(`^/${ID}/conversation$`) },
];

export const SHOP_SETTINGS: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/(payment-methods|app|delivery-zones|cancel-reasons)$/ },
];

export const SHOP_PROMOS: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/$/ },
  { methods: ['POST'], pattern: /^\/(validate|eligible)$/ },
];

export const SHOP_SPIN: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/(offers|eligibility|my-claim)$/ },
  { methods: ['POST'], pattern: /^\/(play|validate)$/ },
];

export const SHOP_LOYALTY: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/summary$/ },
];

/** Cashier screens need their own permissions and order alerts, not wallets or stock writes. */
export const POS_ADMIN: RouteRule[] = [
  { methods: ['GET'], pattern: /^\/(me\/permissions|dashboard|notifications)$/ },
  { methods: ['PATCH'], pattern: new RegExp(`^/notifications/${ID}/read$`) },
  { methods: ['POST'], pattern: /^\/notifications\/(read-all|read-order)$/ },
];

export function prefixesFor(surface: ApiSurface): string[] {
  if (surface === 'core') {
    return [
      '/auth', '/menu', '/stores', '/cart', '/orders', '/refunds', '/addresses', '/promos',
      '/admin', '/settings', '/payments', '/notifications', '/delivery', '/loyalty',
      '/internal', '/wishlist', '/inventory', '/spin', '/',
    ];
  }
  if (surface === 'shop') {
    return [
      '/auth', '/menu', '/stores', '/cart', '/orders', '/addresses', '/promos', '/settings',
      '/payments', '/notifications', '/loyalty', '/wishlist', '/inventory', '/spin', '/',
    ];
  }
  if (surface === 'pos') {
    return ['/auth', '/menu', '/stores', '/orders', '/settings', '/admin'];
  }
  return ['/auth', '/menu', '/stores', '/orders', '/refunds', '/promos', '/admin', '/settings', '/loyalty', '/spin'];
}

const RULES: Record<Exclude<ApiSurface, 'core'>, Record<string, readonly RouteRule[] | 'all'>> = {
  shop: {
    '/auth': SHOP_AUTH,
    '/menu': SHOP_MENU,
    '/stores': SHOP_STORES,
    '/cart': 'all',
    '/orders': SHOP_ORDERS,
    '/addresses': 'all',
    '/promos': SHOP_PROMOS,
    '/settings': SHOP_SETTINGS,
    '/payments': 'all',
    '/notifications': 'all',
    '/loyalty': SHOP_LOYALTY,
    '/wishlist': 'all',
    '/inventory': 'all',
    '/spin': SHOP_SPIN,
    '/': 'all',
  },
  pos: {
    '/auth': STAFF_AUTH,
    '/menu': MENU_READ,
    '/stores': SHOP_STORES,
    '/orders': POS_ORDERS,
    '/settings': SHOP_SETTINGS,
    '/admin': POS_ADMIN,
  },
  admin: {
    '/auth': STAFF_AUTH,
    '/menu': 'all',
    '/stores': 'all',
    '/orders': ADMIN_ORDERS,
    '/refunds': 'all',
    '/promos': 'all',
    '/admin': 'all',
    '/settings': 'all',
    '/loyalty': 'all',
    '/spin': 'all',
  },
};

/** True when this surface would serve the method and `/api/...` path. */
export function surfaceAllows(surface: ApiSurface, method: string, apiPath: string): boolean {
  if (surface === 'core') return true;
  const path = apiPath.startsWith('/api') ? apiPath.slice(4) || '/' : apiPath;
  if (path === '/telegram/webhook') return surface === 'shop';
  const match = path.match(/^(\/[^/]+)(\/.*)?$/);
  if (!match) return false;
  const prefix = match[1];
  const rest = match[2] || '/';
  const rules = RULES[surface][prefix];
  if (!rules) return false;
  if (rules === 'all') return true;
  const verb = method.toUpperCase();
  return rules.some((rule) => rule.methods.includes(verb) && rule.pattern.test(rest));
}
