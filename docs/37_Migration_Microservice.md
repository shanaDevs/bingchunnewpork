# 37 — Migration microservice (`bing-chun-migrate`)

One-shot CapRover app that runs **`prisma migrate deploy`** and exits. It is the **only** process that
should change the database schema in production. Every other API (`core` / `shop` / `pos` / `admin` /
`delivery`) connects through PgBouncer and never runs migrations.

Code already in the repo:

| File | Role |
|---|---|
| [`backend/Dockerfile.migrate`](../backend/Dockerfile.migrate) | Minimal image (Prisma CLI + `packages/db` schema) |
| [`backend/migrate-entrypoint.sh`](../backend/migrate-entrypoint.sh) | Wait for Postgres → `migrate deploy` → exit 0 |
| [`packages/db/prisma/migrations/`](../packages/db/prisma/migrations) | Migration SQL history |
| [`.github/workflows/ci-cd-new-server.yml`](../.github/workflows/ci-cd-new-server.yml) | Builds image, deploys migrate **first**, then all other apps |

Related: [36 — Postgres scaling & pools](./36_Postgres_Scaling_and_Pools.md).

---

## Why a separate migrate app?

1. **PgBouncer cannot run migrations.** Transaction pooling breaks advisory locks and some DDL.
   API apps use `…@pgbouncer:6432?pgbouncer=true`. Migrate must use a **direct** URL on port `5432`.
2. **Rolling deploys.** If every replica ran `migrate deploy` at boot, they race and lock each other.
3. **Core outages don't block schema.** Migrations run even if `bing-chun-core` is down.
4. **Idempotent.** Re-running `prisma migrate deploy` is safe when nothing is pending.

After migrate is the source of truth, set on every long-running API app:

```
RUNTIME_SCHEMA_PATCHES=false
```

(Keep `true` only until the first successful migrate deploy on a brand-new database.)

---

## CapRover: create the app (UI)

### 1. Create the app

1. Open CapRover → **Apps** → **One-Click Apps / Templates** is **not** used here.
2. **Apps** → **Create New App**.
3. App name: **`bing-chun-migrate`** (exact name — CI deploys to this).
4. Leave **Has Persistent Data** unchecked.
5. Create.

### 2. HTTP settings

1. Open **`bing-chun-migrate`** → **HTTP Settings**.
2. **Do not enable HTTPS** for public traffic — this app has no HTTP API.
3. Optionally leave **Force HTTPS** off.
4. You can leave the default domain; nothing should call it from the internet.
5. **Instance Count**: `1` when CI deploys; CapRover will start the container, it exits after migrate.
   Re-deploys are fine (`migrate deploy` is idempotent). Between deploys you may set instance
   count to `0` if the restart loop bothers you — CI will bring it back to 1 on the next push.

### 3. App configs — environment variables

**App Configs → Environmental Variables** — paste (edit host / password / db name to match your server):

```env
# REQUIRED: direct Postgres (NOT PgBouncer). Prefer DIRECT_URL; entrypoint copies it to DATABASE_URL.
DIRECT_URL=postgresql://postgres:YOUR_PASSWORD@srv-captain--bing-chun-production-db:5432/bingchun?schema=public

# Fallback if DIRECT_URL is unset (must still be direct Postgres, port 5432)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@srv-captain--bing-chun-production-db:5432/bingchun?schema=public

TZ=Asia/Colombo
PRISMA_CONNECTION_LIMIT=1
```

Hostname rules:

| CapRover Postgres app name | Internal DNS |
|---|---|
| `bing-chun-production-db` | `srv-captain--bing-chun-production-db` |
| `postgressql` (typo name some installs use) | `srv-captain--postgressql` |

Check with: CapRover → Postgres app → **App Configs** → note the service name, then
`srv-captain--<exact-app-name>`.

**Do not** point migrate at:

```
…@srv-captain--bc-pgbouncer:6432/…?pgbouncer=true
```

The entrypoint refuses URLs that look like PgBouncer and exits with an error.

### 4. Deployment method: pre-built image (GHCR)

Same pattern as the other Bing Chun apps (not “Method 1: Dockerfile on git push” from the CapRover
wizard for day-to-day deploys — CI pushes the image).

1. CapRover → **Cluster** → **Docker Registry**  
   Ensure a registry is configured that can **pull** from `ghcr.io` (GitHub PAT with `read:packages`).
2. You do **not** need to paste an image manually for every release — GitHub Actions does it.
3. First-time / manual test (SSH or any machine with Docker + CapRover CLI access):

```bash
# Build from repo root
docker build -f backend/Dockerfile.migrate -t ghcr.io/<org>/bingchun/bing-chun-migrate:manual .

# Optional: push, then in CapRover → bing-chun-migrate → Deployment
# → "Deploy via ImageName" (if your CapRover version exposes it)
# or use the same captain-definition tar the CI script uses.
```

### 5. GitHub: environment + token (required for CI)

1. GitHub repo → **Settings** → **Environments** → create **`bing-chun-migrate`**.
2. CapRover → `bing-chun-migrate` → **App Configs** → **App Token** → enable / copy token.
3. In the GitHub environment `bing-chun-migrate`, add secret:
   - Name: `CAPROVER_TOKEN`
   - Value: that app token
4. Repo / environment must also have whatever your workflow already uses for
   `CAPROVER_URL` (e.g. `https://captain.bc.dartcodes.com`).

