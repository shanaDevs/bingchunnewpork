-- Recompute wallet_transactions.balanceAfter per store (chronological running sum)
-- and refresh store_wallets.balance from ledger totals.
--
-- Run after bulk wallet sync / SQL seeds:
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/repair_wallet_balance_after.sql

BEGIN;

WITH ordered AS (
  SELECT
    id,
    "storeId",
    amount,
    SUM(amount) OVER (
      PARTITION BY "storeId"
      ORDER BY "createdAt" ASC, id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::int AS new_balance
  FROM wallet_transactions
)
UPDATE wallet_transactions wt
SET "balanceAfter" = o.new_balance
FROM ordered o
WHERE wt.id = o.id
  AND wt."balanceAfter" IS DISTINCT FROM o.new_balance;

UPDATE store_wallets sw
SET balance = COALESCE(x.sum_amount, 0),
    "updatedAt" = NOW()
FROM (
  SELECT "storeId", SUM(amount)::int AS sum_amount
  FROM wallet_transactions
  GROUP BY "storeId"
) x
WHERE sw."storeId" = x."storeId";

COMMIT;
