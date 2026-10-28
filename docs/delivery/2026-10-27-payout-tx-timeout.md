# 2026-10-27 — payout transaction timeout

**Date:** 2026-10-27

## Changed

- Delivery payout pay computes the branch fee summary before the database transaction, so the insert is no longer cut off at the 5-second transaction limit.
- Pay payout INSERT casts `paymentMethod` to the `SettlementPaymentMethod` enum so Postgres accepts bank transfer, cash, or check.
