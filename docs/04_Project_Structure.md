# 04 — Project Structure

## 1. Repository root

| Path | Responsibility |
|------|----------------|
| `package.json` | npm workspaces, orchestrates `dev`, `build`, `db:*`, `test:*`, Flutter helpers |
| `docker-compose.yml` | MySQL 8 + backend + frontend services |
| `.github/workflows/ci-cd.yml` | GitHub Actions: test, build images to GHCR, CapRover deploy on `production` |
| `.gitlab-ci.yml` | Legacy GitLab CI (same CapRover apps) |
| `playwright.config.ts` | E2E config (baseURL localhost:3000) |
| `README.md` | Quick start |
| `docs/` | Enterprise documentation (this suite) |
| `e2e/` | Playwright specs + page objects |
| `scripts/flutter.cmd` | Windows Flutter runner helper |
| `playwright-report/`, `test-results/` | Generated E2E artifacts |

---

## 2. `backend/`

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | HTTP + Socket.io bootstrap, static mounts, schema ensure on boot |
| `src/config/index.ts` | Env-driven configuration object |
| `src/routes/` | Express routers mounted under `/api` (incl. `loyalty.ts`) |
| `src/controllers/` | HTTP handlers |
| `src/middleware/` | Auth, permissions, rate limit, upload, errors |
| `src/lib/` | Domain logic (pricing, wallet, delivery, FCM, schema patches, …) |
| `src/services/socialAuthService.ts` | Google/Facebook verify + user upsert |
| `src/integrations/` | Payment, SMS, email, maps adapters |
| `src/utils/` | Helpers (phone, geo, order number, API response) |
| `src/scripts/` | One-off backfills (wallets, withdrawals, …) |
| `prisma/schema.prisma` | Data model |
| `prisma/seed.ts` | Seed roles, stores, menu, demo users |
| `prisma/seed-dummy-data.ts` | Optional feed (`npm run db:feed`) |
| `prisma/migrations/*.sql` | Ad-hoc SQL patches (not full Migrate history) |
| `tests/` | Vitest unit/controller tests |
| `public/` | Static brand/mascots/products/invoices/settlements |
| `Dockerfile`, `docker-entrypoint.sh` | Production container |
| `deploy/` | CapRover captain-definition + deploy scripts |
| `env.example` | Documented env template |

**Not present:** `repositories/` folder.

---

## 3. `frontend/`

| Path | Responsibility |
|------|----------------|
| `src/app/` | App Router pages (storefront + `/admin/*`) |
| `src/app/layout.tsx` | Root layout, fonts, Providers |
| `src/app/admin/layout.tsx` | Admin shell (sidebar, auth gate) |
| `src/components/` | UI by domain: admin, cart, menu, order, auth, ui, … |
| `src/hooks/` | Session guard, sockets, hydration helpers |
| `src/lib/` | `api.ts`, socket client, admin auth helpers, utils |
| `src/store/` | Zustand: auth, cart, theme, confirm |
| `src/types/` | Shared TS types |
| `public/` | Brand, mascots, products, promos, PWA manifest |
| `deploy/` | CapRover / prebuilt Docker deploy |
| `Dockerfile` | Next standalone image |
| `env.example` | Public env template |
| `README.md` | Still create-next-app boilerplate (not project-specific) |

**Not present:** `middleware.ts`, React Context providers for auth, frontend unit tests.

---

## 4. `mobile/` (driver)

| Path | Responsibility |
|------|----------------|
| `lib/app.dart` | GoRouter routes |
| `lib/screens/` | Login, jobs, job detail, map, order, dashboard |
| `lib/providers/` | Riverpod notifiers |
| `lib/services/` | API client, job/auth/route services |
| `lib/config/api_config.dart` | Base URL (defaults to production API unless dart-define) |
| `lib/data/mock_*` | UI preview fixtures (`kUiPreviewMode`) |
| `pubspec.yaml` | `bing_chun_delivery` 1.0.0+1 |

Orphan/legacy: `RouteScreen` / `route_service` not linked from current router (dead path).

---

## 5. `customer_mobile/`

| Path | Responsibility |
|------|----------------|
| `lib/app.dart` | Splash, shell tabs, checkout, track, profile subroutes |
| `lib/providers/` | Auth, cart, orders, fulfillment, theme |
| `lib/config/api_config.dart` | **Default hardcoded LAN IP** unless `API_BASE_URL` dart-define |
| `lib/screens/` | Menu, cart, checkout, PayHere webview, profile, etc. |
| `android/app/google-services.json` | Android FCM |
| iOS Firebase plist / `firebase_options.dart` | Not present (iOS push incomplete) |

---

## 6. Major backend files (quick reference)

| File | Role |
|------|------|
| `routes/index.ts` | Mounts all API modules |
| `controllers/orderController.ts` | Place order, status, payments, ratings |
| `controllers/walletController.ts` | Wallets, withdrawals, settle |
| `lib/pricing.ts` | Unit price (size + toppings) |
| `lib/orderStatus.ts` | Status machine |
| `lib/commission.ts` | Commission slabs / fees |
| `lib/walletService.ts` | Wallet ledger operations |
| `lib/orderClustering.ts` | Delivery batching |
| `lib/roadRouting.ts` | OSRM integration |
| `middleware/auth.ts` | JWT + role guards |
| `middleware/permission.ts` | Menu CRUD permissions |

---

## 7. Related

- [10_Backend_Documentation.md](10_Backend_Documentation.md)
- [09_Frontend_Documentation.md](09_Frontend_Documentation.md)
