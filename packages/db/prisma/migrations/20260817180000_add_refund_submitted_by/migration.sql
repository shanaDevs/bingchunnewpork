-- CreateEnum
CREATE TYPE "RefundSubmittedBy" AS ENUM ('CUSTOMER', 'BRANCH_ADMIN');

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN "submittedBy" "RefundSubmittedBy" NOT NULL DEFAULT 'CUSTOMER';
