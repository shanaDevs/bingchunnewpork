-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wishlistShareToken" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_wishlistShareToken_key" ON "users"("wishlistShareToken");
