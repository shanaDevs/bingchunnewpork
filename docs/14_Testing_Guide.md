# 14 — Testing Guide

## 1. Overview

| Layer | Tool | Status |
|-------|------|--------|
| Backend unit | Vitest | Implemented |
| API integration (live DB suite) | — | Not Implemented as dedicated suite |
| Frontend unit | — | Not Implemented |
| E2E | Playwright | Implemented (login + order) |
| Flutter | `flutter_test` default stubs | Stub only |
| Load testing | — | Not Implemented |
| Performance testing suite | — | Not Implemented |
| Security testing suite | — | Not Implemented |
| CI test jobs | — | Not Implemented |

---

## 2. Unit tests (backend)

**Config:** `backend/vitest.config.ts`  
**Location:** `backend/tests/`

Coverage focus areas (examples):

- `tests/controllers/authController.*.test.ts` — register, login, phone, OTP, profile, tokens, delivery login
- `tests/controllers/orderController.*.test.ts` — place, get, list, status, items, payment, ratings, takeaway queue/admin
- `tests/controllers/analyticsController.*.test.ts` — dashboard, brand/branch analytics, customer insights, order ops, settlements/wallet, reports
- `tests/controllers/adminNotificationController.branch.test.ts`
- `tests/middleware/auth.test.ts`
- `tests/lib/` — pricing, orderStatus, orderPayment, takeawayQueue, userAccount, driverPin
- `tests/integrations/paymentAdapter.test.ts`
- `tests/utils/` — phone, geo, orderNumber, apiResponse

### Commands

```bash
npm run test:unit
npm run test:unit:ui
npm run test:unit:cov
# or
npm run test -w @bingchun/backend
```

---

## 3. Integration / API tests

**Dedicated live API integration suite:** Not Implemented.

Controllers are unit-tested with helpers (`tests/helpers/express.ts`) rather than a full DB-backed contract suite.

Manual API checks: use HTTP client against running backend after seed.

---

## 4. E2E tests (Playwright)

**Config:** root `playwright.config.ts`  
**Specs:** `e2e/login.spec.ts`, `e2e/order.spec.ts`  
**Page objects:** `e2e/pages/`

### Commands

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
```

**Prerequisite:** Frontend at `http://localhost:3000` (and backend as needed for order flow).

Related notes: `docs/login-e2e-testing.md`, `docs/login-e2e-qa-guidance.md`.

---

## 5. Frontend unit tests

**Not Implemented** — no `*.test.*` under `frontend/`, no `test` script in frontend `package.json`.

Lint only: `npm run lint`.

---

## 6. Flutter tests

Both apps ship default `widget_test.dart` stubs.  
**Meaningful widget/integration coverage:** Not Implemented.

---

## 7. Load testing

**Not Implemented** in repository (no k6/JMeter/Artillery configs).

Suggested (out of repo): stress `POST /api/orders`, `GET /api/admin/dashboard`, Socket.io connections — not provided as project assets.

---

## 8. Performance testing

**Not Implemented** as automated suite. See qualitative notes in [16_Performance_Analysis.md](16_Performance_Analysis.md).

---

## 9. Security testing

**Not Implemented** as automated suite. Manual checklist items in [15_Security_Documentation.md](15_Security_Documentation.md).

---

## 10. Recommended minimum before release

1. `npm run test:unit`
2. `npm run test:e2e` against staging
3. Manual smoke: customer order (PayHere sandbox), admin status update, driver job complete, wallet withdrawal approve
4. Confirm CORS + env on staging hostnames

---

## Related

- [17_Code_Quality_Report.md](17_Code_Quality_Report.md)
- [18_Known_Issues.md](18_Known_Issues.md)
