# Bing Chun Delivery

Flutter mobile app for delivery staff — sign in, view an optimized multi-stop route, and navigate to each customer.

## Design

Matches the Bing Chun web design system (navy dark theme, brand blue `#307ef2`, Poppins, shared logo & mascot assets from `frontend/public`).

## Prerequisites

- Flutter SDK 3.12+
- Bing Chun backend running on port `4000`

## Setup

```bash
cd mobile
flutter pub get
```

Apply the delivery driver role migration and seed (from repo root):

```bash
cd backend
mysql ... < prisma/migrations/add_delivery_driver_role.sql   # or prisma db push
npm run seed
```

## Run

```bash
cd mobile
flutter run
```

### API URL

| Target | Default base URL |
|--------|------------------|
| iOS Simulator / macOS | `http://localhost:4000/api` |
| Android Emulator | `http://10.0.2.2:4000/api` |
| Physical device | `--dart-define=API_BASE_URL=http://<your-lan-ip>:4000/api` |

## Demo account

- **Email:** `delivery@bingchunsrilanka.lk`
- **Password:** `Delivery@123`
- **Branch:** Nugegoda

## Features

- Secure token storage (`flutter_secure_storage`)
- Login via `POST /api/auth/delivery/login`
- Optimized route via `GET /api/delivery/route` (nearest-neighbour ordering from branch)
- OpenStreetMap route preview + Google Maps navigation per stop
