/**
 * Five Nugegoda DELIVERY orders left READY + PAID so they appear in the
 * delivery ready pool. They are not packed into a job.
 *
 *   cd backend && npx tsx scripts/seed-dart-ready-orders.ts
 */
import { prisma } from '../src/lib/prisma';
import { assertDevSeedOnly } from '../src/scripts/seedGuard';
import { generateOrderNumber } from '../src/utils/orderNumber';
import { normalizePhone, phoneLookupVariants } from '../src/utils/phone';

const NOTE = 'Seed dart ready';
const PHONE = normalizePhone('0771000199');
const NAME = 'Dart Seed';

const STOPS = [
  { label: 'Station Road', addressLine: '45 Station Road', city: 'Nugegoda', district: 'Colombo', dLat: -0.0028, dLng: 0.0012 },
  { label: 'Kirillapone', addressLine: '12 Kirillapone Ave', city: 'Nugegoda', district: 'Colombo', dLat: 0.0016, dLng: 0.0034 },
  { label: 'High Level', addressLine: '88 High Level Road', city: 'Nugegoda', district: 'Colombo', dLat: -0.0041, dLng: 0.0046 },
  { label: 'Kohuwala', addressLine: '3 Samagi Mawatha', city: 'Kohuwala', district: 'Colombo', dLat: 0.0024, dLng: 0.0021 },
  { label: 'Dehiwala Road', addressLine: '22 Dehiwala Rd', city: 'Nugegoda', district: 'Colombo', dLat: -0.0015, dLng: -0.0022 },
] as const;

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

async function main() {
  assertDevSeedOnly();

  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: 'Bing Chun - Nugegoda' } },
        { name: { contains: 'Nugegoda', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, lat: true, lng: true, deliveryEnabled: true },
  });
  if (!store) throw new Error('Bing Chun - Nugegoda store not found');

  if (!store.deliveryEnabled) {
    await prisma.store.update({
      where: { id: store.id },
      data: { deliveryEnabled: true },
    });
  }

  const already = await prisma.order.count({
    where: {
      storeId: store.id,
      notes: { startsWith: NOTE },
      createdAt: { gte: startOfToday() },
    },
  });
  if (already > 0) {
    const existing = await prisma.order.findMany({
      where: {
        storeId: store.id,
        notes: { startsWith: NOTE },
        createdAt: { gte: startOfToday() },
      },
      select: { orderNumber: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Store: ${store.name}`);
    console.log(`Already seeded ${existing.length} ready order(s) today:`);
    for (const row of existing) console.log(`${row.orderNumber}  ${row.status}`);
    return;
  }

  let user = await prisma.user.findFirst({
    where: { phone: { in: phoneLookupVariants(PHONE) } },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: NAME,
        phone: PHONE,
        isPhoneVerified: true,
      },
    });
    console.log('Created customer', user.id);
  } else {
    console.log('Using existing customer', user.id, user.name, user.phone);
  }

  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    take: STOPS.length,
    orderBy: { name: 'asc' },
  });
  if (products.length === 0) throw new Error('No available products');

  const created: Array<{ orderNumber: string; items: string; address: string }> = [];

  for (let i = 0; i < STOPS.length; i++) {
    const stop = STOPS[i];
    const lat = store.lat + stop.dLat;
    const lng = store.lng + stop.dLng;

    let address = await prisma.address.findFirst({
      where: { userId: user.id, addressLine: stop.addressLine },
    });
    if (!address) {
      address = await prisma.address.create({
        data: {
          userId: user.id,
          label: stop.label,
          addressLine: stop.addressLine,
          city: stop.city,
          district: stop.district,
          lat,
          lng,
          isDefault: i === 0,
        },
      });
    }

    const product = products[i % products.length];
    const qty = 1;
    const unit = product.basePrice || 850;
    const subtotal = unit * qty;
    const deliveryFee = 200;
    const total = subtotal + deliveryFee;

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        guestName: user.name || NAME,
        guestPhone: user.phone || PHONE,
        storeId: store.id,
        addressId: address.id,
        orderMode: 'DELIVERY',
        status: 'READY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        prepaidAmount: total,
        subtotal,
        deliveryFee,
        convenientFee: 0,
        discount: 0,
        loyaltyDiscount: 0,
        total,
        estimatedMinutes: 25,
        notes: `${NOTE} — ${stop.label}`,
        deliveryAddressLine: stop.addressLine,
        deliveryCity: stop.city,
        deliveryDistrict: stop.district,
        deliveryLat: lat,
        deliveryLng: lng,
        channel: 'APP',
        items: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              size: 'REGULAR',
              quantity: qty,
              unitPrice: unit,
              totalPrice: subtotal,
            },
          ],
        },
        statusEvents: {
          create: [
            { status: 'RECEIVED', note: 'Placed' },
            { status: 'PREPARING', note: 'Kitchen' },
            { status: 'READY', note: 'Ready for rider' },
          ],
        },
      },
      select: { orderNumber: true },
    });

    created.push({
      orderNumber: order.orderNumber,
      items: `1× ${product.name}`,
      address: `${stop.addressLine}, ${stop.city}`,
    });
  }

  console.log(`Store: ${store.name}`);
  for (const row of created) {
    console.log(`${row.orderNumber}  READY  ${row.items}  →  ${row.address}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
