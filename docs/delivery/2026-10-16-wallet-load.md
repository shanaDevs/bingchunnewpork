# 2026-10-16 — wallet load

**Date:** 2026-10-16

## Changed

- Delivery wallet on `/wallet` loads summary, payout preview, and payout history from `/admin/delivery-wallet` on the delivery service. The live totals start as soon as the wallet is unlocked; the payout preview only fills the date caption.
- Payout history can download statement PDFs: `GET /admin/delivery-wallet/payouts/:id/statement` (single) and `POST /admin/delivery-wallet/payouts/statement-zip` with `{ ids }` (bulk, max 40). Both require `DELIVERY_WALLET` read and `X-Delivery-Wallet-Unlock`.
