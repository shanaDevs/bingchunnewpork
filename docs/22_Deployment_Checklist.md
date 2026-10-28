# 22 — Deployment Checklist

Use before promoting to production (CapRover / Compose).

---

## Pre-deploy

- [ ] Code reviewed and merged to `main` (or release branch)
- [ ] `npm run test:unit` passes
- [ ] Playwright E2E run against staging (if available)
- [ ] No secrets committed (`.env`, service account JSON, tokens)
- [ ] Changelog / release notes updated ([24_Change_Log.md](24_Change_Log.md))

---

## Database

- [ ] MySQL 8 provisioned with backups enabled
- [ ] `DATABASE_URL` verified from CapRover backend container
- [ ] Schema applied (`db push` / migrate / confirm ensure* on boot)
- [ ] Seed run **only** if empty environment (skip on existing prod)
- [ ] Wallet/commission data sanity-checked after migrate

---

## Backend environment

- [ ] Strong unique `JWT_SECRET` and `JWT_REFRESH_SECRET` (not defaults)
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL`, `ADMIN_URL`, `API_BASE_URL` match real HTTPS domains
- [ ] PayHere live/sandbox credentials in DB settings or env
- [ ] DigitalOcean Spaces keys + bucket + endpoint for uploads
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` set for push
- [ ] Google Maps / OAuth / Facebook IDs as required
- [ ] `SMS_PROVIDER` / `EMAIL_PROVIDER` left at `mock` **or** real adapters completed (Dialog/SendGrid currently Not Implemented)
- [ ] CORS allowlist does not rely on leftover LAN IPs for production traffic

---

## Frontend

- [ ] Image built with correct `NEXT_PUBLIC_API_URL` (production often `/api`)
- [ ] `BACKEND_URL` / `API_PROXY_URL` set for Next.js API proxy to backend host
- [ ] `NEXT_PUBLIC_SOCKET_URL` / site URL correct
- [ ] Social client IDs set if social login required
- [ ] Smoke test: home → menu → checkout → track
- [ ] Smoke test: admin login → orders → dashboard

---

## CapRover / CI

- [ ] GitHub secrets `CAPROVER_BACKEND_TOKEN`, `CAPROVER_FRONTEND_TOKEN` set
- [ ] CapRover Docker registry credentials for `ghcr.io` (PAT with `read:packages` if packages are private)
- [ ] GitHub Actions **CI/CD** green on `production` (test + build + deploy)
- [ ] Confirm apps `bing-chun-backend` and `bing-chung` healthy
- [ ] Custom domains + SSL active
- [ ] Health check: `GET https://<backend>/health`

---

## Payments & finance

- [ ] PayHere notify URL reachable publicly
- [ ] Sandbox test order then live test with small amount
- [ ] Wallet credit appears after paid order
- [ ] Settlement receipt upload path writable (`public/settlements` or Spaces)

---

## Mobile

- [ ] Customer APK/IPA built with `--dart-define=API_BASE_URL=https://<prod>/api`
- [ ] Driver app points to production API
- [ ] Remove/disable demo PIN display for store builds
- [ ] Android FCM verified; iOS push noted as incomplete unless configured outside repo

---

## Post-deploy smoke

- [ ] Customer places takeaway order
- [ ] Customer places delivery order (if delivery enabled)
- [ ] Branch updates status
- [ ] Driver completes a job (staging)
- [ ] Admin views dashboard and a report
- [ ] Logout/login refresh works for admin

---

## Rollback

- [ ] Previous CapRover image tag known
- [ ] DB backup taken before schema changes
- [ ] Rollback procedure agreed (redeploy previous image; restore DB if schema incompatible)

---

## Related

- [13_Deployment_Guide.md](13_Deployment_Guide.md)
- [23_Maintenance_Guide.md](23_Maintenance_Guide.md)
