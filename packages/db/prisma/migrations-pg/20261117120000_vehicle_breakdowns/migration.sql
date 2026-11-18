-- Vehicle breakdowns belong in delivery (Prisma @@schema("delivery")).
-- Live DO had an empty leftover in public from runtime DDL; move it if present.

CREATE TABLE IF NOT EXISTS delivery."vehicle_breakdowns" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedLat" DOUBLE PRECISION NOT NULL,
  "reportedLng" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "fixedAt" TIMESTAMP(3),
  "fixedById" TEXT,
  "fixedByRole" TEXT,
  "fixedComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_breakdowns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_breakdowns_driverId_fixedAt_idx"
  ON delivery."vehicle_breakdowns" ("driverId", "fixedAt");

CREATE INDEX IF NOT EXISTS "vehicle_breakdowns_storeId_reportedAt_idx"
  ON delivery."vehicle_breakdowns" ("storeId", "reportedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_breakdowns_driverId_fkey'
      AND conrelid = 'delivery.vehicle_breakdowns'::regclass
  ) THEN
    ALTER TABLE delivery."vehicle_breakdowns"
      ADD CONSTRAINT "vehicle_breakdowns_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES public."admin_users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_breakdowns_jobId_fkey'
      AND conrelid = 'delivery.vehicle_breakdowns'::regclass
  ) THEN
    ALTER TABLE delivery."vehicle_breakdowns"
      ADD CONSTRAINT "vehicle_breakdowns_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES delivery."delivery_jobs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.vehicle_breakdowns') IS NOT NULL THEN
    INSERT INTO delivery."vehicle_breakdowns" (
      "id", "driverId", "jobId", "storeId", "reportedAt", "reportedLat", "reportedLng",
      "note", "fixedAt", "fixedById", "fixedByRole", "fixedComment", "createdAt"
    )
    SELECT
      "id", "driverId", "jobId", "storeId", "reportedAt", "reportedLat", "reportedLng",
      "note", "fixedAt", "fixedById", "fixedByRole", "fixedComment", "createdAt"
    FROM public."vehicle_breakdowns"
    ON CONFLICT ("id") DO NOTHING;

    DROP TABLE public."vehicle_breakdowns";
  END IF;
END $$;
