CREATE TABLE IF NOT EXISTS delivery."delivery_job_admin_cancellations" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "cancelledByAdminId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "meritDelta" INTEGER,
  "previousJobStatus" delivery."DeliveryJobStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_job_admin_cancellations_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES delivery."delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_job_admin_cancellations_cancelledByAdminId_fkey"
    FOREIGN KEY ("cancelledByAdminId") REFERENCES public."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "delivery_job_admin_cancellations_jobId_createdAt_idx"
  ON delivery."delivery_job_admin_cancellations"("jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "delivery_job_admin_cancellations_cancelledByAdminId_createdAt_idx"
  ON delivery."delivery_job_admin_cancellations"("cancelledByAdminId", "createdAt");
