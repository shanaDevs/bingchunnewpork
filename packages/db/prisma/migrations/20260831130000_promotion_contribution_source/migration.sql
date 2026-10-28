-- Shared promotion contribution source: PLATFORM (commission) vs JASON (invested balance).
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "contributionSource" TEXT DEFAULT 'JASON';
ALTER TABLE "promotion_usages" ADD COLUMN IF NOT EXISTS "contributionSource" TEXT DEFAULT 'JASON';
