-- Align with runtime ensureOrderDeliveryColumns partial unique index (non-null paymentRef only).
CREATE UNIQUE INDEX IF NOT EXISTS "orders_paymentRef_key" ON "orders" ("paymentRef") WHERE "paymentRef" IS NOT NULL;
