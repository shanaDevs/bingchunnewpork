import type { NextConfig } from 'next';
import path from 'path';

/**
 * NOTE: `/api/*` and `/delivery-api/*` are proxied at RUNTIME by route handlers
 * (src/app/api/[...path]/route.ts, src/app/delivery-api/[...path]/route.ts) so CapRover env vars
 * (BACKEND_URL, DELIVERY_SERVICE_URL) take effect without rebuilding. Rewrites are frozen at build time,
 * which is what caused a 500 on every proxied call when the image was built without those values.
 *
 * Only socket.io stays a rewrite (route handlers cannot proxy websocket upgrades).
 */
const PRODUCTION_CORE_ORIGIN = 'https://bingchunsrilanka.com';

function getBackendOrigin(): string {
  const fromEnv = (process.env.BACKEND_URL || process.env.API_PROXY_URL || '').replace(/\/$/, '');
  const isLocal = /localhost|127\.0\.0\.1/i.test(fromEnv);
  if (fromEnv && !(process.env.NODE_ENV === 'production' && isLocal)) return fromEnv;
  return process.env.NODE_ENV === 'production' ? PRODUCTION_CORE_ORIGIN : 'http://localhost:4000';
}

const backendOrigin = getBackendOrigin();

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  async rewrites() {
    return [{ source: '/socket.io/:path*', destination: `${backendOrigin}/socket.io/:path*` }];
  },
};

export default nextConfig;