Repo secret / var used by the workflow (already shared with other apps):

| Name | Example |
|---|---|
| `CAPROVER_URL` | `https://captain.bc.dartcodes.com` |
| GHCR login | `GITHUB_TOKEN` / `packages: write` on the workflow |

### 6. Confirm CI order

On every push to **`production`**, [ci-cd-new-server.yml](../.github/workflows/ci-cd-new-server.yml):

1. Builds `bing-chun-migrate` → `ghcr.io/<owner>/bingchun/bing-chun-migrate:<sha>`
2. Job **`deploy-migrate`** deploys that image to CapRover
3. Waits ~30s for the container to finish
4. Only then deploys `core` / `shop` / `admin` / `pos` / `delivery` / web apps  
   (each job has `needs: … deploy-migrate`)

If migrate fails, **no** API image is rolled out — by design.

---

## Local / one-off run (without CapRover)

From the monorepo root, against a **direct** Postgres URL:

```bash
export DIRECT_URL="postgresql://postgres:PASSWORD@HOST:5432/bingchun?schema=public"
export DATABASE_URL="$DIRECT_URL"

npm run prisma:generate -w @bingchun/db
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

Or the container:

```bash
docker build -f backend/Dockerfile.migrate -t bingchun-migrate .
docker run --rm \
  -e DIRECT_URL="postgresql://postgres:PASSWORD@HOST:5432/bingchun?schema=public" \
  bingchun-migrate
```

---

## Developer workflow (new schema changes)

1. Edit [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).
2. Create a migration (dev machine, direct DB or shadow DB):

   ```bash
   npx prisma migrate dev --schema=packages/db/prisma/schema.prisma --name describe_change
   ```

3. Commit the new folder under `packages/db/prisma/migrations/`.
4. Merge to **`production`**.
5. CI runs `bing-chun-migrate` first → applies SQL → then restarts APIs that need the new columns.

**Large indexes on a live busy table:** prefer writing the migration SQL with
`CREATE INDEX CONCURRENTLY` and running that manually in a maintenance window, then marking the
migration applied (`prisma migrate resolve`). See comments in
`20261028130000_order_scale_indexes`.

---

## How it relates to pool sizing

| App | DB URL | Pool |
|---|---|---|
| `bing-chun-migrate` | **Direct** Postgres `:5432` via `DIRECT_URL` | `PRISMA_CONNECTION_LIMIT=1` |
| `bing-chun-shop` / `pos` / `admin` / `core` / `delivery` | **PgBouncer** `:6432?pgbouncer=true` | 8–12 (see [doc 36](./36_Postgres_Scaling_and_Pools.md)) |

Migrate holds at most one connection for a few seconds. It does not need PgBouncer.

---

## CapRover checklist (copy/paste)

- [ ] App created: `bing-chun-migrate`
- [ ] No public HTTPS requirement / no health consumers
- [ ] `DIRECT_URL` = `postgresql://…@srv-captain--<postgres-app>:5432/<db>?schema=public`
- [ ] `DATABASE_URL` same as above (or omitted if `DIRECT_URL` is set)
- [ ] `PRISMA_CONNECTION_LIMIT=1`
- [ ] GitHub Environment `bing-chun-migrate` + secret `CAPROVER_TOKEN`
- [ ] GHCR pull credentials configured on CapRover cluster
- [ ] Other API apps: `DATABASE_URL` → PgBouncer; `RUNTIME_SCHEMA_PATCHES=false`
- [ ] Push a no-op or real migration to `production` and confirm Actions: migrate job green, then apps deploy
- [ ] CapRover logs for `bing-chun-migrate` show: `Migrations applied successfully. Container will now exit.`

---

## Reading logs

CapRover → **bing-chun-migrate** → **Deployment** / **App Logs**:

```
[migrate] Using DIRECT_URL (direct Postgres, not PgBouncer)
[migrate] Waiting for database at srv-captain--…:5432...
[migrate] Database is ready. Running Prisma migrations...
[migrate] ✅ Migrations applied successfully. Container will now exit.
```

Common failures:

| Log / error | Fix |
|---|---|
| `DATABASE_URL is not set` | Add `DIRECT_URL` or `DATABASE_URL` in App Configs |
| `DATABASE_URL points at PgBouncer` | Switch to direct Postgres host/port |
| `Database did not become ready` | Wrong hostname (`srv-captain--…`), Postgres app down, or firewall |
| `P1001` / connection refused | Same as above; confirm CapRover internal DNS |
| `P3009` failed migrations | Inspect `_prisma_migrations`; fix SQL or `migrate resolve` |
| `P3005` database schema not empty | Baseline: `prisma migrate resolve --applied <name>` on an existing DB |

---

## After cutover: turn off boot-time DDL on APIs

Once migrate has applied successfully on production at least once:

```env
# bing-chun-core, shop, pos, admin — App Configs
RUNTIME_SCHEMA_PATCHES=false
```

That stops the `ensure*Schema()` `ALTER TABLE` storm that races CapRover rolling deploys and
contributes to lock waits / pool timeouts.

---

## Manual “run migrate now” without a git push

1. CapRover → `bing-chun-migrate` → **Deployment**.
2. Redeploy the **current** image (or trigger **workflow_dispatch** on `CI/CD (new server)`).
3. Watch logs until the success line appears.
4. Confirm:  
   `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10;`
