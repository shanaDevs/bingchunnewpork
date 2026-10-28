/**
 * backfill-partial-refund-amounts.ts
 *
 * Backfills RECEIVED partial refunds missing status-based percentage/amount.
 *
 * Run: npm run backfill:partial-refund-amounts -w @bingchun/backend
 */

import { PrismaClient } from '@prisma/client';
import { enrichRefundForDisplay } from '../lib/enrichRefundForDisplay';
import { isFullRefundScenario } from '../lib/refundPaymentStructure';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function main() {
  console.log('Starting partial refund amount backfill...\n');

  const refunds = await prisma.refund.findMany({
    where: {
      status: 'RECEIVED',
      OR: [
        { refundPercentage: null },
        { refundAmount: null },
        { salesTotal: 0 },
      ],
    },
    include: {
      order: {
        select: {
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          statusEvents: {
            orderBy: { createdAt: 'asc' },
            select: { status: true, createdAt: true },
          },
        },
      },
    },
  });

  console.log(`Found ${refunds.length} refund(s) to inspect\n`);

  let updated = 0;
  let skipped = 0;

  for (const refund of refunds) {
    if (isFullRefundScenario(refund)) {
      skipped += 1;
      continue;
    }

    const beforePct = refund.refundPercentage;
    const beforeAmt = refund.refundAmount;

    const enriched = await enrichRefundForDisplay(refund);

    if (
      enriched.refundPercentage == null
      || enriched.refundAmount == null
    ) {
      console.log(`  skip ${refund.id}: could not derive status or percentage`);
      skipped += 1;
      continue;
    }

    if (
      beforePct === enriched.refundPercentage
      && beforeAmt === enriched.refundAmount
      && refund.salesTotal === enriched.salesTotal
    ) {
      skipped += 1;
      continue;
    }

    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        salesTotal: enriched.salesTotal,
        cancelledAtStatus: enriched.cancelledAtStatus ?? undefined,
        configuredStatusRefundPercentage: enriched.configuredStatusRefundPercentage ?? undefined,
        refundPercentage: enriched.refundPercentage,
        refundAmount: enriched.refundAmount,
      },
    });

    updated += 1;
    console.log(
      `  updated ${refund.id}: ${enriched.refundPercentage}% -> LKR ${enriched.refundAmount}`,
    );
  }

  console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
