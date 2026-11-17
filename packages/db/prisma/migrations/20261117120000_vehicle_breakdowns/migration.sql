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
  CONSTRAINT "vehicle_breakdowns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_breakdowns_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES public."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vehicle_breakdowns_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES delivery."delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vehicle_breakdowns_driverId_fixedAt_idx"
  ON delivery."vehicle_breakdowns" ("driverId", "fixedAt");

CREATE INDEX IF NOT EXISTS "vehicle_breakdowns_storeId_reportedAt_idx"
  ON delivery."vehicle_breakdowns" ("storeId", "reportedAt");