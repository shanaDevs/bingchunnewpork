import { prisma } from './prisma';
import { logger } from '../utils/logger';
import {
  addColumnIfMissing,
  columnUdtName,
  createIndexIfMissing,
  ensureEnumTypeIfMissing,
  tableExists,
  tableHasConstraint,
} from './schemaPatch';
import { deliverySchemaTableSql, getDeliveryPayoutsSqlRef, primeDeliverySqlRefs } from './deliveryPg';

let deliveryPayoutSchemaReady = false;

async function ensureDeliveryPayoutEnumTypes(): Promise<void> {
  await ensureEnumTypeIfMissing('WithdrawalStatus', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
  await ensureEnumTypeIfMissing('SettlementPaymentMethod', [
    'BANK_TRANSFER',
    'CASH',
    'CHECK',
    'ONLINE',
  ]);
}

async function ensureDeliveryPayoutEnumColumns(): Promise<void> {
  await ensureDeliveryPayoutEnumTypes();

  if (!(await tableExists('delivery_payouts'))) return;

  await dropOpenPeriodExclusionIfPresent();

  const table = getDeliveryPayoutsSqlRef();

  const statusUdt = await columnUdtName('delivery_payouts', 'status');
  if (statusUdt === 'text') {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN "status" DROP DEFAULT`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table} ALTER COLUMN "status" TYPE "WithdrawalStatus" USING "status"::"WithdrawalStatus"`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table} ALTER COLUMN "status" SET DEFAULT 'PENDING'::"WithdrawalStatus"`,
    );
  }

  const paymentUdt = await columnUdtName('delivery_payouts', 'paymentMethod');
  if (paymentUdt === 'text') {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table} ALTER COLUMN "paymentMethod" TYPE "SettlementPaymentMethod" USING "paymentMethod"::"SettlementPaymentMethod"`,
    );
  }
}

async function ensureAmountIsNumeric(): Promise<void> {
  const udt = await columnUdtName('delivery_payouts', 'amount');
  if (udt && udt !== 'numeric') {
    const table = getDeliveryPayoutsSqlRef();
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table} ALTER COLUMN "amount" TYPE NUMERIC(20,4) USING "amount"::numeric`,
    );
  }
}

/**
 * periodFrom/periodTo are TIMESTAMP(3) without time zone, so the range must be
 * tsrange — tstzrange would need a TimeZone-dependent cast, which Postgres
 * rejects in an index/constraint expression (not IMMUTABLE).
 */
async function dropOpenPeriodExclusionIfPresent(): Promise<void> {
  if (!(await tableExists('delivery_payouts'))) return;
  const table = getDeliveryPayoutsSqlRef();
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "delivery_payouts_open_period_excl"`,
  );
}

async function ensureOpenPeriodExclusion(): Promise<void> {
  if (await tableHasConstraint('delivery_payouts', 'delivery_payouts_open_period_excl')) return;
  const table = getDeliveryPayoutsSqlRef();
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ${table}
      ADD CONSTRAINT "delivery_payouts_open_period_excl"
      EXCLUDE USING gist (
        tsrange("periodFrom", "periodTo", '[]') WITH &&
      )
      WHERE (status IN ('PENDING'::"WithdrawalStatus", 'APPROVED'::"WithdrawalStatus"))
    `);
  } catch (err) {
    logger.warn('Could not add delivery_payouts overlapping-period exclusion', err);
  }
}

async function shrinkDeliveryWalletPermissionFlags(): Promise<void> {
  const deliveryAdmins = await prisma.adminUser.findMany({
    where: { role: { name: 'DELIVERY_ADMIN' } },
    select: { id: true },
  });
  if (deliveryAdmins.length === 0) return;
  await prisma.permission.updateMany({
    where: {
      menu: 'DELIVERY_WALLET',
      adminUserId: { in: deliveryAdmins.map((row) => row.id) },
    },
    data: { canCreate: false, canUpdate: false, canDelete: false },
  });
}

export async function ensureDeliveryPayoutSchema(): Promise<void> {
  if (deliveryPayoutSchemaReady) return;

  await primeDeliverySqlRefs();
  await ensureDeliveryPayoutEnumTypes();

  if (!(await tableExists('delivery_payouts'))) {
    const createTarget = deliverySchemaTableSql('delivery_payouts');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${createTarget} (
        "id" TEXT NOT NULL,
        "amount" NUMERIC(20,4) NOT NULL,
        "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
        "remarks" TEXT,
        "periodFrom" TIMESTAMP(3) NOT NULL,
        "periodTo" TIMESTAMP(3) NOT NULL,
        "requestedById" TEXT NOT NULL,
        "breakdown" JSONB,
        "rejectionReason" TEXT,
        "paymentMethod" "SettlementPaymentMethod",
        "proofUrl" TEXT,
        "checkNumber" TEXT,
        "checkDate" TIMESTAMP(3),
        "reviewedById" TEXT,
        "reviewedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "delivery_payouts_pkey" PRIMARY KEY ("id")
      )
    `);
  }

  await ensureDeliveryPayoutEnumColumns();

  await addColumnIfMissing('delivery_payouts', 'rejectionReason', 'TEXT');
  await addColumnIfMissing('delivery_payouts', 'paymentMethod', '"SettlementPaymentMethod"');
  await addColumnIfMissing('delivery_payouts', 'proofUrl', 'TEXT');
  await addColumnIfMissing('delivery_payouts', 'checkNumber', 'TEXT');
  await addColumnIfMissing('delivery_payouts', 'checkDate', 'TIMESTAMP(3)');
  await addColumnIfMissing('delivery_payouts', 'reviewedById', 'TEXT');
  await addColumnIfMissing('delivery_payouts', 'reviewedAt', 'TIMESTAMP(3)');
  await ensureAmountIsNumeric();

  await createIndexIfMissing('delivery_payouts', 'delivery_payouts_createdAt_idx', 'createdAt');
  await createIndexIfMissing('delivery_payouts', 'delivery_payouts_status_idx', 'status');
  await createIndexIfMissing('delivery_payouts', 'delivery_payouts_periodTo_idx', 'periodTo');
  await dropOpenPeriodExclusionIfPresent();
  await ensureOpenPeriodExclusion();
  await shrinkDeliveryWalletPermissionFlags();

  await primeDeliverySqlRefs();
  deliveryPayoutSchemaReady = true;
}
