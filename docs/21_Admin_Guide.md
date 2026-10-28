# 21 — Admin Guide

Staff operations via Next.js admin (`/admin`). Roles: System Admin, Store Manager, Cashier, Report Viewer. Drivers use the Flutter app, not the web panel for job execution.

![Screenshot: Admin login](../assets/docs/placeholders/admin-login.png)

---

## 1. Sign in

1. Open `/admin/login`.
2. Enter staff email and password.
3. Session stored in browser; idle timeout ~15 minutes; token refresh handled automatically.

Cashiers and managers must be linked to a store. Delivery driver accounts cannot sign in here.

---

## 2. Role capabilities (summary)

| Area | System Admin | Store Manager | Cashier |
|------|--------------|---------------|---------|
| Dashboard | Yes | Yes | Yes (limited) |
| All orders (global) | Yes | No (branch orders) | Branch |
| Branch order updates | No (`requireBranchOrderWrite`) | Yes | Yes |
| Stock / wallet / payment history | Yes | Yes (scoped) | Blocked (`blockCashier`) |
| Brand reports | Yes | No | No |
| Settings (PayHere, global zones) | Yes | Limited | No |
| Branch managers / users | Yes | — | — |
| Cashiers | Yes | Yes (branch) | — |
| Delivery jobs | Yes | Yes | Limited |

Exact menus also filtered by `permissions` matrix (`/admin/me/permissions`).

---

## 3. Dashboard

`/admin` — KPIs, charts, recent orders. Permission: `DASHBOARD` read.

![Screenshot: Dashboard](../assets/docs/placeholders/admin-dashboard.png)

---

## 4. Orders

| Screen | Path | Use |
|--------|------|-----|
| Branch orders | `/admin/orders` | Filter, update status, edit contact/items, collect payment, complete takeaway, QR/scanners |
| All orders | `/admin/all-orders` | System-wide view |
| POS | `/admin/pos` | Counter cart + payment (**hidden from nav**) |

**Status rules:** Forward-only; delivery includes `OUT_FOR_DELIVERY`; takeaway skips it.

![Screenshot: Orders](../assets/docs/placeholders/admin-orders.png)

---

## 5. Delivery

`/admin/delivery`

1. View pending delivery orders.
2. Classify / cluster into jobs (cup limits apply).
3. Preview route on map.
4. Create delivery jobs.
5. Manage drivers tab (or `/admin/drivers` redirect).
6. Open `/admin/delivery/route/[jobId]` for map detail.

Drivers claim/start/complete jobs in the **Flutter driver app**.

---

## 6. Stock

`/admin/stock` — toggle availability / update stock; sync inventory. Cashiers blocked.

**Stock Movement tab** (`?tab=movement`):

| Sub-tab | Audience | Description |
|---------|----------|-------------|
| All Products | All stock admins | Flat audit log (orders, adjustments, weekly resets) |
| Product-wise | Super admin only | Daily valuation ledger for one product |

**Product-wise ledger columns:** Date, Open Stock, Stock Value, Stock In, Stock Out, LKR In, LKR Out, Stock Margin, LKR Margin.

- Select branch, product, and date range (From / To).
- First row shows opening balance on the day **before** the range start.
- Each subsequent day shows movements and closing margin; zero-movement days are included.
- **LKR In** = stock sold out × selling price (`basePrice`); **LKR Out** = stock brought in × cost; **LKR Margin** = previous day's LKR Margin + LKR In − LKR Out (running total; shown as — when 0).
- Final **Brought Forward** row shows closing stock qty, stock value, and cumulative LKR Margin at end of range.

---

## 7. Sales & brand analytics

| Path | Audience |
|------|----------|
| `/admin/sales` | Branch sales |
| `/admin/brand-sales` | Brand-wide (system admin) |
| `/admin/reports` | Report hub (fulfillment, loyalty, cancellations, wallet ledger, etc.) |

---

## 8. Wallet & settlements

| Path | Use |
|------|-----|
| `/admin/wallet` | Balances, withdrawals |
| `/admin/wallet/[storeId]` | Branch ledger, settle, adjust |
| `/admin/wallet/report` | Printable report |
| `/admin/delivery-payment` | Branch commission view |
| `/admin/payment-history` | Submit/verify settlements with receipts |

Workflow:

1. Online paid orders credit store wallet.
2. Branch requests withdrawal — snapshot stores period breakdown + shared promo contribution (`finalPayoutAmount`).
3. System admin approves (proof upload) or rejects. Approval blocked if Jason balance cannot cover platform contribution.
4. On approve: branch paid `finalPayoutAmount`; Jason EXPENSE recorded for platform share.
5. Commission settlements submitted with receipt; verified by admin.

| Path | Use |
|------|-----|
| `/admin/jason` | Jason investments/expenses; SPPC deductions appear as linked EXPENSE rows |

---

## 9. Menu, stores, promos

| Path | Use |
|------|-----|
| `/admin/menu` | Super-admin catalog CRUD: categories, products, toppings, image upload |
| `/admin/stores` | Create/toggle stores |
| `/admin/promos` | Promo CRUD |

**Super-admin product form fields** (`/admin/menu` → Add/Edit Product):

| Field | Notes |
|-------|-------|
| name | Required |
| basePrice | Selling price (LKR), required |
| cost | Unit cost (LKR), required; stored in DB, not shown to customers |
| categoryId | Required |
| tag | Classic, Popular, New, Best Seller, Signature, Rs.200 Only |
| isDeliveryAvailable | Delivery on/off |
| description / ingredients | Optional |
| imageUrl | Optional file upload |
| toppingIds | Multi-select addons |

---

## 10. Staff management

| Path | Use |
|------|-----|
| `/admin/users` | Staff list |
| `/admin/users/[id]` | Detail, store access |
| `/admin/users/[id]/permissions` | CRUD matrix per menu |
| `/admin/branch-managers` | Managers + delivery access milestones |
| `/admin/cashiers` | Cashier CRUD |

---

## 11. Settings

`/admin/settings` (system admin for payment/global zones):

- Enable payment methods
- PayHere merchant id/secret/mode
- App settings (convenient fee, pickup edit flags, max cups, milestones)
- Delivery zones CRUD
- FCM test utilities (as exposed in UI)

---

## 12. Notifications

Admin notification bell joins Socket.io admin/store rooms for new orders and updates.

---

## 13. Driver app (ops summary)

1. Open Bing Chun Delivery app.
2. Enter staff PIN (4–6 digits).
3. View scheduled jobs → assign → start → navigate map → mark orders delivered → complete job.

![Screenshot: Driver jobs](../assets/docs/placeholders/driver-jobs.png)

---

## Related

- [08_Authentication_Authorization.md](08_Authentication_Authorization.md)
- [07_Business_Logic.md](07_Business_Logic.md)
