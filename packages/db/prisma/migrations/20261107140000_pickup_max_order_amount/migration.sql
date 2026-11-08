-- Pickup (takeaway) maximum order amount for online placement (LKR).
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "pickupMaxOrderAmount" INTEGER;
