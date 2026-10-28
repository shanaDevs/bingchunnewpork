/**
 * One-off: 20 online PAID Galle orders (10 delivery + 10 pickup),
 * READY, no discounts, assigned to 0788677359.
 */
import { prisma } from '../src/lib/prisma';
import { generateOrderNumber } from '../src/utils/orderNumber';
import { normalizePhone, phoneLookupVariants } from '../src/utils/phone';
import { assignTakeawayQueueSlot } from '../src/lib/takeawayQueue';

const PHONE = '0788677359';

const DELIVERY_STOPS = [
  { addressLine: 'Galle Fort Lighthouse', city: 'Galle', district: 'Galle', lat: 6.0246, lng: 80.2194 },
  { addressLine: 'Pedlar Street, Galle Fort', city: 'Galle', district: 'Galle', lat: 6.0268, lng: 80.2164 },
  { addressLine: 'Church Street, Galle Fort', city: 'Galle', district: 'Galle', lat: 6.0274, lng: 80.2178 },
  { addressLine: 'Magalle, Galle', city: 'Galle', district: 'Galle', lat: 6.0421, lng: 80.2218 },
  { addressLine: 'Kaluwella, Galle', city: 'Galle', district: 'Galle', lat: 6.0384, lng: 80.2142 },
  { addressLine: 'China Garden, Galle', city: 'Galle', district: 'Galle', lat: 6.0322, lng: 80.2118 },
  { addressLine: 'Dadalla, Galle', city: 'Galle', district: 'Galle', lat: 6.0456, lng: 80.2084 },
  { addressLine: 'Richmond Hill, Galle', city: 'Galle', district: 'Galle', lat: 6.0482, lng: 80.2156 },
  { addressLine: 'Galle Bus Stand', city: 'Galle', district: 'Galle', lat: 6.0331, lng: 80.2162 },
  { addressLine: 'Sea Street, Galle', city: 'Galle', district: 'Galle', lat: 6.0356, lng: 80.2188 },
];

async function main() {
  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: 'Bing Chun - Galle' } },
        { name: { contains: 'Bing Chun - Galle', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, deliveryEnabled: true },
  });
  if (!store) throw new Error('Bing Chun - Galle store not found');

  if (!store.deliveryEnabled) {
    await prisma.store.update({
      where: { id: store.id },
      data: { deliveryEnabled: true },
    });
  }

  const variants = phoneLookupVariants(PHONE);
  const user = await prisma.user.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, name: true, phone: true },
  });
  if (!user) throw new Error(`User not found for ${normalizePhone(PHONE)}`);

  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    take: 16,
    orderBy: { name: 'asc' },
  });
  if (products.length === 0) throw new Error('No available products');

  console.log('Store:', store.name, store.id);
  console.log('Customer:', user.name, user.phone);

  async function createOrder(opts: {
    mode: 'DELIVERY' | 'TAKEAWAY';
    productIndex: number;
    stop?: (typeof DELIVERY_STOPS)[number];
  }) {
    const product = products[opts.productIndex % products.length];
    const qty = 1;
    const unit = product.basePrice || 850;
    const subtotal = unit * qty;
    const deliveryFee = opts.mode === 'DELIVERY' ? 200 : 0;
    const total = subtotal + deliveryFee;
    const orderNumber = generateOrderNumber();

    let addressId: string | undefined;
    if (opts.mode === 'DELIVERY' && opts.stop) {
      let address = await prisma.address.findFirst({
        where: { userId: user.id, addressLine: opts.stop.addressLine },
      });
      if (!address) {
        address = await prisma.address.create({
          data: {
            userId: user.id,
            label: 'Delivery',
            addressLine: opts.stop.addressLine,
            city: opts.stop.city,
            district: opts.stop.district,
            lat: opts.stop.lat,
            lng: opts.stop.lng,
            isDefault: false,
          },
        });
      }
      addressId = address.id;
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        guestName: user.name,
        guestPhone: user.phone,
        storeId: store.id,
        addressId,
        orderMode: opts.mode,
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
        estimatedMinutes: opts.mode === 'DELIVERY' ? 30 : 15,
        notes: opts.mode === 'DELIVERY' ? `Ready for delivery — ${user.name}` : `Ready for pickup — ${user.name}`,
        pickupTime: opts.mode === 'TAKEAWAY' ? 'As soon as ready' : null,
        deliveryAddressLine: opts.stop?.addressLine ?? null,
        deliveryCity: opts.stop?.city ?? null,
        deliveryDistrict: opts.stop?.district ?? null,
        deliveryLat: opts.stop?.lat ?? null,
        deliveryLng: opts.stop?.lng ?? null,
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
            { status: 'READY', note: opts.mode === 'DELIVERY' ? 'Ready for rider' : 'Ready for pickup' },
          ],
        },
      },
      select: { id: true, orderNumber: true },
    });

    if (opts.mode === 'TAKEAWAY') {
      const slot = await assignTakeawayQueueSlot(store.id, order.id);
      console.log(`${order.orderNumber}  PICKUP token ${slot.queuePosition}  1× ${product.name}`);
    } else {
      console.log(`${order.orderNumber}  DELIVERY  1× ${product.name}  →  ${opts.stop?.addressLine}`);
    }
  }

  for (let i = 0; i < DELIVERY_STOPS.length; i++) {
    await createOrder({ mode: 'DELIVERY', productIndex: i, stop: DELIVERY_STOPS[i] });
  }
  for (let i = 0; i < 10; i++) {
    await createOrder({ mode: 'TAKEAWAY', productIndex: i + 6 });
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
