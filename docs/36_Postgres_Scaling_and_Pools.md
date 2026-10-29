# 36 — Postgres at 100k+ orders/day, CapRover pools, and the two production errors

## 1. Load profile

100k orders/day is ~1.2 orders/s average, but lunch/dinner peaks are 10–20x that (15–30 orders/s).
Each order triggers ~15–40 queries (create, items, stock, wallet, status events, notifications), plus
admin dashboards polling. Plan for **~1,000 queries/s at peak**. Postgres handles that easily if
(a) connections are pooled, (b) hot queries hit indexes, (c) the `orders` table is kept lean.

## 2. Connection budget (the part that bites first)

Every Node process owns a Prisma pool (`connection_limit`). Postgres `max_connections` must exceed
the sum of all pools **plus** rolling-deploy overlap (old + new container both alive).

**Always put PgBouncer (transaction mode) between the apps and Postgres.** Then:

- App → PgBouncer: many cheap client connections (set the Prisma pool freely).
- PgBouncer → Postgres: capped by `default_pool_size` (e.g. 40–60 real connections total).

`packages/db` now defaults to 12 (core/shop/delivery) or 8 (admin/pos) connections per process when
`DATABASE_URL` points at PgBouncer (`pgbouncer=true` or hostname contains `pgbouncer`), and 3–4 when
it connects straight to Postgres. Override per app with `PRISMA_CONNECTION_LIMIT`.

### Recommended per-app settings (CapRover → App → App Configs → Environment Variables)

| CapRover app | Instances | `PRISMA_CONNECTION_LIMIT` | Notes |
|---|---|---|---|
| bing-chun-shop (`API_SURFACE=shop`) | 2–4 | 12 | Customer traffic, biggest |
| bing-chun-pos (`pos`) | 2 | 8 | Cashier writes |
| bing-chun-admin (`admin`) | 1–2 | 8 | Heavy reports; keep `RUN_BACKGROUND_JOBS=false` |
| bing-chun-core (`core`) | 1 | 8 | Only instance with `RUN_BACKGROUND_JOBS=true` and schema patches |
| bing-chun-delivery | 2 | 10 | Separate DB schema, same server |
| bing-chun-migrate | 1 (job) | 1 | One-shot |
| Web apps (Next.js) | any | – | They never touch Postgres |

Shared variables for every API app:

```
DATABASE_URL=postgresql://USER:PASS@srv-captain--pgbouncer:6432/bingchun?pgbouncer=true
PRISMA_CONNECTION_LIMIT=12      # per table above
PRISMA_POOL_TIMEOUT=15          # seconds to wait for a free connection (clamped 5–30)
PRISMA_CONNECT_TIMEOUT=8        # seconds (clamped 3–15)
```

Migrations (`prisma migrate deploy`) must use a **direct** Postgres URL (not PgBouncer):
set `DIRECT_URL`/a separate env on `bing-chun-migrate` pointing at `srv-captain--postgres:5432`.

Budget check: `sum(instances × PRISMA_CONNECTION_LIMIT)` is client connections (fine for PgBouncer,
set `max_client_conn = 1000`). `default_pool_size` × databases must stay below Postgres
`max_connections - 20`.

### PgBouncer (`pgbouncer.ini`)

```
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
reserve_pool_size = 10
reserve_pool_timeout = 3
server_idle_timeout = 600
server_lifetime = 3600
server_reset_query_always = 0
tcp_keepalive = 1
tcp_keepidle = 30
tcp_keepintvl = 10
ignore_startup_parameters = extra_float_digits,search_path
```

## 3. Postgres tuning (example: 8 vCPU / 32 GB RAM dedicated VM, NVMe)

