# 16 — Performance Analysis

## 1. Potential bottlenecks

| Area | Risk | Evidence / notes |
|------|------|------------------|
| Admin analytics reports | Heavy aggregations over orders/items | Multiple `/api/admin/reports/*` endpoints |
| Delivery clustering + OSRM | External HTTP latency; public OSRM rate limits | `roadRouting.ts`, default public OSRM |
| Socket fan-out | Many concurrent rooms on single Node process | Socket.io in same process as API |
| Schema ensure on boot | Startup DDL / patches add boot time | Multiple `ensure*Schema` helpers |
| Customer Flutter polling | Fixed 4s/8s timers generate steady load | No sockets on customer mobile |
| Product image uploads | Sync upload path to Spaces | Multer memory + S3 put |
| Unbounded list queries | Mitigated for key admin reports | `/admin/reports/top-products`, wallet ledger, customer loyalty, and settlements default to current month + 92-day max span; sales report paginated |
| No Redis / shared cache | Every instance hits MySQL | Cache not implemented |

---

## 2. Database optimisation

### Existing indexes (examples)

- `customer_notifications`: `(userId, read)`, `(userId, createdAt)`
- `platform_ratings`: `createdAt`, `stars`
- `rider_ratings`: `driverId`
- `delivery_jobs`: `(storeId, status)`, `(driverId, status)`, `(status, completedAt)`
- `admin_notifications`: `(adminUserId, read)`, `(storeId, createdAt)`
- `wallet_transactions`: `(storeId, createdAt)`, `type`, unique `(orderId, type)`
- `store_withdrawals`: `(storeId, createdAt)`, `(storeId, status)`
- `commission_settlements`: `(storeId, periodFrom, periodTo)`
- `delivery_access_logs`: `(storeId, createdAt)`
- Unique keys on phones, emails, order numbers, promo codes, slugs

### Suggestions

- Add composite indexes for frequent admin filters (`storeId + createdAt` on `orders` if missing in live DB — verify with `EXPLAIN`)
- Paginate all list endpoints consistently
- Avoid N+1 by using Prisma `include`/`select` carefully in report controllers
- Archive old `order_status_events` / notifications if tables grow large

---

## 3. Caching

| Layer | Status |
|-------|--------|
| Redis / Memcached | Not Implemented |
| HTTP CDN for Next static | CapRover/CDN optional — not in repo |
| `routeCache` lib | In-process route caching helper exists — limited scope |
| React Query staleTime ~5m | Client-side cache Implemented |

---

## 4. Lazy loading

| Area | Status |
|------|--------|
| Next.js code splitting | Framework default for routes |
| Admin heavy charts | Loaded per page; most pages `'use client'` |
| Product images | URL-based; Spaces CDN if configured |

Server Components are underused (most pages client components) — opportunity, not current pattern.

---

## 5. Compression

| Area | Status |
|------|--------|
| Express compression middleware | Not verified as enabled in stack (not a first-class documented feature) |
| CapRover / proxy gzip | Typically at edge — outside repo |
| Next.js production assets | Built-in minification |

---

## 6. Scalability

**Current model:** Single Node API + Socket.io + MySQL.

Horizontal scale notes:

- Sticky sessions or Socket.io Redis adapter needed for multi-instance sockets — **Redis adapter Not Implemented**
- Stateless JWT helps multi-instance HTTP
- MySQL primary becomes bottleneck for writes (orders, wallet) — plan read replicas for reports if growth requires
- CapRover can scale containers, but shared DB and sockets constrain design

---

## 7. Frontend performance notes

- Large admin component tree (~100+ files)
- Leaflet maps and Recharts on dashboard/reports — load only on those routes
- Webpack heap increased in `dev` script (`--max-old-space-size=4096`) indicating heavy local builds

---

## Related

- [05_Database_Documentation.md](05_Database_Documentation.md)
- [17_Code_Quality_Report.md](17_Code_Quality_Report.md)
