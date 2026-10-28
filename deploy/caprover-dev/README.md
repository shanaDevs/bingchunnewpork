# CapRover env packs (local only)

Copy-paste these into CapRover **App Configs → Environmental Variables** for each app.

Files here are gitignored (`*.env`). Regenerate them from the filled appendix in
[`docs/30_Microservices_Deployment.md`](../../docs/30_Microservices_Deployment.md#envs)
if needed.

| File | CapRover app |
|---|---|
| `bc-pgbouncer.env` | `bc-pgbouncer` (optional if apps talk to Postgres directly) |
| `bing-chun-core.env` | `bing-chun-core` |
| `bing-chun.env` | `bing-chun` (shop frontend) |
| `bing-chun-shop.env` | `bing-chun-shop` (shop API) |
| `bing-chun-admin.env` | `bing-chun-admin` (admin API) |
| `bing-chun-admin-web.env` | `bing-chun-admin-web` |
| `bing-chun-pos.env` | `bing-chun-pos` (POS API) |
| `bing-chun-pos-web.env` | `bing-chun-pos-web` |
| `bing-chun-delivery.env` | `bing-chun-delivery` |
| `bing-chun-orders.env` | `bing-chun-orders` |
| `bing-chun-payments.env` | `bing-chun-payments` |
| `bing-chun-notify.env` | `bing-chun-notify` |
| `bing-chun-admin.env` | `bing-chun-admin` (set `ADMIN_WEB_URL`, `POS_WEB_URL` — see [35_Shop_Pos_Admin_Architecture.md](../../docs/35_Shop_Pos_Admin_Architecture.md)) |
| `bing-chun-pos.env` | `bing-chun-pos` (same CORS vars as admin API) |

**HTTP Settings (frontends):** Container HTTP Port must be **`80`**. The Next.js
image listens on 80 (CapRover default). APIs stay on **`4000`**.

**Shared DB URL:** `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public`
