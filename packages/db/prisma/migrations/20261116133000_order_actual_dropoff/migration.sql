-- Rider GPS captured when the customer OTP is confirmed (proof of drop-off).
-- Planned checkout coords stay on deliveryLat / deliveryLng.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "actualDropoffLat" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "actualDropoffLng" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "actualDropoffAt" TIMESTAMP(3);
