import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { addColumnIfMissing, runtimeSchemaPatchesAllowed, tableExists } from './schemaPatch';

let loyaltySchemaReady = false;

export async function ensureLoyaltySchema(): Promise<void> {
  if (loyaltySchemaReady) return;
  if (!runtimeSchemaPatchesAllowed()) {
    loyaltySchemaReady = true;
    return;
  }

  try {
    await addColumnIfMissing('loyalty_settings', 'referralBonusPoints', 'INT NOT NULL DEFAULT 100');
    await addColumnIfMissing('loyalty_settings', 'customerRedeemEnabled', 'BOOLEAN NOT NULL DEFAULT true');
    await addColumnIfMissing('loyalty_settings', 'checkoutRedeemEnabled', 'BOOLEAN NOT NULL DEFAULT true');
    await addColumnIfMissing('loyalty_settings', 'minPointsToRedeem', 'INTEGER NOT NULL DEFAULT 100');
    await addColumnIfMissing('loyalty_settings', 'tiersJson', 'JSON NULL');
    await addColumnIfMissing('loyalty_settings', 'redeemRewardsJson', 'JSON NULL');
    await addColumnIfMissing('loyalty_settings', 'upcomingOffersJson', 'JSON NULL');
  } catch {
    // loyalty_settings may not exist yet in some local DBs
  }

  if (!(await tableExists('loyalty_campaigns'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "loyalty_campaigns" (
        "id" TEXT NOT NULL,
        "storeId" TEXT,
        "offer1Enabled" BOOLEAN NOT NULL DEFAULT true,
        "offer1DiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
        "offer1DiscountValue" INTEGER NOT NULL DEFAULT 20,
        "offer1WebDiscountValue" INTEGER NOT NULL DEFAULT 20,
        "offer1AppDiscountValue" INTEGER NOT NULL DEFAULT 30,
        "offer1MinSubtotal" INTEGER NOT NULL DEFAULT 0,
        "offer2Enabled" BOOLEAN NOT NULL DEFAULT true,
        "offer2DiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
        "offer2DiscountValue" INTEGER NOT NULL DEFAULT 5,
        "offer2RewardType" TEXT NOT NULL DEFAULT 'GIFT',
        "offer2GiftProductId" TEXT,
        "offer2WindowDays" INTEGER NOT NULL DEFAULT 7,
        "offer2MinSubtotal" INTEGER NOT NULL DEFAULT 0,
        "offer3Enabled" BOOLEAN NOT NULL DEFAULT true,
        "offer3RequiredOrders" INTEGER NOT NULL DEFAULT 3,
        "offer3MinOrderAmount" INTEGER NOT NULL DEFAULT 1000,
        "offer3WinChanceNumerator" INTEGER NOT NULL DEFAULT 1,
        "offer3WinChanceDenominator" INTEGER NOT NULL DEFAULT 10,
        "offer3OptionAMinEach" INTEGER NOT NULL DEFAULT 1500,
        "offer3OptionBCombinedMin" INTEGER NOT NULL DEFAULT 4500,
        "offer3MatchMode" TEXT NOT NULL DEFAULT 'A_OR_B',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "startsAt" TIMESTAMP(3),
        "expiresAt" TIMESTAMP(3),
        "ownership" TEXT DEFAULT 'PLATFORM',
        "contributionSource" TEXT DEFAULT 'JASON',
        "branchSharePct" INTEGER DEFAULT 0,
        "platformSharePct" INTEGER DEFAULT 100,
        "branchShareSplits" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "loyalty_campaigns_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_campaigns_storeId_key" ON "loyalty_campaigns"("storeId")`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "loyalty_campaigns" ("id", "storeId", "ownership", "branchSharePct", "platformSharePct")
       SELECT $1, NULL, 'PLATFORM', 0, 100
       WHERE NOT EXISTS (SELECT 1 FROM "loyalty_campaigns" WHERE "storeId" IS NULL)`,
      randomUUID(),
    );
  } else {
    await addColumnIfMissing('loyalty_campaigns', 'offer1WebDiscountValue', 'INTEGER NOT NULL DEFAULT 20');
    await addColumnIfMissing('loyalty_campaigns', 'offer1AppDiscountValue', 'INTEGER NOT NULL DEFAULT 30');
    await addColumnIfMissing('loyalty_campaigns', 'offer2RewardType', "TEXT NOT NULL DEFAULT 'GIFT'");
    await addColumnIfMissing('loyalty_campaigns', 'offer2GiftProductId', 'TEXT NULL');
    await addColumnIfMissing('loyalty_campaigns', 'offer3MinOrderAmount', 'INTEGER NOT NULL DEFAULT 1000');
    await addColumnIfMissing('loyalty_campaigns', 'offer3WinChanceNumerator', 'INTEGER NOT NULL DEFAULT 1');
    await addColumnIfMissing('loyalty_campaigns', 'offer3WinChanceDenominator', 'INTEGER NOT NULL DEFAULT 10');
    await addColumnIfMissing('loyalty_campaigns', 'contributionSource', "TEXT DEFAULT 'JASON'");
    await addColumnIfMissing('loyalty_campaigns', 'branchShareSplits', 'JSONB');
  }

  loyaltySchemaReady = true;
}

export function isMissingLoyaltyCampaignTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: string }).code) : '';
  const message = err instanceof Error ? err.message : String(err);
  return code === 'P2021' || message.includes('loyalty_campaigns');
}
