/**
 * Create two Bambalapitiya DELIVERY orders in READY + PAID so they appear
 * in the admin delivery-ready pool for customer Dinuka Gayan (0762843595).
 *
 *   cd backend && npx tsx scripts/seed-dinuka-gayan-ready-orders.ts
 */
import { prisma } from '../src/lib/prisma';
import { generateOrderNumber } from '../src/utils/orderNumber';
import { normalizePhone } from '../src/utils/phone';

const PHONE = normalizePhone('0762843595');
const NAME = 'Dinuka Gayan';

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: 'Bambalapitiya' }, isActive: true },
    select: { id: true, name: true, lat: true, lng: true, deliveryEnabled: true },
  });
  if (!store) throw new Error('Bing Chun - Bambalapitiya store not found');

  let user = await prisma.user.findFirst({
    where: { phone: { in: [PHONE, '762843595', '+94762843595', '94762843595'] } },
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
  } else if (user.name !== NAME) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: NAME },
    });
    console.log('Updated customer name', user.id);
  } else {
    console.log('Using existing customer', user.id, user.name, user.phone);
  }

  const stops = [
    {
      label: 'Home',
      addressLine: '45 Galle Road',
      city: 'Colombo',
      district: 'Colombo',
      lat: store.lat + 0.0035,
      lng: store.lng + 0.0018,
      productOffset: 0,
    },
    {
      label: 'Office',
      addressLine: '120 Duplication Road',
      city: 'Colombo',
      district: 'Colombo',
      lat: store.lat - 0.0028,
      lng: store.lng + 0.0024,
      productOffset: 1,
    },
  ];

  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    take: 4,
    orderBy: { name: 'asc' },
  });
  if (products.length === 0) throw new Error('No available products');

  const created: Array<{ orderNumber: string; address: string; items: string }> = [];

  for (const stop of stops) {
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
          lat: stop.lat,
          lng: stop.lng,
          isDefault: stop.label === 'Home',
        },
      });
    }

    const product = products[stop.productOffset % products.length];
    const qty = stop.label === 'Home' ? 2 : 1;
    const unit = product.basePrice || 850;
    const subtotal = unit * qty;
    const deliveryFee = 200;
    const total = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        guestName: NAME,
        guestPhone: PHONE,
        storeId: store.id,
        addressId: address.id,
        orderMode: 'DELIVERY',
        status: 'READY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        prepaidAmount: total,
        subtotal,
        deliveryFee,
        total,
        estimatedMinutes: 30,
        notes: `Ready for delivery — ${NAME}`,
        deliveryAddressLine: stop.addressLine,
        deliveryCity: stop.city,
        deliveryDistrict: stop.district,
        deliveryLat: stop.lat,
        deliveryLng: stop.lng,
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
      address: `${stop.addressLine}, ${stop.city}`,
      items: `${qty}× ${product.name}`,
    });
  }

  console.log('Store:', store.name, store.id);
  console.log('Customer:', NAME, PHONE);
  for (const row of created) {
    console.log(`${row.orderNumber}  ${row.items}  →  ${row.address}`);
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
