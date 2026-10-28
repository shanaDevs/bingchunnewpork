# 12 — Installation Guide

## 1. Prerequisites

| Tool | Version / notes |
|------|-----------------|
| Node.js | ≥ 18 (20 recommended; Docker uses 20) |
| npm | ≥ 9 |
| MySQL | 8.x (local or Docker) |
| Flutter SDK | Optional — for `mobile/` and `customer_mobile/` (Dart ^3.12) |
| Docker Desktop | Optional — Compose stack |
| Git | Required |

---

## 2. Install dependencies

From repository root:

```bash
npm run install:all
```

This runs `npm install` (workspaces: backend + frontend) and `flutter pub get` for both Flutter apps.

Web/API only:

```bash
npm install
```

Flutter separately:

```bash
npm run install:mobile
npm run install:customer
```

---

## 3. Environment files

**Backend**

```bash
# Windows
copy backend\env.example backend\.env
# macOS/Linux
cp backend/env.example backend/.env
```

Set `DATABASE_URL`. Docker MySQL example:

```env
DATABASE_URL="mysql://bingchun:YOUR_STRONG_PASSWORD@localhost:3306/bingchun"
```

**Frontend**

```bash
copy frontend\env.example frontend\.env
# or
cp frontend/env.example frontend/.env
```

---

## 4. Database setup

Start MySQL only:

```bash
docker compose up mysql -d
```

Generate client + sync schema + seed:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Optional dummy feed:

```bash
npm run db:feed
```

Prisma Studio:

```bash
npm run db:studio
```

**Note:** Prefer `db:push` + seed for local/dev. Formal Migrate history is partial (SQL patches + runtime ensure*).

---

## 5. Run (development)

Both API + web:

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Health | http://localhost:4000/health |

Individually:

```bash
npm run dev:backend
npm run dev:frontend
npm run dev:mobile
npm run dev:customer
```

### Flutter API URL tips

- Android emulator: often `http://10.0.2.2:4000/api`
- Physical device: `--dart-define=API_BASE_URL=http://<LAN-IP>:4000/api`
- Customer app: **required** dart-define for non-LAN targets (default is hardcoded LAN IP)

---

## 6. Build

```bash
npm run build                 # workspaces
npm run build:backend
npm run build:frontend
npm run build:mobile          # Flutter APK driver
npm run build:customer        # Flutter APK customer
```

Backend start (compiled):

```bash
npm run start:backend
```

Frontend start:

```bash
npm run start:frontend
```

---

## 7. Docker (full stack)

```bash
docker compose up --build
```

Services: `mysql`, `backend`, `frontend`.  
Override secrets via env / `.env` at compose level before production use.

---

## 8. Tests (local)

```bash
npm run test:unit
npm run test:e2e
```

Requires frontend reachable for Playwright (see [14_Testing_Guide.md](14_Testing_Guide.md)).

---

## 9. Production-oriented local check

1. Set strong JWT secrets and real URLs in `.env`
2. `NODE_ENV=production`
3. `npm run build && npm run start:backend` / `start:frontend`
4. Or use Docker Compose with production env values

Full production path: [13_Deployment_Guide.md](13_Deployment_Guide.md).
