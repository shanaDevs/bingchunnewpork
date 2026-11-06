import fs from 'fs';
import path from 'path';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type AuthKind = 'Public' | 'Optional' | 'Customer' | 'Admin' | 'Driver' | 'Internal';

export type RouteEntry = {
  method: HttpMethod;
  /** Express-style path, e.g. `/api/orders/:id`. */
  path: string;
  auth: AuthKind;
  permission?: string;
  notes: string[];
  multipart: boolean;
  multipartFields: string[];
  /** Which process serves this path. */
  server: 'core' | 'delivery';
};

type Mount = {
  file: string;
  prefix: string;
  auth?: AuthKind;
  server: 'core' | 'delivery';
};

const CORE_MOUNTS: Mount[] = [
  { file: 'auth.ts', prefix: '/api/auth', server: 'core' },
  { file: 'menu.ts', prefix: '/api/menu', server: 'core' },
  { file: 'stores.ts', prefix: '/api/stores', server: 'core' },
  { file: 'cart.ts', prefix: '/api/cart', auth: 'Customer', server: 'core' },
  { file: 'orders.ts', prefix: '/api/orders', server: 'core' },
  { file: 'refunds.ts', prefix: '/api/refunds', auth: 'Admin', server: 'core' },
  { file: 'addresses.ts', prefix: '/api/addresses', auth: 'Customer', server: 'core' },
  { file: 'promos.ts', prefix: '/api/promos', server: 'core' },
  { file: 'admin.ts', prefix: '/api/admin', auth: 'Admin', server: 'core' },
  { file: 'adminDelivery.ts', prefix: '/api/admin', auth: 'Admin', server: 'core' },
  { file: 'settings.ts', prefix: '/api/settings', server: 'core' },
  { file: 'payments.ts', prefix: '/api/payments', auth: 'Public', server: 'core' },
  { file: 'notifications.ts', prefix: '/api/notifications', auth: 'Customer', server: 'core' },
  { file: 'delivery.ts', prefix: '/api/delivery', auth: 'Driver', server: 'core' },
  { file: 'loyalty.ts', prefix: '/api/loyalty', server: 'core' },
  { file: 'internal.ts', prefix: '/api/internal', auth: 'Internal', server: 'core' },
  { file: 'wishlist.ts', prefix: '/api/wishlist', server: 'core' },
  { file: 'inventoryReservations.ts', prefix: '/api/inventory', server: 'core' },
  { file: 'spin.ts', prefix: '/api/spin', server: 'core' },
  { file: 'messaging.ts', prefix: '/api', auth: 'Public', server: 'core' },
];

const DELIVERY_MOUNTS: Mount[] = [
  { file: 'auth.ts', prefix: '/delivery-api/auth', server: 'delivery' },
  { file: 'jobs.ts', prefix: '/delivery-api/jobs', auth: 'Driver', server: 'delivery' },
  { file: 'orders.ts', prefix: '/delivery-api/orders', auth: 'Driver', server: 'delivery' },
  { file: 'me.ts', prefix: '/delivery-api/me', auth: 'Driver', server: 'delivery' },
  { file: 'locations.ts', prefix: '/delivery-api/locations', auth: 'Driver', server: 'delivery' },
  { file: 'route.ts', prefix: '/delivery-api/route', auth: 'Driver', server: 'delivery' },
  { file: 'internal.ts', prefix: '/delivery-api/internal', auth: 'Internal', server: 'delivery' },
  { file: 'admin.ts', prefix: '/delivery-api/admin', auth: 'Admin', server: 'delivery' },
];

function firstExisting(candidates: string[]): string | null {
  return candidates.find((dir) => fs.existsSync(dir)) ?? null;
}

export function backendRoutesDir(): string {
  const found = firstExisting([
    path.join(__dirname, '..', 'routes'),
    path.join(process.cwd(), 'src', 'routes'),
    path.join(process.cwd(), 'dist', 'routes'),
  ]);
  if (!found) throw new Error('Backend route directory not found');
  return found;
}

export function deliveryRoutesDir(): string | null {
  return firstExisting([
    path.resolve(__dirname, '../../../delivery-service/src/routes'),
    path.resolve(process.cwd(), '../delivery-service/src/routes'),
    path.resolve(process.cwd(), 'delivery-service/src/routes'),
  ]);
}

function resolveRouteFile(dir: string, file: string): string | null {
  const ts = path.join(dir, file);
  const js = path.join(dir, file.replace(/\.ts$/, '.js'));
  if (fs.existsSync(ts)) return ts;
  if (fs.existsSync(js)) return js;
  return null;
}

function joinPath(prefix: string, routePath: string): string {
  if (routePath === '/' || routePath === '') return prefix || '/';
  return `${prefix}${routePath.startsWith('/') ? routePath : `/${routePath}`}`.replace(/\/{2,}/g, '/');
}

type RawRoute = { method: HttpMethod; path: string; raw: string };

