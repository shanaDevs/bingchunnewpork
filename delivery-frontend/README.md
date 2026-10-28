# Delivery frontend

Standalone delivery operations console (port **3100**). The main `Frontend/` app is unchanged.

## Setup

```bash
npm install
npm run sync-from-main -w @bingchun/delivery-frontend   # refresh copied UI from Frontend
npm run dev:delivery-frontend   # or: npm run dev from repo root (starts backend, main frontend, delivery-service, and this app)
```

Uses same-origin rewrites to core (`/api`) and delivery-service (`/delivery-api`). Admin cookies from `/login` work against core auth.

Delivery admin APIs (jobs, drivers, wallet, etc.) call **`/delivery-api/admin/...`** via `resolveAdminRequestUrl` in `src/lib/deliveryApi.ts`. Auth, stores, and notifications still use core `/api`.

Set `NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=true` to force all admin paths through core (e.g. when testing without delivery-service).

## Env

Local dev: copy `env.example` → `.env.local`.

Production: pass build args when building the image (`NEXT_PUBLIC_API_URL=/api` plus `BACKEND_URL` / `API_PROXY_URL`). See [`deploy/env.deploy.example`](deploy/env.deploy.example) for a full `docker build` example and CapRover runtime variables.

- `BACKEND_URL` / `DELIVERY_SERVICE_URL` — Next rewrites in `next.config.ts` (build + runtime)
- `NEXT_PUBLIC_API_URL` — client API base (must be set at **build** time for deploys)
