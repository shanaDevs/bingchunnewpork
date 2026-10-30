# Nugegoda app-logic seed on live DigitalOcean

Expect **30–60+ minutes** per full run (2 months × ~10L GMV).

## Seed from your laptop (live `bingchun-pg`)

**Do not** use [`backend/.env`](../../backend/.env) (`208.87.132.47` / CapRover) or `run-nugegoda-seed-caprover.cjs` — that is not DigitalOcean Postgres.

The `DATABASE_URL` in [`secrets.env`](secrets.env) (`bingchun_app`) **cannot** read `stores` from your PC. You need **doadmin** (same as App Platform):

1. DigitalOcean → **Databases** → **bingchun-pg** → **Connection details** → user **doadmin** → **Public network**.
2. Add **one** of (gitignored, never commit):
   - Uncommented `DOADMIN_DATABASE_URL=postgresql://doadmin:...@bingchun-pg-do-user-35274177-0.d.db.ondigitalocean.com:25060/defaultdb?sslmode=require` in `secrets.env`, or
   - One line in [`audit-doadmin.url`](audit-doadmin.url) (see [`audit-doadmin.url.example`](audit-doadmin.url.example)).

Pre-flight:

```powershell
node deploy/digitalocean/run-nugegoda-seed-local.cjs --dry-run
```

Expect: `DATABASE_URL user=doadmin host=bingchun-pg-do-user-...ondigitalocean.com` and store **Bing Chun - Nugegoda**.

Run seed:

```powershell
node deploy/digitalocean/run-nugegoda-seed-local.cjs 2>&1 | Tee-Object -FilePath backend/seed-nugegoda-do.log
```

Loads JWT/peppers from `secrets.env`, sets `ALLOW_NUGEGODA_APP_SEED` + `ALLOW_SEED_ON_LIVE`, `NODE_ENV=production`.

Verify:

```powershell
node deploy/digitalocean/audit-nugegoda-seed-readonly.cjs
```

---

## Seed from App Platform Console (alternative)

Run **once** inside **bingchun-shop → shop-api → Console** (single instance).

### Before you run

1. Deploy `main` with `seed-nugegoda-app-orders` + wallet ledger fix merged.
2. Confirm migrations are current (shop deploy runs `prisma migrate deploy`).
3. Nugegoda has products, stock, and a **STORE_MANAGER** admin (`branch@bingchunsrilanka.lk` if base seed ran).

### Pre-flight audit (shop-api Console)

```sh
cd /app/backend
export SEED_TARGET_STORE_NAME=Nugegoda
npm run audit:nugegoda-seed:prod
```

From your laptop, the repo script needs **doadmin** (`deploy/digitalocean/audit-doadmin.url` or `AUDIT_DATABASE_URL`); `secrets.env` app user gets `permission denied for table stores`.

## Console commands

```sh
cd /app/backend
export TZ=Asia/Colombo
export ALLOW_NUGEGODA_APP_SEED=true
export ALLOW_SEED_ON_LIVE=true
export SEED_TARGET_STORE_NAME=Nugegoda
# Optional: walk-in phone avoids SMS (default 0700000000)
# export SEED_CUSTOMER_PHONE=0700000000

npm run seed:nugegoda-app:prod
```

`DATABASE_URL` is already set on shop-api (doadmin, VPC).

### If the console disconnects

Check partial progress:

```sql
SELECT COUNT(*), MIN("createdAt"), MAX("createdAt")
FROM orders
WHERE "storeId" = (SELECT id FROM stores WHERE name LIKE '%Nugegoda%' LIMIT 1)
  AND notes LIKE 'seed-nuge-app-%';
```

Re-run with `--skip-clear` only if you want to keep partial seed rows and continue (script does not resume mid-month automatically).

## Safety

- Clears **only** seed-prefixed orders at Nugegoda (`seed-*` id/notes/paymentRef).
- Does **not** delete real customer orders.
- Never run `seed:main-branches --clear` on live.

## Verify

- Admin: Nugegoda analytics Sep/Oct ~10L delivered GMV; refunds RECEIVED/COMPLETE/REJECTED.
- Post-run audit in **shop-api Console**:

```sh
cd /app/backend
export SEED_TARGET_STORE_NAME=Nugegoda
npm run audit:nugegoda-seed:prod
```

- Or from repo root with doadmin URL:

```powershell
node deploy/digitalocean/audit-nugegoda-seed-readonly.cjs
```

## Rollback seed data only

Re-run the seed script **without** `--skip-clear` after setting the same env vars (clears seed prefixes first), or delete rows matching `notes LIKE 'seed-nuge-app-%'` at Nugegoda manually.
