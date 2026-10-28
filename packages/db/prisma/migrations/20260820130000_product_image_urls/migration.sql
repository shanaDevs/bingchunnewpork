-- Multiple product photos as a JSON array of public URLs (DigitalOcean Spaces).
-- imageUrl stays the cover / primary photo for existing clients.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrls" JSONB;
