import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Fallback only for legacy deployments that have not set BACKEND_URL/API_PROXY_URL.
const LEGACY_PRODUCTION_BACKEND = 'https://bing-chung-b.mp.dartcodes.com';

function backendOrigin(): string {
  const fromEnv = (process.env.BACKEND_URL || process.env.API_PROXY_URL || '').replace(/\/$/, '');
  // Guard against accidentally pointing the API proxy at the frontend's own (dead) legacy host.
  if (
    fromEnv &&
    !/localhost|127\.0\.0\.1/i.test(fromEnv) &&
    !/\/\/bing-chung\.mp\.dartcodes\.com$/i.test(fromEnv)
  ) {
    return fromEnv;
  }
  return LEGACY_PRODUCTION_BACKEND;
}

function redirectHome(req: NextRequest, path = '/') {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), 302);
}

function hasReturnPayload(req: NextRequest): boolean {
  const q = req.nextUrl.searchParams;
  return Boolean(q.get('payment') || q.get('signature'));
}

async function forwardToApi(req: NextRequest): Promise<NextResponse> {
  const target = `${backendOrigin()}/api/payments/webxpay-return${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    accept: req.headers.get('accept') || '*/*',
  };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    redirect: 'manual',
  });

  const location = upstream.headers.get('location');
  if (location) {
    const status = upstream.status >= 300 && upstream.status < 400 ? upstream.status : 302;
    return NextResponse.redirect(location, status);
  }

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    if (!hasReturnPayload(req)) {
      return redirectHome(req);
    }
    return await forwardToApi(req);
  } catch {
    return redirectHome(req);
  }
}

export async function POST(req: NextRequest) {
  try {
    return await forwardToApi(req);
  } catch {
    return redirectHome(req, '/checkout?payment=failed');
  }
}
