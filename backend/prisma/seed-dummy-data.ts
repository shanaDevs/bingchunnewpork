/**
 * seed-dummy-data.ts
 *
 * Generates large-scale dummy/test data for every table in the Bing Chun DB.
 *
 * Run with:
 *   npx ts-node --transpile-only prisma/seed-dummy-data.ts
 *
 * Prerequisites: run the main seed first (prisma/seed.ts) so stores, products,
 * categories and toppings already exist.
 *
 * What it creates:
 *   - 150 customers (users) with addresses
 *   - 100+ orders per branch, split ~50/50 between app (platform=1) and web (platform=0)
 *   - Order items & order item toppings for every order
 *   - Order status events for each order
 *   - Loyalty transactions for users
 *   - Customer notifications
 *   - Admin notifications (per store manager)
 *   - Promo codes (extra)
 *   - Delivery jobs with job orders
 *   - Store wallets & wallet transactions
 */

import { PrismaClient, OrderMode, OrderStatus, PaymentMethod, PaymentStatus, ProductSize } from '@prisma/client';
import crypto from 'crypto';
import { assertDevSeedOnly } from '../src/scripts/seedGuard';

assertDevSeedOnly();

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function randomDate(daysBack: number): Date {
  const now = Date.now();
  const past = now - daysBack * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

function padNum(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

// Sri Lankan first & last names for realistic data
const FIRST_NAMES = [
  'Kamal', 'Nimal', 'Sunil', 'Chamara', 'Dilshan', 'Ruwani', 'Sachini', 'Tharushi',
  'Kavinda', 'Nimesh', 'Sanduni', 'Malsha', 'Lahiru', 'Dinesh', 'Ishara', 'Pooja',
  'Ravindu', 'Hasini', 'Nadeesha', 'Sampath', 'Thilini', 'Sahan', 'Amaya', 'Chathura',
  'Dulani', 'Eshan', 'Fathima', 'Gayan', 'Hiruni', 'Janith', 'Kasun', 'Lakshan',
  'Manisha', 'Nuwan', 'Oshadhi', 'Pasindu', 'Rashmi', 'Sithara', 'Tharindu', 'Udara',
  'Vishwa', 'Waruni', 'Yasas', 'Amali', 'Buddhi', 'Chamodi', 'Dasun', 'Erandi',
];

const LAST_NAMES = [
  'Perera', 'Silva', 'Fernando', 'Jayawardena', 'Wickramasinghe', 'Bandara', 'Rathnayake',
  'Dissanayake', 'Gunasekara', 'Senanayake', 'Karunaratne', 'Amarasinghe', 'Weerasinghe',
  'Rajapakse', 'Samaraweera', 'Tennakoon', 'Wijesinghe', 'Herath', 'Pathirana', 'De Zoysa',
];

const CITIES = [
  'Colombo', 'Nugegoda', 'Dehiwala', 'Mount Lavinia', 'Rathmalana', 'Battaramulla',
  'Kohuwala', 'Pannipitiya', 'Piliyandala', 'Kelaniya', 'Wattala', 'Ja-Ela',
  'Gampaha', 'Negombo', 'Kandy', 'Matara', 'Galle', 'Kurunegala', 'Panadura', 'Kalutara',
];

const DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Kurunegala', 'Matara', 'Galle',
];

const STREET_NAMES = [
  'Galle Road', 'Havelock Road', 'High Level Road', 'Duplication Road', 'Main Street',
  'Park Road', 'Temple Road', 'Lake Road', 'Station Road', 'School Lane',
  'Hospital Road', 'Market Street', 'Church Road', 'Garden Lane', 'Flower Road',
];

const ORDER_NOTES = [
  'Less ice please', 'Extra sugar', 'No sugar please', 'Add extra boba',
  'Please deliver to the gate', 'Ring the doorbell twice', 'Leave at the door',
  'Call before delivery', null, null, null, null, // nulls for variety
];

const ORDER_STATUSES: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const ORDER_MODES: OrderMode[] = ['DELIVERY', 'TAKEAWAY'];
const PRODUCT_SIZES: ProductSize[] = ['REGULAR', 'LARGE'];

// ─── Main seed function ──────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting massive dummy data seeder...\n');

  // ── 0. Clean up old dummy/test data ─────────────────────────────────────
  console.log('🧹 Cleaning up old dummy/test data...');
  try {
    await prisma.commissionSettlement.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.deliveryJobOrder.deleteMany();
    await prisma.deliveryJob.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.adminNotification.deleteMany();
    await prisma.customerNotification.deleteMany();
    await prisma.loyaltyTransaction.deleteMany();
    await prisma.orderStatusEvent.deleteMany();
    await prisma.orderItemTopping.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.address.deleteMany({ where: { user: { email: { contains: '@bingchun-test.lk' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@bingchun-test.lk' } } });
    console.log('  ✅ Cleanup complete!');
  } catch (e) {
    console.log('  ⚠️ Warning during cleanup:', e.message);
  }

  // ── 1. Load existing reference data ─────────────────────────────────────
  const stores = await prisma.store.findMany();
  const products = await prisma.product.findMany({ include: { toppings: { include: { topping: true } } } });
  const toppings = await prisma.topping.findMany();
  const adminUsers = await prisma.adminUser.findMany();

  if (stores.length === 0 || products.length === 0) {
    console.error('❌ No stores or products found. Run the main seed first: npm run prisma:seed');
    process.exit(1);
  }

  console.log(`📍 Found ${stores.length} stores, ${products.length} products, ${toppings.length} toppings`);

  // ── 2. Create 150 dummy customers (users) ──────────────────────────────
  console.log('\n👥 Creating 150 customers...');
  const userIds: string[] = [];
  const userBatch: any[] = [];

  for (let i = 0; i < 150; i++) {
    const id = uuid();
    const firstName = randomPick(FIRST_NAMES);
    const lastName = randomPick(LAST_NAMES);
    userBatch.push({
      id,
      name: `${firstName} ${lastName}`,
      email: `test.user${i + 1}@bingchun-test.lk`,
      phone: `077${padNum(1000000 + i, 7)}`,
      passwordHash: '$2a$12$dummyHashForTestingOnlyXXXXXXXXXXXXXXXXXXXXXXXXXX',
      isEmailVerified: Math.random() > 0.3,
      isPhoneVerified: true,
      loyaltyPoints: randomInt(0, 5000),
      createdAt: randomDate(180),
    });
    userIds.push(id);
  }

  // Use createMany to batch insert (skip duplicates)
  await prisma.user.createMany({ data: userBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${userBatch.length} users`);

  // ── 3. Create 2–3 addresses per user ───────────────────────────────────
  console.log('\n🏠 Creating addresses...');
  const addressBatch: any[] = [];
  const addressMap: Record<string, string[]> = {}; // userId -> addressIds

  for (const userId of userIds) {
    const numAddresses = randomInt(1, 3);
    addressMap[userId] = [];
    for (let a = 0; a < numAddresses; a++) {
      const addrId = uuid();
      const city = randomPick(CITIES);
      addressBatch.push({
        id: addrId,
        userId,
        label: a === 0 ? 'Home' : a === 1 ? 'Office' : 'Other',
        addressLine: `${randomInt(1, 500)} ${randomPick(STREET_NAMES)}`,
        city,
        district: randomPick(DISTRICTS),
        lat: 6.7 + Math.random() * 0.5,
        lng: 79.8 + Math.random() * 0.3,
        isDefault: a === 0,
        createdAt: randomDate(150),
      });
      addressMap[userId].push(addrId);
    }
  }

  await prisma.address.createMany({ data: addressBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${addressBatch.length} addresses`);

  // ── 4. Create extra promo codes ────────────────────────────────────────
  console.log('\n🎟️  Creating extra promo codes...');
  const promoCodes = [
    { code: 'SUMMER25', description: '25% off summer specials', discountType: 'PERCENTAGE', discountValue: 25, minOrderValue: 500, maxUses: 500, isActive: true },
    { code: 'BOBA100', description: 'LKR 100 off on Boba orders', discountType: 'FIXED', discountValue: 100, minOrderValue: 600, maxUses: 300, isActive: true },
    { code: 'NEWAPP20', description: '20% off for new app users', discountType: 'PERCENTAGE', discountValue: 20, minOrderValue: 400, maxUses: 1000, isActive: true },
    { code: 'FREEDELIVERY', description: 'Free delivery on orders above 1000', discountType: 'FIXED', discountValue: 150, minOrderValue: 1000, maxUses: 200, isActive: true },
    { code: 'WEEKEND15', description: '15% off weekend orders', discountType: 'PERCENTAGE', discountValue: 15, minOrderValue: 300, maxUses: 500, isActive: true },
    { code: 'LOYALTY200', description: 'LKR 200 off for loyalty members', discountType: 'FIXED', discountValue: 200, minOrderValue: 800, maxUses: 100, isActive: true },
    { code: 'BIRTHDAY30', description: '30% off birthday orders', discountType: 'PERCENTAGE', discountValue: 30, minOrderValue: 500, maxUses: 500, isActive: true },
    { code: 'EXPIRED10', description: 'Expired 10% promo', discountType: 'PERCENTAGE', discountValue: 10, minOrderValue: 200, maxUses: 100, isActive: false, expiresAt: new Date('2025-12-31') },
  ];

  for (const promo of promoCodes) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: {},
      create: promo,
    });
  }
  console.log(`  ✅ Created ${promoCodes.length} extra promo codes`);

  // ── 5. Create orders: 100+ per store, split by platform ────────────────
  console.log('\n📦 Creating orders (100+ per store, split app/web)...');
  let totalOrders = 0;
  let orderCounter = 1000; // global order number counter
  const allOrderIds: string[] = [];
  const storeOrderMap: Record<string, string[]> = {}; // storeId -> orderIds

  // Preload delivery zones per store
  const deliveryZones = await prisma.deliveryZone.findMany();
  const storeZoneMap: Record<string, typeof deliveryZones> = {};
  for (const zone of deliveryZones) {
    if (zone.storeId) {
      if (!storeZoneMap[zone.storeId]) storeZoneMap[zone.storeId] = [];
      storeZoneMap[zone.storeId].push(zone);
    }
  }

  for (const store of stores) {
    const ordersForThisStore = randomInt(100, 130); // 100-130 orders per branch
    storeOrderMap[store.id] = [];

    // Split roughly 50/50 between app (platform=1) and web (platform=0)
    const appOrderCount = Math.floor(ordersForThisStore * 0.5);
    const webOrderCount = ordersForThisStore - appOrderCount;

    const orderBatch: any[] = [];
    const orderItemBatch: any[] = [];
    const orderItemToppingBatch: any[] = [];
    const statusEventBatch: any[] = [];

    for (let i = 0; i < ordersForThisStore; i++) {
      const orderId = uuid();
      orderCounter++;
      const isApp = i < appOrderCount; // first half app, second half web
      const platform = isApp ? 1 : 0;

      const userId = randomPick(userIds);
      const orderMode = randomPick(ORDER_MODES);
      const createdAt = randomDate(90); // orders from last 90 days

      // Determine order status with realistic distribution
      let status: OrderStatus;
      const statusRoll = Math.random();
      if (statusRoll < 0.45) status = 'DELIVERED';
      else if (statusRoll < 0.60) status = 'PREPARING';
      else if (statusRoll < 0.72) status = 'READY';
      else if (statusRoll < 0.82) status = 'OUT_FOR_DELIVERY';
      else if (statusRoll < 0.92) status = 'RECEIVED';
      else status = 'CANCELLED';

      // Payment method distribution
      let paymentMethod: PaymentMethod;
      if (isApp) {
        const pmRoll = Math.random();
        if (pmRoll < 0.40) paymentMethod = 'PAYHERE';
        else if (pmRoll < 0.75) paymentMethod = 'CARD';
        else paymentMethod = 'LOYALTY_POINTS';
      } else {
        const pmRoll = Math.random();
        if (pmRoll < 0.35) paymentMethod = 'CARD';
        else if (pmRoll < 0.65) paymentMethod = 'PAYHERE';
        else paymentMethod = 'CASH_AT_COUNTER';
      }
      if (orderMode === 'DELIVERY' && paymentMethod === 'CASH_AT_COUNTER') {
        paymentMethod = 'PAYHERE';
      }

      const paymentStatus: PaymentStatus = status === 'CANCELLED' ? 'REFUNDED'
        : paymentMethod === 'CASH_AT_COUNTER'
          ? (status === 'DELIVERED' ? 'PAID' : 'PENDING')
          : 'PAID';

      // Generate 1-5 order items
      const numItems = randomInt(1, 5);
      let subtotal = 0;
      const orderItems: any[] = [];

      for (let j = 0; j < numItems; j++) {
        const product = randomPick(products);
        const size = randomPick(PRODUCT_SIZES);
        const quantity = randomInt(1, 3);
        const sizeMultiplier = size === 'LARGE' ? 1.3 : 1;
        const unitPrice = Math.round(product.basePrice * sizeMultiplier);
        const totalPrice = unitPrice * quantity;
        subtotal += totalPrice;

        const orderItemId = uuid();
        orderItems.push({
          id: orderItemId,
          orderId,
          productId: product.id,
          productName: product.name,
          size,
          quantity,
          unitPrice,
          totalPrice,
        });

        // Add toppings to some order items (30% chance)
        if (product.toppings.length > 0 && Math.random() < 0.3) {
          const numToppings = randomInt(1, Math.min(2, product.toppings.length));
          const selectedToppings = [...product.toppings].sort(() => Math.random() - 0.5).slice(0, numToppings);
          for (const pt of selectedToppings) {
            orderItemToppingBatch.push({
              orderItemId,
              toppingId: pt.toppingId,
              toppingName: pt.topping.name,
              extraPrice: pt.topping.extraPrice,
            });
            subtotal += pt.topping.extraPrice * quantity;
          }
        }
      }

      orderItemBatch.push(...orderItems);

      const deliveryFee = orderMode === 'DELIVERY' ? randomPick([150, 300]) : 0;
      const convenientFee = Math.round(subtotal * 0.065);
      const discount = Math.random() < 0.2 ? randomInt(50, 200) : 0;
      const total = subtotal + deliveryFee + convenientFee - discount;

      const userAddresses = addressMap[userId] || [];
      const addressId = orderMode === 'DELIVERY' && userAddresses.length > 0 ? randomPick(userAddresses) : null;
      const storeZones = storeZoneMap[store.id] || [];
      const deliveryZoneId = orderMode === 'DELIVERY' && storeZones.length > 0 ? randomPick(storeZones).id : null;

      const orderNumber = `BC-${padNum(orderCounter, 6)}`;

      orderBatch.push({
        id: orderId,
        orderNumber,
        userId,
        storeId: store.id,
        deliveryZoneId,
        addressId,
        orderMode,
        status,
        paymentMethod,
        paymentStatus,
        paymentRef: paymentStatus === 'PAID' ? `PAY-${uuid().slice(0, 8).toUpperCase()}` : null,
        subtotal,
        deliveryFee,
        convenientFee,
        discount,
        loyaltyDiscount: 0,
        total,
        prepaidAmount: paymentStatus === 'PAID' && paymentMethod !== 'CASH_AT_COUNTER' ? total : 0,
        promoCode: discount > 0 ? randomPick(['WELCOME10', 'BINGCHUN50', 'SUMMER25', 'BOBA100', 'NEWAPP20']) : null,
        pickupTime: orderMode === 'TAKEAWAY' ? `${randomInt(10, 22)}:${randomPick(['00', '15', '30', '45'])}` : null,
        estimatedMinutes: randomInt(15, 45),
        notes: randomPick(ORDER_NOTES),
        deliveryAddressLine: orderMode === 'DELIVERY' ? `${randomInt(1, 500)} ${randomPick(STREET_NAMES)}` : null,
        deliveryCity: orderMode === 'DELIVERY' ? randomPick(CITIES) : null,
        deliveryDistrict: orderMode === 'DELIVERY' ? randomPick(DISTRICTS) : null,
        deliveryLat: orderMode === 'DELIVERY' ? 6.7 + Math.random() * 0.5 : null,
        deliveryLng: orderMode === 'DELIVERY' ? 79.8 + Math.random() * 0.3 : null,
        platform,
        createdAt,
      });

      allOrderIds.push(orderId);
      storeOrderMap[store.id].push(orderId);

      // Create status events for the order journey
      const statusFlow: OrderStatus[] = [];
      const statusIndex = ORDER_STATUSES.indexOf(status);
      if (status === 'CANCELLED') {
        // Cancelled orders: RECEIVED -> CANCELLED
        statusFlow.push('RECEIVED', 'CANCELLED');
      } else {
        // Normal flow up to current status
        for (let s = 0; s <= statusIndex; s++) {
          if (ORDER_STATUSES[s] !== 'CANCELLED') {
            statusFlow.push(ORDER_STATUSES[s]);
          }
        }
      }

      let eventTime = new Date(createdAt);
      for (const eventStatus of statusFlow) {
        statusEventBatch.push({
          id: uuid(),
          orderId,
          status: eventStatus,
          note: eventStatus === 'CANCELLED' ? randomPick(['Customer requested', 'Out of stock', 'Store closed']) : null,
          createdAt: new Date(eventTime),
        });
        eventTime = new Date(eventTime.getTime() + randomInt(2, 15) * 60 * 1000); // 2-15 min between steps
      }
    }

    // Batch insert for this store
    const orderRes = await prisma.order.createMany({ data: orderBatch, skipDuplicates: true });
    const itemRes = await prisma.orderItem.createMany({ data: orderItemBatch, skipDuplicates: true });
    console.log(`    -> DB Inserted: ${orderRes.count} orders, ${itemRes.count} items`);

    // Order item toppings: handle composite key conflicts
    for (const oit of orderItemToppingBatch) {
      try {
        await prisma.orderItemTopping.create({ data: oit });
      } catch { /* skip duplicates */ }
    }

    await prisma.orderStatusEvent.createMany({ data: statusEventBatch, skipDuplicates: true });

    totalOrders += ordersForThisStore;
    const storeName = store.name.replace('Bing Chun - ', '');
    console.log(`  🏪 ${storeName}: ${ordersForThisStore} orders (${appOrderCount} app / ${webOrderCount} web)`);
  }
  console.log(`  ✅ Total orders created: ${totalOrders}`);

  // ── 6. Loyalty transactions ────────────────────────────────────────────
  console.log('\n⭐ Creating loyalty transactions...');
  const loyaltyBatch: any[] = [];
  for (const userId of userIds) {
    const numTxns = randomInt(2, 8);
    for (let i = 0; i < numTxns; i++) {
      const type = Math.random() < 0.7 ? 'EARNED' : 'REDEEMED';
      loyaltyBatch.push({
        id: uuid(),
        userId,
        orderId: randomPick(allOrderIds),
        points: type === 'EARNED' ? randomInt(10, 200) : -randomInt(10, 100),
        type,
        note: type === 'EARNED' ? 'Points earned from order' : 'Points redeemed on order',
        createdAt: randomDate(90),
      });
    }
  }
  await prisma.loyaltyTransaction.createMany({ data: loyaltyBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${loyaltyBatch.length} loyalty transactions`);

  // ── 7. Customer notifications ──────────────────────────────────────────
  console.log('\n🔔 Creating customer notifications...');
  const customerNotifBatch: any[] = [];
  const notifTypes = ['ORDER_STATUS', 'PROMO', 'LOYALTY', 'GENERAL'];
  const notifMessages: Record<string, { title: string; message: string }[]> = {
    ORDER_STATUS: [
      { title: 'Order Confirmed', message: 'Your order has been confirmed and is being prepared.' },
      { title: 'Order Ready', message: 'Your order is ready for pickup!' },
      { title: 'Out for Delivery', message: 'Your order is on its way to you.' },
      { title: 'Order Delivered', message: 'Your order has been delivered. Enjoy!' },
    ],
    PROMO: [
      { title: 'Special Offer! 🎉', message: 'Get 25% off on all bubble tea this weekend! Use code WEEKEND15.' },
      { title: 'New Menu Item', message: 'Try our new Grape Bobo Tea! Available at all branches.' },
    ],
    LOYALTY: [
      { title: 'Points Earned ⭐', message: 'You earned 50 loyalty points from your last order!' },
      { title: 'Redeem Your Points', message: 'You have enough points for a free drink! Redeem now.' },
    ],
    GENERAL: [
      { title: 'Welcome to Bing Chun!', message: 'Thanks for joining. Enjoy your first order with code WELCOME10.' },
      { title: 'Rate Your Experience', message: 'How was your last order? Rate us and earn bonus points.' },
    ],
  };

  for (const userId of userIds) {
    const numNotifs = randomInt(3, 10);
    for (let i = 0; i < numNotifs; i++) {
      const type = randomPick(notifTypes);
      const msgTemplate = randomPick(notifMessages[type]);
      customerNotifBatch.push({
        id: uuid(),
        userId,
        type,
        title: msgTemplate.title,
        message: msgTemplate.message,
        orderId: type === 'ORDER_STATUS' ? randomPick(allOrderIds) : null,
        read: Math.random() < 0.6,
        createdAt: randomDate(60),
      });
    }
  }
  await prisma.customerNotification.createMany({ data: customerNotifBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${customerNotifBatch.length} customer notifications`);

  // ── 8. Admin notifications ─────────────────────────────────────────────
  console.log('\n📢 Creating admin notifications...');
  const adminNotifBatch: any[] = [];
  const adminNotifTypes = ['NEW_ORDER', 'ORDER_CANCELLED', 'LOW_STOCK', 'DELIVERY_COMPLETE'];

  for (const admin of adminUsers.filter(a => a.storeId)) {
    const numNotifs = randomInt(20, 50);
    for (let i = 0; i < numNotifs; i++) {
      const type = randomPick(adminNotifTypes);
      const storeOrders = storeOrderMap[admin.storeId!] || [];
      adminNotifBatch.push({
        id: uuid(),
        adminUserId: admin.id,
        storeId: admin.storeId!,
        type,
        title: type === 'NEW_ORDER' ? 'New Order Received'
          : type === 'ORDER_CANCELLED' ? 'Order Cancelled'
          : type === 'LOW_STOCK' ? 'Low Stock Alert'
          : 'Delivery Completed',
        message: type === 'NEW_ORDER' ? `A new order has been placed at your branch.`
          : type === 'ORDER_CANCELLED' ? `An order has been cancelled by the customer.`
          : type === 'LOW_STOCK' ? `${randomPick(products).name} is running low in stock.`
          : `A delivery has been completed successfully.`,
        orderId: storeOrders.length > 0 ? randomPick(storeOrders) : null,
        read: Math.random() < 0.5,
        createdAt: randomDate(30),
      });
    }
  }
  await prisma.adminNotification.createMany({ data: adminNotifBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${adminNotifBatch.length} admin notifications`);

  // ── 9. Notifications (SMS/Email/Push) ──────────────────────────────────
  console.log('\n📨 Creating notification logs...');
  const notifLogBatch: any[] = [];
  const notifLogTypes: Array<'SMS' | 'EMAIL' | 'PUSH'> = ['SMS', 'EMAIL', 'PUSH'];

  for (let i = 0; i < 300; i++) {
    const userId = randomPick(userIds);
    const type = randomPick(notifLogTypes);
    notifLogBatch.push({
      id: uuid(),
      userId,
      phone: type === 'SMS' ? `077${padNum(1000000 + randomInt(0, 149), 7)}` : null,
      email: type === 'EMAIL' ? `test.user${randomInt(1, 150)}@bingchun-test.lk` : null,
      type,
      subject: type === 'EMAIL' ? 'Your Bing Chun Order Update' : null,
      message: `Your order status has been updated. Thank you for choosing Bing Chun!`,
      sent: Math.random() < 0.9,
      sentAt: Math.random() < 0.9 ? randomDate(60) : null,
      createdAt: randomDate(60),
    });
  }
  await prisma.notification.createMany({ data: notifLogBatch, skipDuplicates: true });
  console.log(`  ✅ Created ${notifLogBatch.length} notification logs`);

  // ── 10. Delivery jobs ──────────────────────────────────────────────────
  console.log('\n🚚 Creating delivery jobs...');
  let totalDeliveryJobs = 0;

  for (const store of stores) {
    // Get delivery orders for this store
    const deliveryOrderIds = (storeOrderMap[store.id] || []).slice(0, 30); // up to 30 per store
    if (deliveryOrderIds.length === 0) continue;

    // Find drivers for this store
    const storeDrivers = adminUsers.filter(a => a.storeId === store.id && a.role === 'DELIVERY_DRIVER');
    const driverId = storeDrivers.length > 0 ? storeDrivers[0].id : null;

    // Create 5-10 delivery jobs per store
    const numJobs = randomInt(5, 10);
    for (let j = 0; j < numJobs; j++) {
      const jobId = uuid();
      const jobStatus = randomPick(['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED', 'COMPLETED'] as const);
      const scheduledAt = randomDate(30);

      await prisma.deliveryJob.create({
        data: {
          id: jobId,
          storeId: store.id,
          driverId: jobStatus !== 'SCHEDULED' ? driverId : null,
          title: `Delivery Run ${j + 1} - ${store.name.replace('Bing Chun - ', '')}`,
          status: jobStatus,
          scheduledAt,
          assignedAt: jobStatus !== 'SCHEDULED' ? new Date(scheduledAt.getTime() + 5 * 60000) : null,
          startedAt: ['IN_PROGRESS', 'COMPLETED'].includes(jobStatus) ? new Date(scheduledAt.getTime() + 10 * 60000) : null,
          completedAt: jobStatus === 'COMPLETED' ? new Date(scheduledAt.getTime() + 45 * 60000) : null,
        },
      });

      // Assign 2-5 orders to each job
      const ordersForJob = deliveryOrderIds.sort(() => Math.random() - 0.5).slice(0, randomInt(2, 5));
      for (let seq = 0; seq < ordersForJob.length; seq++) {
        try {
          await prisma.deliveryJobOrder.create({
            data: { jobId, orderId: ordersForJob[seq], sequence: seq + 1 },
          });
        } catch { /* skip if already assigned */ }
      }

      totalDeliveryJobs++;
    }
  }
  console.log(`  ✅ Created ${totalDeliveryJobs} delivery jobs`);

  // ── 11. Store wallets & wallet transactions ────────────────────────────
  console.log('\n💰 Creating store wallets & transactions...');
  let walletTxCount = 0;

  for (const store of stores) {
    // Upsert store wallet
    const wallet = await prisma.storeWallet.upsert({
      where: { storeId: store.id },
      update: {},
      create: {
        storeId: store.id,
        balance: randomInt(50000, 500000),
        totalEarnings: randomInt(500000, 2000000),
        totalWithdrawn: randomInt(100000, 800000),
        currency: 'LKR',
      },
    });

    // Create 20-40 wallet transactions per store
    const numTxns = randomInt(20, 40);
    let runningBalance = wallet.balance;

    for (let t = 0; t < numTxns; t++) {
      const txType = randomPick(['ORDER_PAYMENT', 'ORDER_PAYMENT', 'ORDER_PAYMENT', 'REFUND', 'ADJUSTMENT'] as const);
      const storeOrders = storeOrderMap[store.id] || [];
      const txOrderId = storeOrders.length > 0 ? randomPick(storeOrders) : null;
      const amount = txType === 'REFUND' ? -randomInt(200, 2000) : randomInt(500, 5000);
      runningBalance += amount;

      // Use a unique orderId+type combo to avoid constraint violation
      const txId = uuid();
      try {
        await prisma.walletTransaction.create({
          data: {
            id: txId,
            storeId: store.id,
            orderId: txType === 'ADJUSTMENT' ? null : txOrderId, // avoid unique constraint
            type: txType,
            amount: Math.abs(amount),
            balanceAfter: Math.max(0, runningBalance),
            paymentMethod: randomPick(['CARD', 'PAYHERE']),
            description: txType === 'ORDER_PAYMENT' ? 'Payment received for order'
              : txType === 'REFUND' ? 'Refund processed'
              : 'Balance adjustment',
            createdAt: randomDate(60),
          },
        });
        walletTxCount++;
      } catch { /* skip if unique constraint violated */ }
    }
  }
  console.log(`  ✅ Created ${walletTxCount} wallet transactions`);

  // ── 12. Commission settlements ─────────────────────────────────────────
  console.log('\n📊 Creating commission settlements...');
  let settlementCount = 0;

  for (const store of stores) {
    // 2-4 settlements per store
    const numSettlements = randomInt(2, 4);
    for (let s = 0; s < numSettlements; s++) {
      const periodFrom = new Date(Date.now() - (s + 1) * 30 * 24 * 60 * 60 * 1000);
      const periodTo = new Date(periodFrom.getTime() + 30 * 24 * 60 * 60 * 1000);
      const totalCommission = randomInt(5000, 50000);
      const totalProviderFee = randomInt(1000, 10000);

      try {
        await prisma.commissionSettlement.create({
          data: {
            statementRef: `STMT-${store.id.slice(0, 8)}-${s + 1}`,
            storeId: store.id,
            periodFrom,
            periodTo,
            status: randomPick(['PENDING_VERIFICATION', 'VERIFIED', 'VERIFIED']),
            paymentMethod: randomPick(['BANK_TRANSFER', 'CASH', 'ONLINE']),
            breakdown: {
              totalOrders: randomInt(50, 200),
              totalSales: randomInt(100000, 500000),
              commissionRate: 0.15,
              totalCommission,
              totalProviderFee,
              netPayable: totalCommission - totalProviderFee,
            },
            totalCommission,
            totalProviderFee,
            createdAt: periodTo,
          },
        });
        settlementCount++;
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`  ✅ Created ${settlementCount} commission settlements`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 DUMMY DATA SEEDING COMPLETE!');
  console.log('═'.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`  👥 Users:                  ${userBatch.length}`);
  console.log(`  🏠 Addresses:              ${addressBatch.length}`);
  console.log(`  🎟️  Promo Codes (extra):    ${promoCodes.length}`);
  console.log(`  📦 Orders:                 ${totalOrders} (across ${stores.length} stores)`);
  console.log(`     ├─ App orders (platform=1): ~${Math.floor(totalOrders / 2)}`);
  console.log(`     └─ Web orders (platform=0): ~${Math.ceil(totalOrders / 2)}`);
  console.log(`  ⭐ Loyalty Txns:           ${loyaltyBatch.length}`);
  console.log(`  🔔 Customer Notifications: ${customerNotifBatch.length}`);
  console.log(`  📢 Admin Notifications:    ${adminNotifBatch.length}`);
  console.log(`  📨 Notification Logs:      ${notifLogBatch.length}`);
  console.log(`  🚚 Delivery Jobs:          ${totalDeliveryJobs}`);
  console.log(`  💰 Wallet Transactions:    ${walletTxCount}`);
  console.log(`  📊 Commission Settlements: ${settlementCount}`);
  console.log(`\n  Each store has 100+ orders, split ~50/50 between app (platform=1) and web (platform=0)`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
