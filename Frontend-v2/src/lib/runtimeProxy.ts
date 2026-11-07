import type { NextRequest } from 'next/server';

/**
 * Request-time reverse proxy for `/api/*` and `/delivery-api/*`.
 *
 * `next.config` rewrites are frozen at image build. App Platform's private API
 * hostname is only known after the container starts, so route handlers read
 * BACKEND_URL / SHOP_API_URL / POS_API_URL / ADMIN_API_URL on every request.
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const clean = (url: string | undefined) => (url ?? '').trim().replace(/\/+$/, '');
const isLocalhost = (url: string) => /localhost|127\.0\.0\.1/i.test(url);

function usable(url: string): string {
  if (!url) return '';
  if (process.env.NODE_ENV === 'production' && isLocalhost(url)) return '';
  return url;
}

function surface(): 'shop' | 'pos' | 'admin' {
  const value = (process.env.WEB_SURFACE || 'shop').trim().toLowerCase();
  if (value === 'pos' || value === 'admin') return value;
  return 'shop';
}

/** API origin for this request, with no `/api` suffix. */
export function resolveApiOrigin(pathname: string): string {
  const backend = usable(clean(process.env.BACKEND_URL) || clean(process.env.API_PROXY_URL));
  const shop = usable(clean(process.env.SHOP_API_URL)) || backend;
  const pos = usable(clean(process.env.POS_API_URL)) || backend;
  const admin = usable(clean(process.env.ADMIN_API_URL)) || backend;
  const current = surface();
  let origin = current === 'admin' ? admin : current === 'pos' ? pos : shop;

  if (current === 'shop') {
    const staff = usable(clean(process.env.ADMIN_API_URL));
    const staffPath = pathname.startsWith('/api/admin') || pathname.startsWith('/api/auth/admin');
    if (staff && staffPath) origin = staff;
  }

  return origin;
}

export function resolveDeliveryOrigin(): string {
  const fromEnv = clean(process.env.DELIVERY_SERVICE_URL) || clean(process.env.NEXT_PUBLIC_DELIVERY_API_URL);
  return usable(fromEnv.replace(/\/delivery-api$/, ''));
}

export async function proxyTo(req: NextRequest, origin: string): Promise<Response> {
  if (!origin) {
    return Response.json(
      { success: false, message: 'Upstream URL is not configured' },
      { status: 502 },
    );
  }

  const target = `${origin}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.delete('accept-encoding');

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error Node fetch requires duplex for a streamed body
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch (err) {
    console.error(`[proxy] ${req.method} ${target} failed:`, err);
    return Response.json(
      { success: false, message: 'Upstream service unreachable', upstream: origin },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.has(k) || k === 'content-encoding' || k === 'set-cookie') return;
    outHeaders.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) outHeaders.append('set-cookie', cookie);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
