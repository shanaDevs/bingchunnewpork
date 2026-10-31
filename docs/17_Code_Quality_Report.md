# 17 — Code Quality Report

Evidence-based findings from repository analysis. Not an automated Sonar report.

---

## 1. Code smells

| Smell | Location / note |
|-------|-----------------|
| Duplicated `adminFetch` | Many admin pages redefine fetch with admin token |
| Hardcoded LAN IPs | Backend Socket CORS; customer_mobile API default |
| Hardcoded demo PIN UI | Driver app login prefills/shows PIN |
| Large admin pages | Complex UI + data fetching colocated |
| Client-only Next pages | Misses RSC benefits; auth not middleware-guarded |
| Runtime DDL in app boot | Schema patches mixed with application server |
| README drift | Root omits customer Flutter; frontend README is boilerplate; driver README documents email login but code is PIN |

---

## 2. Duplicate code

- Repeated admin HTTP helpers vs shared `lib/api.ts` for customers
- Parallel notification patterns (customer vs admin)
- Similar wallet/settlement preview logic across controllers/libs (related but split)

**Suggestion:** Extract `adminApi` client + shared query hooks.

---

## 3. Large functions / modules

High-complexity areas (by responsibility size):

- `orderController.ts` — place order, payments, queue, ratings
- `walletController.ts` — many payout paths
- `analyticsController.ts` — numerous report aggregations
- Admin React pages for orders/wallet/reports

**Suggestion:** Split by use-case handlers; extract report query services.

---

## 4. Unused / dead code

| Item | Status |
|------|--------|
| Driver `RouteScreen` / `route_service` / `route_provider` | Unreachable from GoRouter |
| Customer `register_screen.dart` | Router maps `/register` to LoginScreen |
| `sendTestCustomerPush` export | No route wired |
| `GOOGLE_CLIENT_SECRET` / `FCM_SERVER_KEY` | Configured but unused in active flows |
| Frontend POS nav | Page exists, `hidden: true` |
| Mock PayHere path | Intentional for invalid credentials — keep for staging |

---

## 5. Unused packages

No full unused-dependency audit was executed in this documentation pass.  
**Recommendation:** run `depcheck` / `npm prune` reviews periodically. Flutter dependency version skew (`flutter_secure_storage`, `flutter_map`) between apps increases maintenance cost.

---

## 6. Dead / stub integrations

- Dialog SMS & SendGrid email stubs throw if selected
- Customer mobile: help ticket simulated delay; referral client-only; settings toggles cosmetic; payment methods local fake card

---

## 7. Refactoring suggestions

1. Introduce repository or at least service layer for orders/wallet to shrink controllers
2. Formalize Prisma Migrate; reduce boot-time `ensure*`
3. Shared admin API module + React Query keys
4. Env-driven CORS only; remove LAN hardcodes
5. Complete or remove POS nav (admin MFA already removed)
6. Align Flutter API config with documented production defaults
7. Expand Vitest coverage to orders, wallet, admin permissions
8. Add CI test stage before CapRover deploy
9. Fix CI `Frontend` vs `frontend` casing
10. Replace interim phone-login-without-OTP before calling production “secure”

---

## Related

- [18_Known_Issues.md](18_Known_Issues.md)
- [14_Testing_Guide.md](14_Testing_Guide.md)
