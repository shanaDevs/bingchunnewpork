/**
 * Recompute delivery_jobs.totalDeliveryFees for COMPLETED / VEHICLE_FAILURE runs
 * using current rider credit rules (delivered stops, customer-side failures, mid-ride cancels).
 *
 *   npx ts-node backend/scripts/backfill-delivery-job-fees.ts --dry-run
 *   npx ts-node backend/scripts/backfill-delivery-job-fees.ts
 */
import { prisma, connectDb, disconnectDb } from '@bingchun/db';
import {
  creditedDeliveredTotals,
  groupLatestFailedAttemptsByJob,
} from '@bingchun/delivery-domain';
import { decimalFieldToLkrNumber, lkrToDecimal, parseDecimalFromDb } from '../src/lib/moneyDecimal';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await connectDb();

  const jobs = await prisma.deliveryJob.findMany({
    where: { status: { in: ['COMPLETED', 'VEHICLE_FAILURE'] } },
    select: {
      id: true,
      status: true,
      totalDeliveryFees: true,
      jobOrders: {
        select: {
          orderId: true,
          order: {
            select: { status: true, deliveryFee: true, cancelledAtStatus: true },
          },
        },
      },
    },
  });

  const failedAttempts =
    jobs.length === 0
      ? []
      : await prisma.deliveryAttempt.findMany({
          where: {
            jobId: { in: jobs.map((j) => j.id) },
            outcome: { not: 'DELIVERED' },
          },
          select: {
            jobId: true,
            orderId: true,
            outcome: true,
            note: true,
            attemptNo: true,
            createdAt: true,
          },
          orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }],
        });
  const latestFailedByJob = groupLatestFailedAttemptsByJob(failedAttempts);

  let updated = 0;
  let skipped = 0;

  for (const job of jobs) {
    const failedByOrder = latestFailedByJob.get(job.id) ?? new Map();
    const creditedLinks = job.jobOrders.map((jo) => ({
      orderId: jo.orderId,
      order: {
        status: jo.order.status,
        deliveryFee: jo.order.deliveryFee,
        cancelledAtStatus: jo.order.cancelledAtStatus ?? null,
      },
    }));
    const { deliveredTotal } = creditedDeliveredTotals(creditedLinks, failedByOrder);
    const expected = lkrToDecimal(deliveredTotal);
    const stored = job.totalDeliveryFees;
    const storedLkr =
      stored != null ? Math.round(decimalFieldToLkrNumber(parseDecimalFromDb(stored))) : null;
    const expectedLkr = deliveredTotal;

    if (stored != null && stored.toFixed(0) === expected.toFixed(0)) {
      skipped += 1;
      continue;
    }

    if (storedLkr === expectedLkr && stored != null) {
      skipped += 1;
      continue;
    }

    console.log(
      `${dryRun ? '[dry-run] ' : ''}job ${job.id}: stored≈${storedLkr ?? 'null'} LKR → ${expectedLkr} LKR (${expected.toFixed(0)} cents)`,
    );
    if (!dryRun) {
      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: { totalDeliveryFees: expected },
      });
    }
    updated += 1;
  }

  console.log(`Done. ${updated} to update, ${skipped} already correct.`);
  await disconnectDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