```
max_connections = 150
shared_buffers = 8GB                 # 25% RAM
effective_cache_size = 22GB          # 70% RAM
work_mem = 16MB                      # per sort/hash node; keep modest with many connections
maintenance_work_mem = 1GB
wal_compression = on
wal_buffers = 64MB
max_wal_size = 8GB
min_wal_size = 2GB
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
random_page_cost = 1.1               # SSD/NVMe
effective_io_concurrency = 200
default_statistics_target = 200
idle_in_transaction_session_timeout = 30s
statement_timeout = 60s              # per role for the API user; leave off for the migrate user
lock_timeout = 10s
tcp_keepalives_idle = 30
tcp_keepalives_interval = 10
tcp_keepalives_count = 5
# autovacuum — orders/order_items/status events churn constantly
autovacuum_max_workers = 4
autovacuum_naptime = 15s
autovacuum_vacuum_scale_factor = 0.02
autovacuum_analyze_scale_factor = 0.01
autovacuum_vacuum_cost_limit = 2000
shared_preload_libraries = 'pg_stat_statements'
log_min_duration_statement = 500
```

Then `CREATE EXTENSION pg_stat_statements;` and review the top queries weekly.

### Data-shape rules that matter at this scale

1. **Never fetch `orders."qrCode"` in lists.** It is a multi-KB base64 PNG stored out-of-line (TOAST).
   `getAllOrders` now excludes it (`backend/src/lib/orderListSelect.ts`). Do the same in any new list query.
   Longer term, stop persisting it: it is derivable from `trackToken` — generate on read.
2. **Indexes** — all hot paths are covered; migration `20261028130000_order_scale_indexes` adds
   `orders(createdAt)` and `orders(guestPhone, createdAt)`. For a large live table, create them first with
   `CREATE INDEX CONCURRENTLY` (see the migration comment).
3. **Partition or archive.** At 100k/day you add ~36M orders/year. Either:
   - range-partition `orders`, `order_items`, `order_status_events` by month, or
   - move orders older than 12–18 months to an `orders_archive` table nightly.
   Reports should always carry a date range (they mostly do).
4. **Pagination**: prefer keyset (`createdAt < cursor`) over deep `OFFSET`; `skip` beyond a few thousand rows scans and discards.
5. **Read replica** for admin reports/dashboards: add a streaming replica and point `bing-chun-admin`
   at it via a second `DATABASE_URL` once reports exceed ~20% of primary CPU.
6. **Backups**: `pgBackRest` or WAL-G with PITR, plus a nightly logical `pg_dump`. Test restores monthly.
   (This is what saves you from section 5.)
7. Keep the in-process caches (`withAnalyticsCache`, menu cache) — Redis-back them if you run >2 replicas
   and need consistent invalidation.

## 4. Error: `Error in PostgreSQL connection: Io, NotConnected, code 107 "Socket not connected"`

Cause: a pooled socket was closed by someone else (PgBouncer `server_idle_timeout`/`server_lifetime`,
a cloud firewall idle timeout, Postgres restart or `idle_in_transaction_session_timeout`). Prisma only
notices when it next uses the connection.

Fixes shipped in code:

- `packages/db` retries **read** queries (`findMany/findFirst/findUnique/count/aggregate/groupBy`) once
  on a fresh connection when the socket was dropped. Writes and transactions are never retried.
- The HTTP error handler already maps remaining cases to a clean `503 DB_UNAVAILABLE`.

Fixes to apply on the infrastructure:

1. Use PgBouncer with `pgbouncer=true` in `DATABASE_URL` (disables prepared statements).
2. Set TCP keepalives on Postgres (section 3) and PgBouncer so idle links are never silently dropped.
3. Make `server_idle_timeout` **longer** than any firewall idle timeout, and do not set Prisma pools
   larger than PgBouncer can serve.
4. Never restart Postgres/PgBouncer without draining; rolling restarts produce a short burst of these.

The log line is a warning, not data loss. If it appears constantly (more than a few per hour), the
keepalive/idle settings above are wrong.

## 5. Error: `XX001 unexpected chunk size 1917 (expected 1930) in chunk 0 of 1 for toast value 53718 in pg_toast_19225`

This is **on-disk corruption** of one large value in one row — not an application bug, and it can
reappear until the damaged row is repaired. The app only exposed it because list queries read the
`qrCode` TOAST column of every order. The list endpoint no longer reads that column, so the admin
orders page keeps working; the corrupt row still has to be repaired.

