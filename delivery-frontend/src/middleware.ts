import { NextRequest, NextResponse } from 'next/server';

/**
 * Delivery console has no /admin/* pages — those live on the main admin app.
 * Redirect so relative links and RSC prefetches do not 404 on this host.
 */
function resolveMainAdminOrigin(): string | null {
  const raw =
    process.env.MAIN_ADMIN_URL?.trim() ||
    process.env.NEXT_PUBLIC_MAIN_ADMIN_URL?.trim() ||
    process.env.ADMIN_WEB_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!pathname.startsWith('/admin')) return NextResponse.next();

  const origin = resolveMainAdminOrigin();
  if (!origin) return NextResponse.next();

  return NextResponse.redirect(new URL(`${pathname}${search}`, origin));
}

export const config = {
  matcher: ['/admin/:path*'],
};
