import { Prisma } from '@prisma/client';

/**
 * Persist whole-LKR delivery job fee totals into `delivery_jobs.totalDeliveryFees`
 * (integer cents in a Decimal column — same encoding as backend `lkrToDecimal`).
 */
export function lkrWholeToJobFeeDecimal(lkrWhole: number): Prisma.Decimal {
  if (!Number.isFinite(lkrWhole)) {
    throw new Error(`Invalid LKR amount: ${lkrWhole}`);
  }
  const n = Math.round(lkrWhole);
  if (!Number.isInteger(n)) {
    throw new Error(`LKR amount must be a whole number of rupees: ${lkrWhole}`);
  }
  return new Prisma.Decimal(n * 100);
}
