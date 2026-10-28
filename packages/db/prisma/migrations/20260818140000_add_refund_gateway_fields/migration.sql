-- AlterTable
ALTER TABLE "refunds" ADD COLUMN "includeGatewayFee" BOOLEAN,
ADD COLUMN "additionalCostBearer" TEXT;
