import type { NextRequest } from 'next/server';
import { proxyTo, resolveCoreOrigin } from '@/lib/runtimeProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = (req: NextRequest) => proxyTo(req, resolveCoreOrigin());

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
