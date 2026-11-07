import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function surface(): 'shop' | 'pos' | 'admin' {
  const value = (process.env.WEB_SURFACE || 'shop').trim().toLowerCase();
  if (value === 'pos' || value === 'admin') return value;
  return 'shop';
}

function isAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next')
    || pathname.startsWith('/api')
    || pathname.startsWith('/cup-sticker-agent')
    || pathname.startsWith('/socket.io')
    || pathname.startsWith('/delivery-api')
    || pathname.includes('.')
  );
}

function withNoStore(res: NextResponse): NextResponse {
  // Prevent CDN from caching RSC flight (text/x-component) as the document.
  res.headers.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.headers.set('CDN-Cache-Control', 'no-store');
  res.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  return res;
}

export function middleware(request: NextRequest) {
  const current = surface();
  const { pathname } = request.nextUrl;
  if (isAsset(pathname)) return NextResponse.next();

  if (current === 'shop') {
    if (pathname.startsWith('/admin')) {
      const adminWeb = (process.env.ADMIN_WEB_URL || '').trim().replace(/\/$/, '');
      if (adminWeb) {
        return NextResponse.redirect(`${adminWeb}${pathname}${request.nextUrl.search}`);
      }
    }
    return NextResponse.next();
  }

  if (current === 'pos') {
    const allowed = pathname === '/admin'
      || pathname.startsWith('/admin/login')
      || pathname.startsWith('/admin/orders')
      || pathname.startsWith('/admin/pos');
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return withNoStore(NextResponse.redirect(url));
    }
  }

  if (current === 'admin' && !pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    return withNoStore(NextResponse.redirect(url));
  }

  // Always no-store on admin/pos HTML + RSC so Cloudflare cannot poison /admin.
  if (current === 'admin' || current === 'pos') {
    return withNoStore(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
