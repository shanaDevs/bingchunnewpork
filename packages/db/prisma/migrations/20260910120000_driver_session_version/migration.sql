-- Single active rider session: bump on each PIN login to invalidate older JWTs.
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
