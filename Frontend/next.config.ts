import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

/** Monorepo root when a parent workspace package.json exists; otherwise this app dir. */
function getOutputFileTracingRoot(): string {
  const parent = path.join(__dirname, "..");
  const parentPkgPath = path.join(parent, "package.json");
  try {
    if (fs.existsSync(parentPkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(parentPkgPath, "utf8")) as { workspaces?: unknown };
      if (pkg.workspaces) return parent;
    }
  } catch {
    /* CapRover/Docker copies Frontend as /app, so parent is not the monorepo. */
  }
  return __dirname;
}

function getBackendOrigin(): string {
  const fromEnv = (process.env.BACKEND_URL || process.env.API_PROXY_URL || '').replace(/\/$/, '');
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv) && !/\/\/bing-chung\.mp\.dartcodes\.com$/i.test(fromEnv)) {
    return fromEnv;
  }

  const api = process.env.NEXT_PUBLIC_API_URL || '/api';
  if (api.startsWith('/')) {
    if (process.env.NODE_ENV === 'production' && !fromEnv) {
      return 'https://bing-chun-ui2ow.ondigitalocean.app';
    }
    return fromEnv || 'http://localhost:4000';
  }

  return api.replace(/\/api\/?$/, '');
}

/**
 * Delivery Service origin (no `/delivery-api` suffix), mirroring
 * `getBackendOrigin()`. See `docs/27_Delivery_Service.md`.
 */
function getDeliveryServiceOrigin(): string {
  const fromEnv = process.env.DELIVERY_SERVICE_URL || process.env.NEXT_PUBLIC_DELIVERY_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '').replace(/\/delivery-api\/?$/, '');

  return 'http://localhost:4100';
}

const backendOrigin = getBackendOrigin();
const deliveryServiceOrigin = getDeliveryServiceOrigin();

function stripSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Shop browser traffic. Unset keeps the storefront on bing-chun-core. */
function getShopApiOrigin(): string {
  const shop = stripSlash(process.env.SHOP_API_URL || '');
  return shop || backendOrigin;
}

function getPosApiOrigin(): string {
  const pos = stripSlash(process.env.POS_API_URL || '');
  return pos || backendOrigin;
}

function getAdminApiOrigin(): string {
  const admin = stripSlash(process.env.ADMIN_API_URL || '');
  return admin || backendOrigin;
}

function getWebSurface(): 'shop' | 'pos' | 'admin' {
  const value = (process.env.WEB_SURFACE || 'shop').trim().toLowerCase();
  if (value === 'pos' || value === 'admin') return value;
  return 'shop';
}

const BASE_SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
] as const;

function buildConnectSrc(): string {
  const parts = ["'self'", 'https:', 'wss:'];
  try {
    parts.push(new URL(backendOrigin).origin);
  } catch {
    /* ignore invalid backend origin */
  }
  try {
    parts.push(new URL(deliveryServiceOrigin).origin);
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV !== 'production') {
    parts.push('http://localhost:*', 'ws://localhost:*');
  }
  return parts.join(' ');
}

const CONNECT_SRC = buildConnectSrc();

const SHOP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src ${CONNECT_SRC}`,
].join('; ');

const ADMIN_SCRIPT_SRC =
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const ADMIN_CSP_PARTS = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "frame-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  ADMIN_SCRIPT_SRC,
  `connect-src ${CONNECT_SRC}`,
];
if (process.env.NODE_ENV === 'production') {
  ADMIN_CSP_PARTS.push('upgrade-insecure-requests');
}
const ADMIN_CSP = ADMIN_CSP_PARTS.join('; ');

const ADMIN_ROUTE_HEADERS = [
  ...BASE_SECURITY_HEADERS,
  { key: 'Content-Security-Policy', value: ADMIN_CSP },
];

const SHOP_ROUTE_HEADERS = [
  ...BASE_SECURITY_HEADERS,
  { key: 'Content-Security-Policy', value: SHOP_CSP },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@bingchun/settlement'],
  // Monorepo: `.next/standalone/Frontend/server.js`.
  // CapRover/Docker (Frontend copied as /app): `.next/standalone/server.js`.
  outputFileTracingRoot: getOutputFileTracingRoot(),
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: ADMIN_ROUTE_HEADERS,
      },
      {
        source: '/',
        headers: SHOP_ROUTE_HEADERS,
      },
      {
        // Shop CSP only — skip /admin pages and proxied /api responses (PDF, JSON).
        source: '/((?!admin|api).*)',
        headers: SHOP_ROUTE_HEADERS,
      },
    ];
  },
  async redirects() {
    const surface = getWebSurface();
    const adminWeb = stripSlash(process.env.ADMIN_WEB_URL || '');
    if (surface === 'shop' && adminWeb) {
      return [
        {
          source: '/admin',
          destination: `${adminWeb}/admin`,
          permanent: false,
        },
        {
          source: '/admin/:path*',
          destination: `${adminWeb}/admin/:path*`,
          permanent: false,
        },
      ];
    }
    return [];
  },
  async rewrites() {
    // Production App Platform injects the API hostname only after the
    // container starts. A rewrite baked here would keep pointing at
    // localhost:4000. Request handlers under src/app/api and
    // src/app/delivery-api proxy with the live URL instead.
    if (process.env.NODE_ENV === 'production') return [];

    const surface = getWebSurface();
    const apiOrigin = surface === 'admin'
      ? getAdminApiOrigin()
      : surface === 'pos'
        ? getPosApiOrigin()
        : getShopApiOrigin();
    const rules: { source: string; destination: string }[] = [];

    // On shop surface, direct calls to staff APIs go to admin API if configured
    if (surface === 'shop') {
      const staffApi = getAdminApiOrigin();
      if (staffApi && staffApi !== apiOrigin) {
        rules.push(
          { source: '/api/admin/:path*', destination: `${staffApi}/api/admin/:path*` },
          { source: '/api/auth/admin/:path*', destination: `${staffApi}/api/auth/admin/:path*` },
        );
      }
    }

    rules.push(
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/socket.io/:path*', destination: `${apiOrigin}/socket.io/:path*` },
      // Delivery Service proxy — additive, only used once callers opt into
      // `/delivery-api/*` (e.g. `NEXT_PUBLIC_DELIVERY_API_URL=/delivery-api`).
      { source: '/delivery-api/:path*', destination: `${deliveryServiceOrigin}/delivery-api/:path*` },
    );
    return rules;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react'],
    // Wallet payouts-due (and similar admin reports) can exceed the default
    // ~30s proxy cut-off and surface as "socket hang up" in admin-web logs.
    proxyTimeout: 180_000,
  },
};

export default nextConfig;
