import { execSql, runtimeSchemaPatchesAllowed } from './schemaPatch';

let ensured = false;
let inFlight: Promise<void> | null = null;

/** Create the in-review table when this process is allowed to patch schema. */
export function ensureBranchPayoutReviewSchema(): Promise<void> {
  if (!runtimeSchemaPatchesAllowed()) {
    ensured = true;
    return Promise.resolve();
  }
  if (ensured) return Promise.resolve();
  if (!inFlight) {
    inFlight = runEnsure().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runEnsure(): Promise<void> {
  await execSql(`
    CREATE TABLE IF NOT EXISTS "branch_payout_reviews" (
      "id" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "periodFrom" TIMESTAMP(3) NOT NULL,
      "periodTo" TIMESTAMP(3) NOT NULL,
      "markedById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "branch_payout_reviews_pkey" PRIMARY KEY ("id")
    )
  `);
  await execSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS "branch_payout_review_period"
      ON "branch_payout_reviews"("storeId", "periodFrom", "periodTo")
  `);
  await execSql(`
    CREATE INDEX IF NOT EXISTS "branch_payout_reviews_storeId_idx"
      ON "branch_payout_reviews"("storeId")
  `);
  await execSql(`
    DO $$ BEGIN
      ALTER TABLE "branch_payout_reviews"
        ADD CONSTRAINT "branch_payout_reviews_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `);
  ensured = true;
}
