# 19 — Developer Guide

## 1. Coding standards (observed)

| Area | Convention |
|------|------------|
| Language | TypeScript (strict) on web/API; Dart on mobile |
| API responses | `success()` / `paginated()` / `error()` helpers |
| Errors | Throw `AppError(message, status)` → error middleware |
| Validation | Zod in controllers |
| Money | Integers in LKR units used by app |
| IDs | UUID strings |
| Admin auth header | Bearer admin JWT |
| Logging | `logger` util |

Prefer matching existing file style over introducing new frameworks.

---

## 2. Naming conventions

| Kind | Pattern |
|------|---------|
| Controllers | `*Controller.ts` camelCase exports |
| Routes | plural nouns under `/api` |
| Prisma models | PascalCase; tables `@@map` snake_plural |
| Permission menus | `SCREAMING_SNAKE` (e.g. `PAYMENT_HISTORY`) |
| React components | PascalCase files under `components/` |
| Zustand stores | `*Store.ts` |
| Flutter providers | `*_provider.dart` |

---

## 3. Architecture principles

1. **Thin routes** — wire middleware + controller only
2. **Domain in `lib/`** — reusable pure/Prisma logic
3. **No repository layer today** — if adding one, keep Prisma behind it consistently
4. **Permissions for every new admin route** — do not rely on UI hiding alone
5. **Forward-only order status** — use `orderStatus` helpers
6. **Idempotent wallet credits** — respect unique `(orderId, type)`

---

## 4. Adding a backend module

1. Add Prisma model (if needed) → `db push` or SQL patch + `ensure*` if required for prod
2. Create controller functions with Zod
3. Add `routes/*.ts` and mount in `routes/index.ts`
4. Apply `authenticate` / `requirePermission` as appropriate
5. Add Vitest coverage under `backend/tests/`
6. Update docs `06` and `07` if public behaviour changes

---

## 5. Creating APIs

Example route skeleton:

```ts
router.get(
  '/example',
  authenticate,
  requireAdmin,
  requirePermission('SETTINGS', 'read'),
  controller.listExample
);
```

Response:

```ts
return success(res, payload);
```

---

## 6. Database migrations

Current practice:

| Approach | When |
|----------|------|
| `npm run db:push` | Local/dev schema sync |
| SQL file in `prisma/migrations/` | Documented manual patch |
| `ensure*Schema` in `lib/` | Production self-heal for additive columns/tables |
| `prisma migrate dev` | Available via script but not primary history |

**Recommendation for new work:** Prefer formal Migrate for additive changes; keep ensure* only for emergency compatibility.

Seed:

```bash
npm run db:seed
```

---

## 7. Adding admin UI

1. Add `frontend/src/app/admin/<feature>/page.tsx`
2. Register nav item in admin layout (respect role + permissions)
3. Call `/api/admin/...` with admin token
4. Prefer extracting shared `adminFetch`

---

## 8. Socket events

Join rooms via `trackOrder`, `joinUser`, `joinAdmin`. Emit from lib helpers using `getIo()`.

---

## 9. Flutter changes

- Driver: Riverpod providers + GoRouter in `mobile/lib`
- Customer: keep `API_BASE_URL` dart-define in mind
- Do not commit secrets into `api_config.dart`

---

## Related

- [10_Backend_Documentation.md](10_Backend_Documentation.md)
- [12_Installation_Guide.md](12_Installation_Guide.md)
