# Documentation Update Report

## Summary

| Field | Value |
|-------|--------|
| **Date** | 2026-07-25 |
| **Scope** | Sync existing `/docs` with current repository (no full regen) |
| **App versions** | Unchanged — root/backend `1.0.0`, frontend `0.1.0`, Flutter `1.0.0+1` |

### Files analysed

- `backend/src/routes/*`, `backend/src/controllers/*`, `backend/src/lib/*`, `backend/src/middleware/auth.ts`, `backend/src/config/index.ts`
- `backend/prisma/schema.prisma`
- `backend/tests/**`, `e2e/**`
- `frontend/src/app/**/page.tsx`, `frontend/env.example`, package manifests
- `.gitlab-ci.yml`, `docker-compose.yml`
- Existing docs `01`–`26`, `README.md`

### Documents updated

| Document | Reason |
|----------|--------|
| [01_Project_Overview.md](01_Project_Overview.md) | Account pages + loyalty now implemented |
| [02_System_Architecture.md](02_System_Architecture.md) | Loyalty mount; JWT lifetime; permission keys |
| [03_Technology_Stack.md](03_Technology_Stack.md) | Broader Vitest coverage statement |
| [04_Project_Structure.md](04_Project_Structure.md) | `loyalty` route module |
| [05_Database_Documentation.md](05_Database_Documentation.md) | Order default status + cash fields |
| [06_API_Documentation.md](06_API_Documentation.md) | New endpoints; permissions; initial status |
| [07_Business_Logic.md](07_Business_Logic.md) | RECEIVED initial status; cash tender |
| [08_Authentication_Authorization.md](08_Authentication_Authorization.md) | JWT TTL matrix; SALES/DELIVERY permissions |
| [09_Frontend_Documentation.md](09_Frontend_Documentation.md) | Account addresses/loyalty/notifications pages |
| [10_Backend_Documentation.md](10_Backend_Documentation.md) | `loyaltyController` + lib inventory |
| [11_Environment_Configuration.md](11_Environment_Configuration.md) | JWT_* TTL vars; BACKEND_URL/API_PROXY; CI hosts |
| [13_Deployment_Guide.md](13_Deployment_Guide.md) | Same-origin `/api` + `bing-chung-b` proxy |
| [14_Testing_Guide.md](14_Testing_Guide.md) | Expanded backend test families |
| [15_Security_Documentation.md](15_Security_Documentation.md) | Customer non-expiring access tokens |
| [18_Known_Issues.md](18_Known_Issues.md) | Removed stale account-page gap |
| [20_User_Guide.md](20_User_Guide.md) | Account addresses/loyalty/notifications |
| [22_Deployment_Checklist.md](22_Deployment_Checklist.md) | Proxy env checklist |
| [24_Change_Log.md](24_Change_Log.md) | New sync entry |
| [26_Project_Report.md](26_Project_Report.md) | Ordering/account + test posture |

### Documents unchanged

| Document | Notes |
|----------|--------|
| [12_Installation_Guide.md](12_Installation_Guide.md) | Install flow still accurate |
| [16_Performance_Analysis.md](16_Performance_Analysis.md) | No material perf architecture change |
| [17_Code_Quality_Report.md](17_Code_Quality_Report.md) | Smells still valid; no forced rewrite |
| [19_Developer_Guide.md](19_Developer_Guide.md) | Conventions unchanged |
| [21_Admin_Guide.md](21_Admin_Guide.md) | Admin UX paths unchanged (API permission detail lives in 06/08) |
| [23_Maintenance_Guide.md](23_Maintenance_Guide.md) | Ops guidance unchanged |
| [25_Architecture_Diagrams.md](25_Architecture_Diagrams.md) | High-level diagrams still valid |
| [README.md](README.md) | Index still valid |
| login-*-testing.md | Pre-existing QA notes preserved |

---

## Code Changes Detected

### Added

- `GET /api/loyalty/summary` + `loyaltyController.ts` + `routes/loyalty.ts`
- `GET /api/stores/address/geocode`
- `POST /api/orders/:id/confirm-payhere-popup`
- `GET /api/payments/payhere/:orderNumber/session`
- `GET|POST /api/payments/payhere-return/:orderNumber`
- Frontend pages: `account/addresses`, `account/loyalty`, `account/notifications`
- Order fields: `cashReceivedAmount`, `changeGivenAmount`
- Expanded Vitest suites under `backend/tests/controllers/orderController.*`, `analyticsController.*`, etc.
- Frontend env: `BACKEND_URL`, `API_PROXY_URL`
- Config: `JWT_EXPIRES_IN`, `JWT_USER_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_USER_REFRESH_EXPIRES_IN`

### Modified

- `INITIAL_ORDER_STATUS` / Prisma `orders.status` default → `RECEIVED`
- Customer access JWT signing omits `expiresIn` (non-expiring)
- Customer refresh default → `3650d`
- Admin `/drivers` permissions → `DELIVERY` read/create
- `/admin/reports/branch-analytics` permission → `SALES` read
- CI frontend build: `NEXT_PUBLIC_API_URL=/api`; backend host `bing-chung-b.mp.dartcodes.com`

### Removed

- None detected (no deleted public API routes, models, or documented pages)

---

## Documentation Changes

### Updated sections

- Feature completeness (account + loyalty)
- Database `orders` fields/defaults
- Full API catalog additions and permission corrections
- Auth JWT lifetime matrix
- Env + CapRover/CI proxy topology
- Testing coverage inventory
- Known issues / changelog / project report

### New diagrams

- None required (existing Mermaid diagrams remain structurally correct; JWT note updated in architecture prose)

### New tables

- Loyalty API table in `06`
- Expanded JWT settings table in `08`
- Frontend env rows for proxy URLs in `11`

---

## Missing Documentation

Features still lightly or not fully documented at endpoint-detail depth:

- Exact Zod request/response bodies for every new PayHere session/return field
- Per-field UI behaviour of account notification preference toggles vs backend `notifyEmail` / `notifySms` / `notifyPush`
- Deep walkthrough of cash tender / change calculation UI in admin collect-payment
- Flutter customer/driver diffs since last full inventory (not re-audited end-to-end in this sync)

Still **Not Implemented** (correctly documented as gaps): production SMS/email adapters, password-reset API, frontend unit tests, CI test stage, NGINX/PM2 in repo, several customer-mobile stubs. Admin MFA was removed (not an open gap).

---

## Recommendations

1. When adding endpoints, update `06_API_Documentation.md` in the same PR.
2. Wire or remove unused `JWT_USER_EXPIRES_IN` so config matches signing behaviour (or document as intentional forever).
3. Expand API doc examples for PayHere session/return with real response samples from controllers.
4. Add a short Flutter delta pass next sync (customer_mobile `api_config` / stubs).
5. Keep `Documentation_Update_Report.md` appended or replaced on each docs sync.

---

*Generated by documentation maintenance sync — only affected docs were edited.*
