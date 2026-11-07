import type { NextRequest } from 'next/server';
import { proxyTo, resolveApiOrigin } from '@/lib/runtimeProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const STICKER_AGENT = (process.env.CUP_STICKER_AGENT_URL || 'http://127.0.0.1:9177').replace(/\/$/, '');

async function proxyCupStickers(req: NextRequest): Promise<Response> {
  const pathname = req.nextUrl.pathname;
  // /api/cup-stickers/health → http://127.0.0.1:9177/health
  const subpath = pathname.replace(/^\/api\/cup-stickers\/?/, '') || 'health';
  const target = `${STICKER_AGENT}/${subpath}`;

  try {
    const init: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.text();
    }
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cup sticker agent unreachable';
    return Response.json(
      {
        ok: false,
        error: `${message}. Start tools/cup-sticker-agent/start.bat on this PC and keep that window open.`,
      },
      { status: 502 },
    );
  }
}

const handler = (req: NextRequest) => {
  if (req.nextUrl.pathname.startsWith('/api/cup-stickers')) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    return proxyCupStickers(req);
  }
  return proxyTo(req, resolveApiOrigin(req.nextUrl.pathname));
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
