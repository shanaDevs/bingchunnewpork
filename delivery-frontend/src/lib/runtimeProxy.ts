import type { NextRequest } from 'next/server';

/**
 * Runtime reverse proxy used by `/api/*` and `/delivery-api/*`.
 *
 * Next.js `rewrites()` are frozen into routes-manifest.json at BUILD time, so a build made without the
 * right BACKEND_URL / DELIVERY_SERVICE_URL permanently proxies to localhost (every call -> 500
 * "Internal Server Error"). Route handlers read process.env on every request instead, so CapRover
 * runtime env vars always win. A missing production URL returns 502 instead of
 * calling a hardcoded host.
 */

const isLocalhost = (url: string) => /localhost|127\.0\.0\.1/i.test(url);
const clean = (url: string | undefined) => (url ?? '').trim().replace(/\/+$/, '');

function usable(url: string): string {
  if (!url) return '';
  if (process.env.NODE_ENV === 'production' && isLocalhost(url)) return '';
  return url;
}

/** Map starter DO host → primary custom domain so proxy never hits a 302 that strips POST bodies. */
function rewriteStarterAdminOrigin(origin: string): string {
  if (!origin) return origin;
  try {
    const u = new URL(origin);
    if (u.hostname.toLowerCase() === 'bingchun-admin-a4ndy.ondigitalocean.app') {
      return 'https://admin.bingchunsrilanka.com';
    }
  } catch {
    /* keep */
  }
  return origin;
}

export function resolveCoreOrigin(): string {
  const fromEnv = clean(process.env.BACKEND_URL) || clean(process.env.API_PROXY_URL);
  const origin = rewriteStarterAdminOrigin(usable(fromEnv));
  if (origin) return origin;
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000';
}

export function resolveDeliveryOrigin(): string {
  const fromEnv = clean(process.env.DELIVERY_SERVICE_URL) || clean(process.env.NEXT_PUBLIC_DELIVERY_API_URL);
  const origin = usable(fromEnv.replace(/\/delivery-api$/, ''));
  if (origin) return origin;
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4100';
}

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
  // Let fetch negotiate encoding itself; we return the decoded body.
  headers.delete('accept-encoding');

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error `duplex` is required by Node fetch for streamed request bodies
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
  // Preserve Set-Cookie, but drop Domain so the browser binds cookies to this host
  // (delivery console → /api proxy → shop). Cross-origin Domain=shop would 401 every call.
  for (const cookie of upstream.headers.getSetCookie()) {
    outHeaders.append(
      'set-cookie',
      cookie.replace(/;\s*Domain=[^;]*/gi, ''),
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
