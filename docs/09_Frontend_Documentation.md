# 09 — Frontend Documentation

**Package:** `@bingchun/frontend` (`frontend/`)  
**Stack:** Next.js 16 App Router, React 19, Zustand, TanStack Query, Tailwind 4

---

## 1. Routing (App Router)

### Customer storefront

| Route | Purpose |
|-------|---------|
| `/` | Home / order mode setup / featured products |
| `/menu` | Browse & add to cart |
| `/cart` | Cart review |
| `/checkout` | Contact, payment, place order |
| `/checkout/payhere` | Legacy PayHere redirect helper |
| `/mock-payment` | Dev mock PayHere |
| `/order/[id]` | Live order status |
| `/order/[id]/receipt` | Receipt |
| `/track/[id]` | Track alias |
| `/stores` | Store locator |
| `/promotions` | Promo list |
| `/account` | Profile hub |
| `/account/login` | Phone + social login |
| `/account/register` | Register |
| `/account/orders` | Order history |
| `/account/addresses` | Address book CRUD + map picker |
| `/account/loyalty` | Points balance, settings, recent transactions |
| `/account/notifications` | Notification preference management |

### Admin

| Route | Purpose |
|-------|---------|
| `/admin/login` | Staff login |
| `/admin` | Dashboard |
| `/admin/all-orders` | Global orders (system admin) |
| `/admin/orders` | Branch orders |
| `/admin/pos` | POS (**nav hidden**) |
| `/admin/delivery` | Jobs + drivers tabs |
| `/admin/delivery/route/[jobId]` | Route map |
| `/admin/drivers` | Redirect to delivery drivers tab |
| `/admin/stock` | Branch stock |
| `/admin/sales` | Branch sales |
| `/admin/brand-sales` | Brand sales |
| `/admin/delivery-payment` | Commission/settlement view |
| `/admin/wallet`, `/admin/wallet/[storeId]`, `/admin/wallet/report` | Wallets |
| `/admin/payment-history` | Settlements history |
| `/admin/menu` | Menu CRUD |
| `/admin/stores` | Stores |
| `/admin/branch-managers` | Managers + delivery milestones |
| `/admin/cashiers` | Cashiers |
| `/admin/promos` | Promos |
| `/admin/users`, `/admin/users/[id]`, `.../permissions` | Staff |
| `/admin/reports` | Report hub |
| `/admin/settings` | Payments, zones, app, FCM test |

---

## 2. Layouts

| File | Role |
|------|------|
| `src/app/layout.tsx` | Root: fonts (Geist + Poppins), metadata, `Providers`, `AppShell` |
| `src/app/admin/layout.tsx` | Admin sidebar/chrome; skipped on login |

`AppShell` shows Navbar/Footer for storefront; passthrough for `/admin`.

---

## 3. State management

### Zustand (`src/store/`)

| Store | Persist key | Role |
|-------|-------------|------|
| `authStore` | `bc-auth` (+ `bc_token`/`bc_user`) | Customer auth |
| `cartStore` | cart persist | Items, DELIVERY/TAKEAWAY, address/store |
| `themeStore` | `bc-theme` | light/dark |
| `confirmStore` | — | Promise-based confirms |

### React Query

`Providers.tsx` — QueryClient (staleTime ~5m) for server data.

### React Context / Redux

**Not Implemented** as auth/data Context layer. Redux **Not Implemented**.

---

## 4. Hooks

| Hook | Purpose |
|------|---------|
| `useAdminSessionGuard` | Idle 15m logout + refresh poll |
| `useClientHydrated` | Avoid SSR/cart mismatch |
| `useCupPourPulse` | Cart animation |
| `useCustomerSocket` / `useOrderTrackSocket` | Socket rooms + invalidation |
| `useMaxCupsPerRider` | Reads `/settings/app` |

---

## 5. API client

`src/lib/api.ts`:

- Base: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`)
- Methods: get/post/put/patch/delete
- Bearer from customer token
- Throws `ApiError` on failure

Admin pages often use **local `adminFetch`** with `bc_admin_token` (duplicated; no single shared admin client).

Socket: `NEXT_PUBLIC_SOCKET_URL`.

---

## 6. Forms & validation

| Approach | Status |
|----------|--------|
| react-hook-form / Formik | Not Implemented |
| Frontend Zod | Not Implemented |
| Pattern used | HTML attributes + imperative checks + `toast.error` |

Backend Zod still enforces server-side rules.

---

## 7. Components (areas)

| Area | Examples |
|------|----------|
| Layout | `Navbar`, `Footer`, `AppShell` |
| Menu | `ProductCard`, `ProductDrawer`, `CategoryChip` |
| Cart | `FloatingCart`, cup animations |
| Order | maps, QR, tracking progress, ratings |
| Auth | `SocialLoginButtons` |
| Payment | `PayHereCheckout` |
| Admin | 100+ modules: orders, delivery maps, wallet modals, reports, charts |
| UI | shadcn/Base UI primitives |

**Admin menu product form** (`/admin/menu`, super-admin only): `name`, `basePrice`, `cost`, `categoryId`, `tag`, `isDeliveryAvailable`, `description`, `ingredients`, `imageUrl`, `toppingIds`.

---

## 8. Auth UI

**Customer:** phone login (no OTP required in UI), Google/Facebook if client IDs set, register, logout clears store.

**Admin:** email/password → save tokens → permission-filtered nav → idle timeout.

**Next middleware auth:** Not Implemented.

---

## 9. Styling

- Tailwind v4 + design tokens in `globals.css`
- Brand blue `#307ef2`, navy surfaces, dark/light via `data-theme`
- Framer Motion / GSAP for motion

---

## 10. Tests

| Kind | Status |
|------|--------|
| Frontend unit tests | Not Implemented |
| Playwright E2E (repo root) | Implemented — login + order |

---

## Related

- [20_User_Guide.md](20_User_Guide.md)
- [21_Admin_Guide.md](21_Admin_Guide.md)
