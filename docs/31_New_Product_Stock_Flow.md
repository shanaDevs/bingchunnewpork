# 31 — New Product Stock Flow (Batch FIFO)

**Status:** Implemented — batch-based FIFO inventory

When a super admin creates a product, it is released to **all active branches** at **0 stock**. Branch admins **receive stock as dated batches** (auto-generated batch number). Customers see **Coming Soon** until the branch has received stock.

## Batch receive flow

1. Branch admin opens **Branch Stock** → **Receive Stock** (or legacy top-up shim).
2. Backend mints batch number `B-{STORECODE}-{YYMMDD}-{NNN}`.
3. A `stock_batches` row is created; `store_products.stock` = sum of active batch `remainingQty`.
4. `weeklyBaseQty` is **derived** (total received this week); `weeklyTargetQty` is **manual** (branch goal).
5. Orders consume batches **FIFO** (oldest `receivedAt` first) via `stock_batch_allocations`.

## Thresholds

- **Low stock** and **online out-of-stock buffer** are configurable per branch+product (defaults 25 / 5).
- The buffer units are hidden from **online** orders but remain sellable at the **counter**.
- **No automatic weekly stock reset** — stock history and reports are derived from `stock_audit_logs` and `stock_batches`.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/stock/:productId/batches` | Receive a batch |
| GET | `/admin/stock/:productId/batches` | List batches (FIFO order) |
| GET | `/admin/stock/batches` | Branch-wide batch list |
| PATCH | `/admin/stock/batches/:batchId` | Adjust or write off |
| PATCH | `/admin/stock/:productId/settings` | Target qty + thresholds |

Legacy `POST /admin/stock/:productId/topup` creates a batch for positive deltas.

---

## Branch-level emergency deactivation

Branch admins can temporarily remove a product from their branch menu without affecting other branches or the global catalog.

### Toggle location

**Page:** `frontend/src/app/admin/stock/page.tsx` → **Stock Table** tab → **Actions** column (Power icon)

- **Green Power icon** — product is active at this branch
- **Red Power icon** — product is branch-inactive (admin deactivated)

Branch-deactivated products appear in the dedicated **Inactive** stock-level tab (not Out of Stock). Click the **Inactive** KPI card or the **Inactive** tab to review them. The tab shows frozen quantity and batch count per row.

**New products (0 stock, no batches):** When a branch admin deactivates a new product via the power toggle, it moves to **Inactive** even though there are no batches to freeze. The backend persists `store_products.branchDeactivatedAt` to distinguish admin deactivation from catalog-sync defaults (`isAvailable: false` with no timestamp), which remain in **New Products**.

### Deactivation flow

1. Branch admin clicks the green Power icon on an active product row.
2. Backend calls `PATCH /admin/stock/:productId` with `{ isAvailable: false, storeId }`.
3. All `ACTIVE` batches for that branch+product are set to `FROZEN` (quantities preserved). Products with no batches skip this step.
4. `store_products.stock` is set to `0`, `isAvailable` is set to `false`, and `branchDeactivatedAt` is set to the current time.
5. The product disappears from the customer menu for that branch only (menu API excludes products with `FROZEN` batches or a non-null `branchDeactivatedAt`; no customer frontend changes required).

### Reactivation flow

1. Branch admin clicks the red Power icon on an inactive product row.
2. **Reactivate Stock** modal opens and loads frozen batches via `GET /admin/stock/:productId/batches`.
3. Modal shows total frozen units (e.g. *"You have 100 units across 2 frozen batches"*).
4. Admin can:
   - **Continue** with the full frozen quantity, or
   - **Edit** the quantity down (difference is written off from newest batches first).
5. On confirm, backend calls `PATCH /admin/stock/:productId` with `{ isAvailable: true, storeId, overrideQty }`.
6. `FROZEN` batches are restored to `ACTIVE` (if any); `branchDeactivatedAt` is cleared; stock is recalculated; product becomes visible to customers again.

### Batch status: `FROZEN`

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Available for FIFO consumption |
| `FROZEN` | Temporarily held while product is branch-inactive |
| `DEPLETED` | Fully consumed |
| `WRITTEN_OFF` | Permanently removed |

FIFO order consumption (`lockFifoBatches`) only selects `ACTIVE` batches, so frozen stock is never sold while a product is inactive.

### API

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| PATCH | `/admin/stock/:productId` | `{ isAvailable: false, storeId }` | Deactivate + freeze batches |
| PATCH | `/admin/stock/:productId` | `{ isAvailable: true, storeId, overrideQty? }` | Reactivate + unfreeze batches |

### Related files

| Area | Path |
|------|------|
| Stock table UI | `frontend/src/components/admin/stock/StockTableTab.tsx` |
| Reactivation modal | `frontend/src/components/admin/stock/ReactivateStockModal.tsx` |
| Availability API | `backend/src/controllers/storeInventoryController.ts` |
| Batch freeze engine | `backend/src/lib/batchStockEngine.ts` → `setBranchProductAvailability()` |
| Customer menu filter | `backend/src/controllers/menuController.ts` (excludes products with frozen batches or `branchDeactivatedAt`) |

---

## Original flow (catalog bootstrap)

## Roles

| Role | Backend role | Actions |
|------|--------------|---------|
| Super Admin | `SYSTEM_ADMIN` | Creates/edits catalog products (no branch or weekly-qty fields) |
| Branch Admin | `STORE_MANAGER` | Receives notification, sets weekly stock in Branch Stock |
| Customer | — | Sees **Coming Soon** tag until branch stock is configured |

Cashiers (`CASHIER`) are **not** notified and cannot edit stock (existing `blockCashier` on stock routes).

---

## End-to-end flow

```mermaid
sequenceDiagram
  participant SA as SuperAdmin
  participant API as Backend
  participant DB as store_products
  participant BA as BranchAdmin
  participant C as Customer

  SA->>API: POST /menu/products
  API->>DB: Create product + rows for all branches (weeklyBaseQty=0)
  API->>BA: AdminNotification NEW_PRODUCT (per branch STORE_MANAGER)
  BA->>BA: Click notification bell
  BA->>BA: Navigate to /admin/stock?highlight=productId
  BA->>BA: Scroll to highlighted row
  BA->>API: POST /admin/stock/:productId/topup (Adjust Stock modal)
  API->>DB: weeklyBaseQty > 0, weeklyRemainingQty updated
  C->>API: GET /menu/products?storeId=...
  API-->>C: branchStock.isComingSoon=false when weeklyBaseQty > 0
  C->>C: Product tag shows super-admin tag; normal in/out-of-stock rules apply
