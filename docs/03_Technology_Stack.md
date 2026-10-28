# 03 — Technology Stack

Versions taken from package manifests as of documentation date (2026-07-25).

---

## Frontend (web)

| Item | Value |
|------|--------|
| Framework | Next.js **16.2.6** (App Router, `output: 'standalone'`) |
| UI library | React **19.2.4** |
| Language | TypeScript 5 |
| Styling | Tailwind CSS **4**, shadcn / `@base-ui/react`, CSS variables in `globals.css` |
| Motion | framer-motion, GSAP |
| Maps | leaflet, react-leaflet |
| Charts | recharts |
| QR | html5-qrcode, qrcode.react |
| Toasts | react-hot-toast |
| Icons | lucide-react |
| Package | `@bingchun/frontend` |

---

## Backend

| Item | Value |
|------|--------|
| Runtime | Node.js **≥18** (Docker images use Node 20 Alpine) |
| Framework | Express **5.2.x** |
| Language | TypeScript |
| Realtime | Socket.io **4** |
| Validation | Zod |
| Security libs | helmet, cors, cookie-parser, express-rate-limit, bcryptjs, jsonwebtoken |
| Uploads | multer |
| PDF | pdfkit |
| Package | `@bingchun/backend` |

---

## Database

| Item | Value |
|------|--------|
| Engine | **MySQL 8** |
| Connection | `DATABASE_URL` |
| Local/Docker | `mysql:8.0` in `docker-compose.yml` |

---

## ORM

| Item | Value |
|------|--------|
| ORM | **Prisma 5.22** (`@prisma/client`, `prisma`) |
| Schema | `backend/prisma/schema.prisma` |
| Client generate | `prisma generate` |
| Schema sync | Primarily `prisma db push` + runtime ensure helpers |

---

## Frameworks (mobile)

| App | Framework | State | Routing |
|-----|-----------|-------|---------|
| `mobile/` (driver) | Flutter (Dart SDK ^3.12) | flutter_riverpod | go_router |
| `customer_mobile/` | Flutter (Dart SDK ^3.12) | flutter_riverpod | go_router |

---

## Libraries (notable)

### Backend integrations

- `@aws-sdk/client-s3` — DigitalOcean Spaces
- `firebase-admin` — FCM
- PayHere — custom adapter under `integrations/`

### Frontend state / data

- **TanStack React Query v5** — server state
- **Zustand v5** — client state (`auth`, `cart`, `theme`, `confirm`)
- **socket.io-client** — realtime

### Redux

**Not Implemented.** Zustand is used instead.

---

## Authentication

| Mechanism | Status |
|-----------|--------|
| JWT access + refresh | Implemented |
| Bearer header | Implemented |
| bcrypt password hashing | Implemented |
| Google / Facebook token verify | Implemented |
| OTP records | Implemented (SMS delivery mock/stub) |
| Driver PIN login | Implemented |
| Cookie sessions as primary auth | Not Implemented |
| Admin MFA challenge | Not Implemented (fields only) |
| OAuth redirect server flow | Not Implemented (token verify only) |

---

## Cloud / hosting

| Item | Status |
|------|--------|
| CapRover | Implemented deploy path (`captain.mp.dartcodes.com`) |
| GitHub Container Registry | Implemented in `.github/workflows/ci-cd.yml` |
| GitLab Container Registry | Legacy (`.gitlab-ci.yml`) |
| DigitalOcean Spaces | Optional object storage |
| Firebase | Optional push |
| AWS | Not used as primary host (S3 SDK for Spaces only) |

---

## Deployment

| Tool | Status |
|------|--------|
| Docker / Docker Compose | Implemented |
| GitHub Actions build + CapRover deploy | Implemented (`.github/workflows/ci-cd.yml`) |
| GitLab CI build + CapRover deploy | Legacy (`.gitlab-ci.yml`) |
| NGINX config in repo | Not Implemented |
| PM2 config in repo | Not Implemented |

---

## Logging

| Item | Status |
|------|--------|
| Console / process logs | Implemented (Node/Express) |
| `DEBUG_PRISMA` query logging | Optional in config usage |
| Centralized APM (Datadog, etc.) | Not Implemented |
| Structured log aggregation in repo | Not Implemented |

---

## Testing

| Layer | Tool | Status |
|-------|------|--------|
| Backend unit | Vitest | Implemented (auth, pricing/payment, orders, analytics, wallets/settlements, admin notifications, takeaway queue) |
| E2E | Playwright (`e2e/`) | Implemented (`login`, `order`) |
| Frontend unit | — | Not Implemented |
| Flutter tests | default widget_test stubs | Partial / stub only |
| Load / security automated suites | — | Not Implemented |
| CI test jobs | — | Not Implemented |

---

## Build tools

| Area | Tools |
|------|--------|
| Monorepo | npm workspaces (`backend`, `frontend`), concurrently |
| Backend | `tsc`, `ts-node-dev` |
| Frontend | Next.js webpack/turbopack, ESLint, PostCSS |
| Mobile | Flutter toolchain (`scripts/flutter.cmd` helper) |
| E2E | `@playwright/test` |

---

## Related

- [11_Environment_Configuration.md](11_Environment_Configuration.md)
- [12_Installation_Guide.md](12_Installation_Guide.md)