### Step 1 — stop making it worse

- Take a **full backup/snapshot now** (volume snapshot, then `pg_dump` of everything except the bad table if the dump fails).
- Check hardware/storage: `dmesg | grep -i -E "i/o error|ext4|xfs"`, SMART status, and that the data volume is not full, and that Postgres was never `kill -9`'d or its disk network-mounted with caching.
- Confirm `fsync = on`, `full_page_writes = on`, `synchronous_commit` default.

### Step 2 — identify which table/column

```sql
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.reltoastrelid = 'pg_toast.pg_toast_19225'::regclass;   -- owning table (expected: public.orders)
```

### Step 3 — find the corrupt row(s) (run in a maintenance window, read-only)

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    BEGIN
      PERFORM length("qrCode"), length("notes"), length("paymentFailureReason")
      FROM public.orders WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'CORRUPT order id=% : %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
```

Narrow by column if needed (check `qrCode` alone first).

### Step 4 — repair

`qrCode` is regenerable, so null it on the damaged rows (other columns may need manual recovery from backup):

```sql
UPDATE public.orders SET "qrCode" = NULL WHERE id IN ('<corrupt-id-1>', '<corrupt-id-2>');
```

If the `UPDATE` itself errors, delete the row's toast reference by restoring that row from backup, or
temporarily: `SET zero_damaged_pages = on;` is **not** appropriate here (page-level). Prefer:

1. Restore that order from the latest backup into a scratch DB and copy the row back; or
2. Dump good rows and rebuild: `CREATE TABLE orders_new AS TABLE orders WITH NO DATA;` and
   copy in ID ranges, skipping the bad id, then swap names inside a transaction (re-create FKs/indexes).

Afterwards:

```sql
REINDEX TABLE CONCURRENTLY public.orders;
VACUUM (ANALYZE, VERBOSE) public.orders;
```

### Step 5 — verify and prevent

- Run `pg_amcheck --heapallindexed --parent-check -d bingchun` (PG14+) during low traffic; it reports any other corruption.
- Enable data checksums on the next planned rebuild (`pg_checksums --enable`, or `initdb --data-checksums` for the new cluster).
- Alert on `XX001`, `XX002`, `58030` in logs.
- Keep PITR so any future corruption is a restore, not an outage.

### Regenerating a nulled QR code

The customer QR is `QRCode.toDataURL(<frontendUrl>/track/<trackToken>)`. If you null a row's `qrCode`, a
one-off script (or on-read generation in `getMyOrders`) can recreate it from `trackToken`.

## 6. Security hardening summary (this change set)

Already in place and verified: helmet + CSP, CORS allowlist with credentials, Redis-backed per-route rate
limits, production boot refuses default/weak JWT, refresh, internal, OTP, and PIN secrets, httpOnly +
Secure + SameSite cookies, signed PayHere notifications with currency and amount checks plus optional IP
allowlist, Zod validation, Prisma parameterised queries (raw `*Unsafe` calls only use constants or `$n` params),
socket auth enforced in production, load-test bypass requires a 32+ char key with constant-time compare.

Changed:

- Telegram webhook secret now uses a constant-time comparison.
- `express.urlencoded` is flat (`extended:false`) with a 256 KB cap (removes nested-object parsing surface).
- Web app adds `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS `includeSubDomains`.
- Order lists no longer read TOAST columns; reads retry once on dropped sockets.

Operator checklist (cannot be enforced in code):

- Set strong unique values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_SECRET`, `DELIVERY_OTP_PEPPER`, `DRIVER_PIN_PEPPER`, `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET`.
- Leave `LOAD_TEST_BYPASS_KEY` unset in production.
- Postgres/PgBouncer/Redis must be reachable only on the CapRover private network (no published ports); use a dedicated least-privilege DB role for the API (no superuser/DDL except the migrate app).
- Rotate any secret ever pasted in logs or chat.
- Run `npm audit --omit=dev` in `backend`, `Frontend`, and `delivery-service` monthly.
