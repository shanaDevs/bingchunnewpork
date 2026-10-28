/**
 * Create one Bambalapitiya READY+PAID delivery order and pack it into a
 * live job so connected drivers get `newDeliveryJob`.
 *
 *   cd backend && npx ts-node --transpile-only scripts/seed-one-bambalapitiya-job.ts
 */
import { prisma } from '../src/lib/prisma';
import { generateOrderNumber } from '../src/utils/orderNumber';
import { normalizePhone } from '../src/utils/phone';
import { signToken } from '../src/middleware/auth';
import { config } from '../src/config';

const API = `http://127.0.0.1:${config.port}/api`;
const PHONE = normalizePhone('0762843595');
const NAME = 'Dinuka Gayan';

async function main() {
  const store = await prisma.store.findFirst({
    where: { name: { contains: 'Bambalapitiya' }, isActive: true },
    select: { id: true, name: true, lat: true, lng: true },
  });
  if (!store) throw new Error('Bambalapitiya store not found');

  const user = await prisma.user.findFirst({
    where: { phone: { in: [PHONE, '762843595', '+94762843595', '94762843595'] } },
    select: { id: true },
  });
  if (!user) throw new Error('Customer Dinuka Gayan not found');

  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    take: 6,
    orderBy: { name: 'asc' },
  });
  if (products.length === 0) throw new Error('No available products');
  const product = products[Math.min(2, products.length - 1)];

  const addressLine = '88 Marine Drive';
  const lat = store.lat + 0.0016;
  const lng = store.lng - 0.0021;
  let address = await prisma.address.findFirst({
    where: { userId: user.id, addressLine },
  });
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: user.id,
        label: 'Marine Drive',
        addressLine,
        city: 'Colombo',
        district: 'Colombo',
        lat,
        lng,
        isDefault: false,
      },
    });
  }

  const qty = 1;
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
      estimatedMinutes: 25,
      notes: `Ready for delivery — ${NAME}`,
      deliveryAddressLine: addressLine,
      deliveryCity: 'Colombo',
      deliveryDistrict: 'Colombo',
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
    select: { id: true, orderNumber: true },
  });

  const admin = await prisma.adminUser.findFirst({
    where: { email: 'admin@bingchunsrilanka.lk', isActive: true },
    include: { role: { select: { name: true } } },
  });
  if (!admin) throw new Error('Super admin not found');
  const token = signToken(admin.id, 'admin', admin.role.name, admin.storeId ?? undefined);

  const res = await fetch(`${API}/admin/delivery-jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      storeId: store.id,
      title: `Bambalapitiya run — ${order.orderNumber}`,
      orderIds: [order.id],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: { id?: string; title?: string; availableDriverCount?: number };
  };
  if (!res.ok || json.success === false) {
    throw new Error(`POST /admin/delivery-jobs → ${res.status} ${json.message || JSON.stringify(json)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        orderNumber: order.orderNumber,
        items: `${qty}× ${product.name}`,
        address: `${addressLine}, Colombo`,
        jobId: json.data?.id,
        title: json.data?.title,
        availableDriverCount: json.data?.availableDriverCount,
        store: store.name,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
