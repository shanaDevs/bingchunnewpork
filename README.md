# Bing Chun Delivery

npm workspaces monorepo for the Bing Chun delivery platform.

## Packages

| Name | Path | Stack |
|------|------|-------|
| `@bingchun/backend` | `backend/` | Express, Prisma, Socket.io (orders, payments, admin) |
| `@bingchun/delivery-service` | `delivery-service/` | Express delivery domain (port 4100) |
| `@bingchun/db` | `packages/db/` | Shared Prisma schema + client |
| `@bingchun/delivery-domain` | `packages/delivery-domain/` | Shared routing/fee/geo helpers |
| `@bingchun/frontend` | `Frontend/` | Next.js (customer + admin) |
| Driver app (Flutter) | `mobile/` | Flutter — kept until Kotlin app is verified |
| Driver app (Kotlin) | `driver_android/` | Jetpack Compose + osmdroid (Android only) |
| Customer app | `customer_mobile/` | Flutter |

See [docs/27_Delivery_Service.md](docs/27_Delivery_Service.md) and [docs/adr/](docs/adr/) for the delivery architecture.

## Prerequisites

- Node.js 18+
- MySQL 8 (local install or Docker via `docker-compose.yml`)
- npm 9+

Optional: [Flutter SDK](https://docs.flutter.dev/get-started/install) for `mobile/`, or Android Studio for [`driver_android/`](driver_android/README.md).

## Setup

### 1. Install (from repo root)

```bash
npm run install:all
```

Or without mobile:

```bash
npm install
```

### 2. Environment files

**Backend**

```bash
copy backend\env.example backend\.env     # Windows
cp backend/env.example backend/.env       # macOS/Linux
```

Set `DATABASE_URL` in `backend/.env`. With Docker MySQL:

```env
DATABASE_URL="mysql://bingchun:YOUR_STRONG_PASSWORD@localhost:3306/bingchun"
```

**Frontend**

```bash
copy frontend\env.example frontend\.env   # Windows
cp frontend/env.example frontend/.env     # macOS/Linux
```

### 3. Database

Start MySQL (optional Docker):

```bash
docker compose up mysql -d
```

Sync schema:

```bash
npm run db:push
```

Seed (optional):

```bash
npm run db:seed
```

### 4. Development

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Delivery Service | http://localhost:4100 (`npm run dev:delivery`) |

Individual apps:

```bash
npm run dev:backend
npm run dev:frontend
npm run dev:delivery
npm run dev:mobile
npm run install:driver-android   # Kotlin Compose driver APK → connected device
```

See [driver_android/README.md](driver_android/README.md) for LAN IP / `STORE_ID` config.

## Root scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend + frontend together |
| `npm run build` | Build all npm workspaces |
| `npm run db:push` | Push Prisma schema to MySQL |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Prisma Studio |
| `npm run build:driver-android` | Assemble Kotlin driver debug APK |
| `npm run install:driver-android` | Install Kotlin driver on a USB device |

## QA Documentation

- [Normal-user login E2E testing guide](docs/login-e2e-testing.md)
- [Login E2E QA onboarding and mentor guidance](docs/login-e2e-qa-guidance.md)
- [Login unit testing guide (Vitest)](docs/login-unit-testing.md)

## Production deploy (GitHub → CapRover)

CI/CD runs only when code is merged (or pushed) onto **`production`**. Workflow: [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

**GitHub secrets** (Settings → Secrets and variables → Actions):

- `CAPROVER_BACKEND_TOKEN` — from CapRover app `bing-chun-backend`
- `CAPROVER_FRONTEND_TOKEN` — from CapRover app `bing-chung`

Step-by-step token setup: [docs/13_Deployment_Guide.md](docs/13_Deployment_Guide.md#21-how-to-add-caprover-tokens-to-github).

## Docker (production-style)

```bash
docker compose up --build
```
