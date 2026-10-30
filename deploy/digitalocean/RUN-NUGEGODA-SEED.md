# Nugegoda app-logic seed on live DigitalOcean

Run **once** inside **bingchun-shop → shop-api → Console** (single instance). Expect **30–60+ minutes**.

## Before you run

1. Deploy `main` with `seed-nugegoda-app-orders` + wallet ledger fix merged.
2. Confirm migrations are current (shop deploy runs `prisma migrate deploy`).
3. Nugegoda has products, stock, and a **STORE_MANAGER** admin (`branch@bingchunsrilanka.lk` if base seed ran).

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
- Read-only audit from repo root (doadmin URL):

```powershell
node deploy/digitalocean/audit-nugegoda-seed-readonly.cjs
```

## Rollback seed data only

Re-run the seed script **without** `--skip-clear` after setting the same env vars (clears seed prefixes first), or delete rows matching `notes LIKE 'seed-nuge-app-%'` at Nugegoda manually.
