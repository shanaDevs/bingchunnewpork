import 'dotenv/config';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { syncAllStoreProducts } from '../src/lib/storeInventory';
import { productImageUrl } from '../src/lib/productImages';
import {
  BINGCHUN_STORES,
  isDeliveryEnabledStore,
  storeIdCandidates,
  storeIdFromName,
  type StoreSeed,
} from './data/stores';
import { ensurePlatformLoyaltyCampaign } from '../src/lib/loyaltyCampaign';
import {
  buildDefaultPermissionRows,
  getDefaultMenusForRole,
  ROLES_WITH_DEFAULT_MENUS,
} from '../src/constants/defaultPermissions';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const categories = [
  { name: 'All', slug: 'all', icon: '🧋', sortOrder: 0 },
  { name: 'Bubble Tea', slug: 'bubble-tea', icon: '🧋', sortOrder: 1 },
  { name: 'Milk Tea', slug: 'milk-tea', icon: '🍵', sortOrder: 2 },
  { name: 'Fruit Tea', slug: 'fruit-tea', icon: '🍋', sortOrder: 3 },
  { name: 'Milkshake', slug: 'milkshake', icon: '🥤', sortOrder: 4 },
  { name: 'Sundae', slug: 'sundae', icon: '🍨', sortOrder: 5 },
  { name: 'Ice Cream', slug: 'ice-cream', icon: '🍦', sortOrder: 6 },
];

type ProductSeed = {
  categorySlug: string;
  name: string;
  basePrice: number;
  tag?: string;
  description?: string;
  imageUrl?: string;
};

const products: ProductSeed[] = [
  // Bubble Tea
  { categorySlug: 'bubble-tea', name: 'Bobo Milk Tea', basePrice: 450, tag: 'Classic', description: 'Creamy milk tea with chewy boba pearls. Our classic signature drink.' },
  { categorySlug: 'bubble-tea', name: 'Brown Sugar Boba Milk Tea', basePrice: 480, tag: 'Popular', description: 'Rich brown sugar syrup blended with fresh milk and boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Blueberry Bobo Tea', basePrice: 450, tag: 'Classic', description: 'Refreshing blueberry tea with boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Grape Bobo Tea', basePrice: 650, tag: 'New', description: 'Bold grape flavour with soft boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Strawberry Bobo Jasmine Milk Tea', basePrice: 650, tag: 'New', description: 'Delicate jasmine milk tea with strawberry and boba.' },
  // Milk Tea
  { categorySlug: 'milk-tea', name: 'Original Milk Tea', basePrice: 380, tag: 'Signature', description: 'Our signature milk tea – smooth, balanced and timeless.' },
  { categorySlug: 'milk-tea', name: 'Lychee Jasmine Milk Tea', basePrice: 650, tag: 'Signature', description: 'Floral jasmine milk tea with sweet lychee.' },
  // Fruit Tea
  { categorySlug: 'fruit-tea', name: 'Fresh Lemonade', basePrice: 280, tag: 'Classic', description: 'Ice-cold freshly squeezed lemonade.' },
  { categorySlug: 'fruit-tea', name: 'Jasmine Green Tea', basePrice: 320, tag: 'Classic', description: 'Light and floral jasmine green tea served cold.' },
  { categorySlug: 'fruit-tea', name: 'Lemon Black Tea', basePrice: 380, tag: 'Classic', description: 'Bold black tea with a refreshing lemon twist.' },
  { categorySlug: 'fruit-tea', name: 'Lemon Green Tea', basePrice: 380, tag: 'New', description: 'Green tea infused with fresh lemon.' },
  { categorySlug: 'fruit-tea', name: 'Strawberry Lemon Tea', basePrice: 550, tag: 'Popular', description: 'Fruity strawberry blended with zesty lemon tea.' },
  { categorySlug: 'fruit-tea', name: 'Strawberry Mango Lemon Tea', basePrice: 650, tag: 'Popular', description: 'Tropical mango and strawberry in a lemon tea base.' },
  // Milkshake
  { categorySlug: 'milkshake', name: 'Blueberry Milkshake', basePrice: 550, tag: 'Classic', description: 'Thick and creamy blueberry milkshake.' },
  { categorySlug: 'milkshake', name: 'Strawberry Milkshake', basePrice: 550, tag: 'Popular', description: 'Classic strawberry milkshake made with real fruit.' },
  { categorySlug: 'milkshake', name: 'Chocolate Oreo Milkshake', basePrice: 550, tag: 'Popular', description: 'Rich chocolate milkshake blended with Oreo cookies.' },
  { categorySlug: 'milkshake', name: 'Mulberry Milkshake', basePrice: 550, tag: 'New', description: 'Unique mulberry flavour in a creamy milkshake.' },
  { categorySlug: 'milkshake', name: 'Strawberry Oreo Milkshake', basePrice: 550, tag: 'Popular', description: 'Strawberry milkshake with crushed Oreo topping.' },
  // Sundae
  { categorySlug: 'sundae', name: 'Blueberry Sundae', basePrice: 450, tag: 'Classic', description: 'Blueberry compote over creamy vanilla ice cream.' },
  { categorySlug: 'sundae', name: 'Blueberry Chocolate Sundae', basePrice: 480, tag: 'Popular', description: 'Blueberry and chocolate drizzle over ice cream.' },
  { categorySlug: 'sundae', name: 'Brown Sugar Boba Sundae', basePrice: 480, tag: 'Best Seller', description: 'Our best-selling sundae with brown sugar caramel and boba.' },
  { categorySlug: 'sundae', name: 'Chocolate Oreo Sundae', basePrice: 520, tag: 'Popular', description: 'Chocolate sauce, Oreo crumble and vanilla ice cream.' },
  { categorySlug: 'sundae', name: 'Chocolate Biscuit Sundae', basePrice: 420, tag: 'Classic', description: 'Chocolate sauce and biscuit topping over ice cream.' },
  { categorySlug: 'sundae', name: 'Mango Sundae', basePrice: 450, tag: 'Popular', description: 'Fresh mango with creamy vanilla sundae.' },
  { categorySlug: 'sundae', name: 'Mango Pomelo Sago', basePrice: 580, tag: 'Signature', description: 'Signature Hong Kong-style mango pomelo sago dessert.' },
  { categorySlug: 'sundae', name: 'Oreo Chocolate Sundae', basePrice: 520, tag: 'Popular', description: 'Double Oreo and chocolate indulgence sundae.' },
  { categorySlug: 'sundae', name: 'Strawberry Sundae', basePrice: 420, tag: 'Classic', description: 'Fresh strawberry coulis over vanilla ice cream.' },
  // Ice Cream
  { categorySlug: 'ice-cream', name: 'Vanilla Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Classic creamy vanilla soft serve.' },
  { categorySlug: 'ice-cream', name: 'Chocolate Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Rich chocolate soft serve ice cream.' },
  { categorySlug: 'ice-cream', name: 'Mix Choco Vanilla Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Swirled chocolate and vanilla soft serve.' },
];

