-- Move delivery-owned tables into schema "delivery" (metadata-only; FKs preserved).
CREATE SCHEMA IF NOT EXISTS delivery;

ALTER TABLE IF EXISTS public."delivery_zones" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."rider_ratings" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_jobs" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_job_orders" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_payouts" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_access_logs" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."driver_locations" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."driver_shifts" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."driver_devices" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_attempts" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_otps" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_events" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_outbox" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."delivery_job_rejections" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."driver_complaints" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."driver_branch_requests" SET SCHEMA delivery;
ALTER TABLE IF EXISTS public."merit_point_history" SET SCHEMA delivery;

-- Ephemeral OTP display table (raw SQL, not Prisma model).
ALTER TABLE IF EXISTS public."delivery_code_live" SET SCHEMA delivery;

-- Prisma enum used only by delivery_jobs (move with table when present in public).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'DeliveryJobStatus' AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public."DeliveryJobStatus" SET SCHEMA delivery;
  END IF;
END $$;
