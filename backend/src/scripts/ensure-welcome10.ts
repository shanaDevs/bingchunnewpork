/**
 * Ensure WELCOME10 is configured as a first-order auto-apply promo.
 */
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const result = await prisma.promoCode.updateMany({
    where: { code: 'WELCOME10' },
    data: {
      promotionKind: 'WELCOME',
      title: 'First Order — 10% Off',
      description: '10% off your first order',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      isActive: true,
      usageLimits: { maxPerCustomer: 1 },
    },
  });

  if (result.count === 0) {
    await prisma.promoCode.create({
      data: {
        code: 'WELCOME10',
        title: 'First Order — 10% Off',
        description: '10% off your first order',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderValue: 500,
        maxUses: 1000,
        promotionKind: 'WELCOME',
        usageLimits: { maxPerCustomer: 1 },
        isActive: true,
      },
    });
    console.log('Created WELCOME10');
  } else {
    console.log(`Updated WELCOME10 (${result.count})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