const toppings = [
  { name: 'Boba 40G (Black Pearls)', extraPrice: 80 },
  { name: 'Bobo 25G (Crystal Pearls)', extraPrice: 80 },
  { name: 'Jelly 40G', extraPrice: 80 },
];

const stores = BINGCHUN_STORES;

async function resolveStoreId(store: StoreSeed): Promise<string> {
  for (const id of storeIdCandidates(store)) {
    const existing = await prisma.store.findUnique({ where: { id }, select: { id: true } });
    if (existing) return existing.id;
  }
  const names = [store.name, ...(store.legacyNames ?? [])];
  const byName = await prisma.store.findFirst({
    where: { name: { in: names } },
    select: { id: true },
  });
  if (byName) return byName.id;
  return storeIdFromName(store.name);
}

const DEFAULT_ROLES = [
  'SYSTEM_ADMIN',
  'STORE_MANAGER',
  'CASHIER',
  'DELIVERY_ADMIN',
  'REPORT_VIEWER',
  'DELIVERY_DRIVER',
] as const;

function branchSlugFromStoreName(name: string): string {
  return name
    .replace(/^Bing Chun\s*-\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function ensureRoles() {
  const byName: Record<string, string> = {};
  for (const name of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    byName[name] = role.id;
  }
  return byName;
}

async function grantDefaultStaffPermissions() {
  const staff = await prisma.adminUser.findMany({
    where: {
      role: { name: { in: ROLES_WITH_DEFAULT_MENUS } },
      permissions: { none: {} },
    },
    select: { id: true, role: { select: { name: true } } },
  });
  for (const user of staff) {
    const menus = getDefaultMenusForRole(user.role.name);
    if (menus.length === 0) continue;
    await prisma.permission.createMany({ data: buildDefaultPermissionRows(user.id, menus) });
  }
  if (staff.length > 0) {
    console.log(`🔐 Granted default menu permissions to ${staff.length} staff account(s)`);
  }
}

/** Existing Delivery Admins already have a permission matrix, so they miss new default menus. */
async function grantDeliveryWalletToDeliveryAdmins() {
  const staff = await prisma.adminUser.findMany({
    where: {
      role: { name: 'DELIVERY_ADMIN' },
      permissions: { none: { menu: 'DELIVERY_WALLET' } },
    },
    select: { id: true },
  });
  if (staff.length === 0) return;

  await prisma.permission.createMany({
    data: staff.flatMap((user) => buildDefaultPermissionRows(user.id, ['DELIVERY_WALLET'])),
  });
  console.log(`🔐 Granted DELIVERY_WALLET to ${staff.length} delivery admin account(s)`);
}

/** Delivery admins must not keep ORDERS or DASHBOARD (Orders/Refunds/WhatsApp share ORDERS). */
async function revokeRemovedDeliveryAdminMenus() {
  const result = await prisma.permission.deleteMany({
    where: {
      menu: { in: ['ORDERS', 'DASHBOARD'] },
      adminUser: { role: { name: 'DELIVERY_ADMIN' } },
    },
  });
  if (result.count > 0) {
    console.log(`🔐 Removed ORDERS/DASHBOARD from ${result.count} delivery admin permission row(s)`);
  }
}

async function main() {
  const roleIds = await ensureRoles();
  console.log('🌱 Seeding database...');

  // Loyalty settings
  await prisma.loyaltySetting.upsert({
    where: { id: 'default' },
    update: { pointsPerLkr: 0.01, referralBonusPoints: 100 },
    create: {
      id: 'default',
      pointsPerLkr: 0.01,
      redeemValue: 1.0,
      maxRedeemPct: 100,
      minOrderToEarn: 200,
      referralBonusPoints: 100,
    },
  });

  // Categories (skip 'All' - it's virtual)
  const catMap: Record<string, string> = {};
  for (const cat of categories.filter((c) => c.slug !== 'all')) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { name: cat.name, slug: cat.slug, icon: cat.icon, sortOrder: cat.sortOrder },
    });
    catMap[cat.slug] = created.id;
  }

  // Toppings
  // Clear existing to avoid mix-up
  try {
    await prisma.productTopping.deleteMany();
    await prisma.cartItemTopping.deleteMany();
    await prisma.orderItemTopping.deleteMany();
    await prisma.topping.deleteMany();
  } catch (e) {
    console.log('Could not clear all old toppings, continuing...');
  }

  for (const topping of toppings) {
    await prisma.topping.upsert({
      where: { name: topping.name },
      update: {},
      create: topping,
    });
  }

  // Products
  let sortOrder = 0;
  for (const p of products) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const imageUrl = p.imageUrl ?? productImageUrl(p.name);
    await prisma.product.upsert({
      where: { slug },
      update: {
        imageUrl,
        ...(p.tag != null ? { tag: p.tag } : {}),
      },
      create: {
        categoryId: catMap[p.categorySlug],
        name: p.name,
        slug,
        description: p.description,
        basePrice: p.basePrice,
        tag: p.tag,
        imageUrl,
        sortOrder: sortOrder++,
      },
    });
  }

  // Link toppings to drink products so customization pickers have options
  const allToppings = await prisma.topping.findMany();
  const drinkProducts = await prisma.product.findMany({
    where: { category: { slug: { in: ['bubble-tea', 'milk-tea', 'fruit-tea'] } } },
    select: { id: true },
  });
  for (const product of drinkProducts) {
    for (const topping of allToppings) {
      await prisma.productTopping.upsert({
        where: { productId_toppingId: { productId: product.id, toppingId: topping.id } },
        update: {},
        create: { productId: product.id, toppingId: topping.id },
      });
    }
  }

  // Stores + delivery zones
  for (const store of stores) {
    const storeId = await resolveStoreId(store);
    const deliveryEnabled = isDeliveryEnabledStore(storeId);
    const s = await prisma.store.upsert({
      where: { id: storeId },
      update: {
        name: store.name,
        addressLine: store.addressLine,
        city: store.city,
        district: store.district,
        lat: store.lat,
        lng: store.lng,
        phone: store.phone ?? null,
        openTime: store.openTime ?? '09:00',
        closeTime: store.closeTime ?? '23:00',
        deliveryEnabled,
        isActive: true,
      },
      create: {
        id: storeId,
        name: store.name,
        addressLine: store.addressLine,
        city: store.city,
        district: store.district,
        lat: store.lat,
        lng: store.lng,
        phone: store.phone ?? null,
        openTime: store.openTime ?? '09:00',
        closeTime: store.closeTime ?? '23:00',
        deliveryEnabled,
      },
    });

    await prisma.deliveryZone.upsert({
      where: { id: `zone-${s.id}-5km` },
      update: {},
      create: {
        id: `zone-${s.id}-5km`,
        storeId: s.id,
        name: 'Zone 1 (0-5 km)',
        radiusKm: 5,
        fee: 150,
        minOrder: 500,
      },
    });

    await prisma.deliveryZone.upsert({
      where: { id: `zone-${s.id}-10km` },
      update: {},
      create: {
        id: `zone-${s.id}-10km`,
        storeId: s.id,
        name: 'Zone 2 (5-10 km)',
        radiusKm: 10,
        fee: 300,
        minOrder: 800,
      },
    });
  }

  // Promo codes
  await prisma.promoCode.upsert({
    where: { code: 'WELCOME10' },
    update: {
      description: '10% off your first order',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      isActive: true,
      promotionKind: 'WELCOME',
      title: 'First Order — 10% Off',
      usageLimits: { maxPerCustomer: 1 },
    },
    create: {
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

  await prisma.promoCode.upsert({
    where: { code: 'BINGCHUN50' },
    update: {},
    create: { code: 'BINGCHUN50', description: 'LKR 50 off orders above LKR 800', discountType: 'FIXED', discountValue: 50, minOrderValue: 800 },
  });

  // Demo customer account
  const customerHash = await bcrypt.hash('Customer@123', 12);
  await prisma.user.upsert({
    where: { phone: '0771234567' },
    update: { passwordHash: customerHash, email: 'customer@bingchun.lk', name: 'Demo Customer' },
    create: {
      name: 'Demo Customer',
      phone: '0771234567',
      email: 'customer@bingchun.lk',
      passwordHash: customerHash,
    },
  });

  // Admin users
  const adminHash = await bcrypt.hash('Admin@123', 12);
  await prisma.adminUser.upsert({
    where: { email: 'admin@bingchunsrilanka.lk' },
    update: { roleId: roleIds.SYSTEM_ADMIN, passwordHash: adminHash, isActive: true },
    create: {
      name: 'System Admin',
      email: 'admin@bingchunsrilanka.lk',
      passwordHash: adminHash,
      roleId: roleIds.SYSTEM_ADMIN,
    },
  });

  const branchHash = await bcrypt.hash('Branch@123', 12);
  const cashierHash = await bcrypt.hash('Cashier@123', 12);
  const demoPin = '1234';
  const deliveryHash = await bcrypt.hash(demoPin, 12);
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

  const allStores = await prisma.store.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const nugegodaStore = allStores.find((s) => s.name.includes('Nugegoda'));
  const dehiwalaStore = allStores.find((s) => s.name.includes('Dehiwala 1'));
  const rathmalanaStore = allStores.find((s) => s.name.includes('Rathmalana'));

  const specialBranchLogins: { email: string; name: string; storeId: string | undefined }[] = [
    { email: 'branch@bingchunsrilanka.lk', name: 'Nugegoda Branch Manager', storeId: nugegodaStore?.id },
    { email: 'dehiwala@bingchunsrilanka.lk', name: 'Dehiwala Branch Manager', storeId: dehiwalaStore?.id },
    { email: 'rathmalana@bingchunsrilanka.lk', name: 'Rathmalana Branch Manager', storeId: rathmalanaStore?.id },
  ];
  for (const login of specialBranchLogins) {
    await prisma.adminUser.upsert({
      where: { email: login.email },
      update: {
        roleId: roleIds.STORE_MANAGER,
        storeId: login.storeId ?? null,
        passwordHash: branchHash,
        isActive: true,
      },
      create: {
        name: login.name,
        email: login.email,
        passwordHash: branchHash,
        roleId: roleIds.STORE_MANAGER,
        storeId: login.storeId,
      },
    });
  }

  const branchLoginEmails: string[] = [];
  for (const store of allStores) {
    const slug = branchSlugFromStoreName(store.name);
    const email = `${slug}@bingchunsrilanka.lk`;
    const shortName = store.name.replace(/^Bing Chun\s*-\s*/i, '');
    await prisma.adminUser.upsert({
      where: { email },
      update: {
        roleId: roleIds.STORE_MANAGER,
        storeId: store.id,
        passwordHash: branchHash,
        isActive: true,
      },
      create: {
        name: `${shortName} Branch Manager`,
        email,
        passwordHash: branchHash,
        roleId: roleIds.STORE_MANAGER,
        storeId: store.id,
      },
    });
    branchLoginEmails.push(`${email}  (${shortName})`);

    const cashierEmail = `${slug}.cashier@bingchunsrilanka.lk`;
    await prisma.adminUser.upsert({
      where: { email: cashierEmail },
      update: {
        roleId: roleIds.CASHIER,
        storeId: store.id,
        passwordHash: cashierHash,
        isActive: true,
      },
      create: {
        name: `${shortName} Cashier`,
        email: cashierEmail,
        passwordHash: cashierHash,
        roleId: roleIds.CASHIER,
        storeId: store.id,
      },
    });

    const isNugegoda = store.id === nugegodaStore?.id;
    const driverEmail = isNugegoda
      ? 'delivery@bingchunsrilanka.lk'
      : `${slug}.driver@bingchunsrilanka.lk`;
    if (isNugegoda) {
      await prisma.adminUser.deleteMany({ where: { email: `${slug}.driver@bingchunsrilanka.lk` } });
    }
    const pinLookup = crypto.createHmac('sha256', jwtSecret).update(`${store.id}:${demoPin}`).digest('hex');
    await prisma.adminUser.upsert({
      where: { email: driverEmail },
      update: {
        roleId: roleIds.DELIVERY_DRIVER,
        storeId: store.id,
        passwordHash: deliveryHash,
        pinLookup,
        isActive: true,
      },
      create: {
        name: `${shortName} Delivery Driver`,
        email: driverEmail,
        passwordHash: deliveryHash,
        pinLookup,
        roleId: roleIds.DELIVERY_DRIVER,
        storeId: store.id,
      },
    });
  }

  await prisma.adminUser.upsert({
    where: { email: 'cashier@bingchunsrilanka.lk' },
    update: {
      roleId: roleIds.CASHIER,
      storeId: nugegodaStore?.id ?? null,
      passwordHash: cashierHash,
      isActive: true,
    },
    create: {
      name: 'Nugegoda Cashier',
      email: 'cashier@bingchunsrilanka.lk',
      passwordHash: cashierHash,
      roleId: roleIds.CASHIER,
      storeId: nugegodaStore?.id,
    },
  });

  await grantDefaultStaffPermissions();
  await grantDeliveryWalletToDeliveryAdmins();
  await revokeRemovedDeliveryAdminMenus();

  console.log('✅ Seed complete!');
  console.log('Customer: customer@bingchun.lk / Customer@123  (or phone 0771234567)');
  console.log('Super Admin: admin@bingchunsrilanka.lk / Admin@123');
  console.log('Branch Admin (Nugegoda): branch@bingchunsrilanka.lk / Branch@123');
  console.log('Branch Admin (Dehiwala): dehiwala@bingchunsrilanka.lk / Branch@123');
  console.log('Branch Admin (Rathmalana): rathmalana@bingchunsrilanka.lk / Branch@123');
  console.log('Cashier (Nugegoda): cashier@bingchunsrilanka.lk / Cashier@123');
  console.log('Delivery Driver PIN: 1234 (any branch)');
  console.log(`All branch managers (password Branch@123):\n  ${branchLoginEmails.join('\n  ')}`);

  if (nugegodaStore?.id) {
    const readyDeliveries = await prisma.order.findMany({
      where: {
        storeId: nugegodaStore.id,
        orderMode: 'DELIVERY',
        status: 'READY',
        deliveryJobOrders: { none: {} },
      },
      take: 6,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (readyDeliveries.length > 0) {
      const existingJob = await prisma.deliveryJob.findFirst({
        where: { storeId: nugegodaStore.id, status: 'SCHEDULED', driverId: null },
      });
      if (!existingJob) {
        await prisma.deliveryJob.create({
          data: {
            storeId: nugegodaStore.id,
            title: `Nugegoda delivery run (${readyDeliveries.length} orders)`,
            scheduledAt: new Date(),
            jobOrders: {
              create: readyDeliveries.map((o, i) => ({ orderId: o.id, sequence: i + 1 })),
            },
          },
        });
        console.log(`Delivery job: scheduled ${readyDeliveries.length} ready orders for drivers`);
      }
    }
  }

  // Per-store product inventory (every product at every branch)
  const added = await syncAllStoreProducts({ stock: 0, isAvailable: false });
  if (added > 0) {
    console.log(`📦 Branch inventory: created ${added} store-product rows (stock 0 until RESET batches)`);
  } else {
    console.log('📦 Branch inventory: all products already assigned to branches');
  }

  await ensurePlatformLoyaltyCampaign();
  console.log('🎁 Loyalty campaign: platform defaults ensured');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