/** Pull `router.METHOD('/path', ...)` calls, including multiline argument lists. */
export function extractRouteCalls(source: string): RawRoute[] {
  const out: RawRoute[] = [];
  const re = /router\.(get|post|put|patch|delete)\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const method = match[1].toUpperCase() as HttpMethod;
    let i = re.lastIndex;
    let depth = 1;
    let quote: string | null = null;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (quote) {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') {
        quote = c;
      } else if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      i += 1;
    }
    const args = source.slice(re.lastIndex, i - 1);
    const pathMatch = args.match(/['"`](\/[^'"`]*)['"`]/);
    if (!pathMatch) continue;
    out.push({ method, path: pathMatch[1], raw: args });
  }
  return out;
}

function classify(
  mount: Mount,
  routePath: string,
  raw: string,
): Pick<RouteEntry, 'auth' | 'permission' | 'notes' | 'multipart' | 'multipartFields'> {
  const notes: string[] = [];
  const perm = raw.match(/requirePermission\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/);
  const anyPerm = raw.match(/requireAnyPermission\(\s*\[([^\]]+)\]\s*,\s*'([^']+)'\s*\)/);
  let permission: string | undefined;
  if (perm) permission = `${perm[1]} ${perm[2]}`;
  else if (anyPerm) {
    const names = anyPerm[1].replace(/['"\s]/g, '');
    permission = `${names} ${anyPerm[2]}`;
  }
  if (raw.includes('requireSystemAdmin')) notes.push('SYSTEM_ADMIN');
  if (raw.includes('requireBranchAdminOnly')) notes.push('Branch admin only');
  if (raw.includes('blockCashier')) notes.push('Cashiers blocked');
  if (raw.includes('requireBranchOrderWrite')) notes.push('Branch order write');
  if (raw.includes('requireSystemOrDeliveryAdmin')) notes.push('System or delivery admin');
  if (raw.includes('requireDeliveryWalletUnlock')) notes.push('Delivery wallet must be unlocked first');
  if (raw.includes('optionalAuth')) notes.push('Guest allowed; send a customer JWT when the caller is signed in');

  const fields = new Set<string>();
  for (const m of raw.matchAll(/\.single\(\s*'([^']+)'\s*\)/g)) fields.add(m[1]);
  for (const m of raw.matchAll(/name:\s*'([^']+)'/g)) fields.add(m[1]);
  const multipart = fields.size > 0 || /Upload/.test(raw);

  const fullPath = joinPath(mount.prefix, routePath);
  let auth: AuthKind;
  if (mount.file === 'wishlist.ts' && routePath.startsWith('/shared/')) auth = 'Public';
  else if (fullPath === '/api/auth/admin/socket-token') auth = 'Admin';
  else if (fullPath === '/delivery-api/admin/health') auth = 'Public';
  else if (mount.auth) auth = mount.auth;
  else if (raw.includes('requireInternalSecret')) auth = 'Internal';
  else if (raw.includes('requireDeliveryDriver')) auth = 'Driver';
  else if (
    raw.includes('requireAdmin') ||
    raw.includes('requireSystemAdmin') ||
    raw.includes('requirePermission') ||
    raw.includes('requireAnyPermission') ||
    raw.includes('requireBranchAdminOnly') ||
    raw.includes('requireSystemOrDeliveryAdmin')
  ) {
    auth = 'Admin';
  } else if (raw.includes('requireActiveCustomer') || (raw.includes('authenticate') && !raw.includes('optionalAuth'))) {
    auth = 'Customer';
  } else if (raw.includes('optionalAuth')) auth = 'Optional';
  else auth = 'Public';

  return { auth, permission, notes, multipart, multipartFields: [...fields] };
}

function healthRoutes(): RouteEntry[] {
  const base = {
    auth: 'Public' as const,
    notes: [] as string[],
    multipart: false,
    multipartFields: [] as string[],
    server: 'core' as const,
  };
  return [
    { ...base, method: 'GET', path: '/' },
    { ...base, method: 'GET', path: '/health' },
    { ...base, method: 'GET', path: '/health/spaces' },
    { ...base, method: 'GET', path: '/api/health/spaces' },
  ];
}

function loadMounts(dir: string | null, mounts: Mount[]): RouteEntry[] {
  if (!dir) return [];
  const routes: RouteEntry[] = [];
  for (const mount of mounts) {
    const filePath = resolveRouteFile(dir, mount.file);
    if (!filePath) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    for (const call of extractRouteCalls(source)) {
      const classified = classify(mount, call.path, call.raw);
      routes.push({
        method: call.method,
        path: joinPath(mount.prefix, call.path),
        server: mount.server,
        ...classified,
      });
    }
  }
  return routes;
}

let cached: RouteEntry[] | null = null;

/** Every HTTP route on the core API, plus the delivery microservice routes when that source tree is present. */
export function loadRouteCatalog(): RouteEntry[] {
  if (cached) return cached;
  const seen = new Set<string>();
  const routes: RouteEntry[] = [];
  for (const route of [
    ...healthRoutes(),
    ...loadMounts(backendRoutesDir(), CORE_MOUNTS),
    ...loadMounts(deliveryRoutesDir(), DELIVERY_MOUNTS),
  ]) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push(route);
  }
  cached = routes;
  return routes;
}

export function resetRouteCatalogCache(): void {
  cached = null;
}
