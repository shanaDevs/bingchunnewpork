-- Rebuild wallet_transactions from PAID CARD/PAYHERE orders (integer cents in amount).
-- Then run repair_wallet_balance_after.sql

BEGIN;

DELETE FROM wallet_transactions;

INSERT INTO wallet_transactions (
  id, "storeId", "orderId", type, amount, "balanceAfter",
  "paymentMethod", "paymentRef", description, reference, "createdAt"
)
SELECT
  gen_random_uuid(),
  o."storeId",
  o.id,
  'ORDER_PAYMENT'::"WalletTransactionType",
  (o.total * 100)::numeric(20, 4),
  0::numeric(20, 4),
  o."paymentMethod",
  o."paymentRef",
  'Order #' || o."orderNumber",
  o."orderNumber",
  o."createdAt"
FROM orders o
WHERE o."paymentStatus" = 'PAID'::"PaymentStatus"
  AND o."paymentMethod" IN ('CARD'::"PaymentMethod", 'PAYHERE'::"PaymentMethod")
ORDER BY o."storeId", o."createdAt", o.id;

COMMIT;