```

---

## Super Admin — New Product modal

**Page:** `frontend/src/app/admin/menu/page.tsx`

Removed from the modal:

- Weekly base qty per branch
- Branch availability selector

On create, the backend always calls `addProductToAllBranches(productId, 0)`.

**API:** `POST /api/menu/products`

---

## Branch stock initialization

**Module:** `backend/src/lib/storeInventory.ts`

New products get a `store_products` row per active branch:

| Field | Initial value |
|-------|----------------|
| `weeklyBaseQty` | `0` |
| `weeklyRemainingQty` | `0` |
| `isAvailable` | `false` |

`weeklyBaseQty === 0` means the branch has **not configured** stock yet.

---

## Customer — Coming Soon

**Rule:** A product at the customer's selected branch is **Coming Soon** when `store_products.weeklyBaseQty === 0`.

| State | Condition | Customer UI |
|-------|-----------|-------------|
| Coming Soon | `weeklyBaseQty === 0` | Tag badge **Coming Soon**; card not orderable |
| In stock | `weeklyBaseQty > 0` and remaining qty above threshold | Super-admin tag (Classic/Popular/New/…); orderable |
| Out of stock | `weeklyBaseQty > 0` and remaining qty exhausted | **Out of Stock** overlay |

**Backend:** `branchStockFromRow()` in `backend/src/controllers/menuController.ts` sets `isComingSoon`.

**Frontend helpers:** `isProductComingSoon()`, `getProductDisplayTag()` in `frontend/src/lib/productAvailability.ts`.

**Components:** `ProductCard`, product detail page, menu/home/wishlist listings.

---

## Branch admin notifications

**Module:** `backend/src/lib/branchNotifications.ts` — `notifyBranchNewProduct()`

- Triggered from `createProduct` after branch rows are created
- One notification per active `STORE_MANAGER` per branch
- Type: `NEW_PRODUCT`
- DB column: `admin_notifications.productId` (auto-added via `ensurePaymentSettingsTables`)

**Live alert UI:** Same prominent corner toast + sound as new orders (`AdminNotificationProvider` → `BranchNewProductToast`), with **View Branch Stock** action.

**Click behavior (bell or toast):** navigates to:

```
/admin/stock?highlight={productId}
```

**Branch Stock page** clears filters, paginates to the row, scrolls into view, and flashes a highlight ring.

---

## Adjust Stock (unchanged)

Branch admins use the existing **Adjust Stock** modal (`TopUpModal` in `frontend/src/app/admin/stock/page.tsx`).

**API:** `POST /api/admin/stock/:productId/topup`

When qty is set from 0, `manualTopUp` updates `weeklyBaseQty`, clearing **Coming Soon** for that branch.

---

## Database migration

Migration: `packages/db/prisma/migrations/20260806120000_admin_notification_product_id`

```sql
ALTER TABLE admin_notifications ADD COLUMN productId VARCHAR(191) NULL;
```

---

## Related files

| Area | Path |
|------|------|
| Menu modal | `frontend/src/app/admin/menu/page.tsx` |
| Create product API | `backend/src/controllers/menuController.ts` |
| Branch inventory | `backend/src/lib/storeInventory.ts` |
| Notifications | `backend/src/lib/branchNotifications.ts` |
| Notification bell | `frontend/src/components/admin/AdminNotificationBell.tsx` |
| Branch Stock UI | `frontend/src/app/admin/stock/page.tsx` |
| Customer availability | `frontend/src/lib/productAvailability.ts` |
| Product card | `frontend/src/components/menu/ProductCard.tsx` |
