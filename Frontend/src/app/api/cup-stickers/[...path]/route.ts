import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Cup sticker jobs can take a while (one GDI print per cup). */
export const maxDuration = 120;

const AGENT_ORIGIN = (process.env.CUP_STICKER_AGENT_URL || 'http://127.0.0.1:9177').replace(/\/$/, '');

async function proxy(req: NextRequest, pathSegments: string[]) {
  const subpath = pathSegments.filter(Boolean).join('/');
  const target = `${AGENT_ORIGIN}/${subpath}`;

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
    const message =
      err instanceof Error
        ? err.message
        : 'Cup sticker agent is not reachable on this PC';
    return Response.json(
      {
        ok: false,
        error:
          `${message}. Start tools/cup-sticker-agent/start.bat on the cashier PC and keep that window open.`,
      },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
