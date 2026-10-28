# 10 — Backend Documentation

**Package:** `@bingchun/backend`  
**Entry:** `backend/src/index.ts`  
**API mount:** `app.use('/api', routes)` + `GET /health`

---

## 1. Architecture pattern

```
routes → middleware → controllers → lib/* + prisma
                              ↘ integrations/*
```

**Repositories / DTOs folders:** Not Implemented as separate layers.  
Validation: Zod schemas colocated in controllers.  
Domain logic concentrated in `src/lib/`.

**Services folder:** Only `services/socialAuthService.ts`.

---

## 2. Controllers

| Controller | Responsibility |
|------------|----------------|
| `authController` | Register/login, phone, OTP, refresh, me CRUD, admin login/refresh, delivery PIN |
| `socialAuthController` | Google/Facebook wrappers |
| `menuController` | Categories, products, toppings, image upload |
| `storeController` | Stores, zones, geocode, validate delivery |
| `cartController` | Cart CRUD |
| `orderController` | Place/track/status/items/payment/ratings/queue |
| `addressController` | Customer addresses |
| `promoController` | Validate + admin promo CRUD |
| `settingsController` | Payment/app/zone settings |
| `paymentController` | PayHere HTML checkout |
| `customerNotificationController` | Customer notifications |
| `fcmTokenController` | FCM token register/unregister |
| `loyaltyController` | Customer loyalty summary (points, settings, recent txns) |
| `deliveryController` | Optimized route helper |
| `deliveryJobController` | Driver job lifecycle + admin create job |
| `adminDeliveryController` | Pending orders, classify, preview, jobs, drivers |
| `adminNotificationController` | Admin notifications (`sendTestCustomerPush` exported but **no route** — unused wiring) |
| `adminUserController` | Users, permissions, stores, managers, cashiers |
| `roleController` | Role CRUD |
| `storeInventoryController` | Branch stock |
| `storeDeliveryAccessController` | Delivery enablement + logs |
| `walletController` | Wallets, withdrawals, settle, adjust, reports |
| `paymentHistoryController` | Payment history & commission settlements |
| `analyticsController` | Dashboard + reports |

---

## 3. Lib modules (domain)

| Module | Role |
|--------|------|
| `prisma.ts` | Prisma client singleton |
| `pricing.ts` | Unit price calculation |
| `orderStatus.ts` | Status machine |
| `orderPayment.ts` | Payment marking rules |
| `orderPlacement.ts` | Place-order orchestration helpers |
| `orderSchedule.ts` | Order scheduling helpers |
| `payherePayment.ts` / `payhereUrls.ts` | PayHere session / URL helpers |
| `deliveryFee.ts` | Delivery fee calculation |
| `takeawayQueue.ts` | Queue + reminders |
| `deliveryZones.ts` / `deliveryStoreResolver.ts` / `storeMatching.ts` | Branch/zone logic |
| `orderClustering.ts` / `routeOptimizer.ts` / `roadRouting.ts` / `routeCache.ts` | Delivery routing |
| `adminDeliveryHelpers.ts` / `deliveryJobHelpers.ts` / `deliveryRouteResponse.ts` | Admin/driver delivery helpers |
| `walletService.ts` / `withdrawalService.ts` / `walletSync.ts` / `walletRevenue.ts` | Finance |
| `commission.ts` | Commission math |
| `periodChannelPreview.ts` / `settlementPaymentMethod.ts` / `settlementWithdrawalQuery.ts` | Settlement helpers |
| `customerNotifications.ts` / `branchNotifications.ts` / `fcm.ts` | Notify |
| `spaces.ts` / `productImages.ts` / `categoryIcons.ts` / `productSort.ts` | Catalog / uploads |
| `withdrawalInvoice.ts` | PDF invoices |
| `paymentSettings.ts` / `appSchema.ts` / `schemaPatch.ts` / `*Schema.ts` | Settings + runtime DDL patches |
| `storeInventory.ts` | Branch stock helpers |
| `socket.ts` | Socket.io init + rooms |
| `driverPin.ts` / `userAccount.ts` | Auth helpers |
| `deliveryAccessMilestones.ts` | Milestone gating |
| `resolveFrontendUrl.ts` | URL helpers |

---

## 4. Entities

Prisma models in `schema.prisma` (see [05_Database_Documentation.md](05_Database_Documentation.md)).  
No separate Entity classes — Prisma types are used.

---

## 5. DTOs

**Not Implemented** as dedicated DTO classes/files. Request shapes are Zod schemas inside controllers; responses built inline.

---

## 6. Middleware

| File | Contents |
|------|----------|
| `middleware/auth.ts` | JWT auth + role guards + `blockCashier` |
| `middleware/permission.ts` | Menu CRUD permissions |
| `middleware/rateLimiter.ts` | General / auth / OTP limiters |
| `middleware/upload.ts` | Multer for products & settlement receipts |
| `middleware/errorHandler.ts` | Zod 422, AppError, 500, notFound |

Global stack in `index.ts`: Helmet (CSP allowing PayHere), CORS, JSON, urlencoded, cookie-parser, general rate limit.

---

## 7. Integrations (`src/integrations/`)

| Integration | Status |
|-------------|--------|
| PayHere adapter | Implemented + mock fallback |
| Google Maps | Key → live; else mock |
| SMS | mock default; Dialog stub throws |
| Email | mock default; SendGrid stub throws |

---

## 8. Utilities (`src/utils/`)

Typical helpers: `apiResponse` (`success` / `paginated` / `error`), phone normalization, geo distance, order number generation, logger.

---

## 9. Configuration

`src/config/index.ts` — see [11_Environment_Configuration.md](11_Environment_Configuration.md).

---

## 10. Static assets

Mounted paths include `/mascots`, `/products`, `/settlements`, `/invoices` under `public/`.

---

## 11. Scripts

| Script | Purpose |
|--------|---------|
| `prisma:generate/push/migrate/seed/studio` | Schema & seed |
| `feed` / `seed:dummy` | Dummy data |
| `backfill:wallets` | Wallet backfill |
| `test` / `test:cov` | Vitest |

---

## Related

- [04_Project_Structure.md](04_Project_Structure.md)
- [06_API_Documentation.md](06_API_Documentation.md)
