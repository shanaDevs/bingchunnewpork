/**
 * Generates backend/prisma/seed-full.sql — a full MySQL seed (core + dummy volume).
 *
 * Usage:
 *   npm run db:seed:sql:generate
 *   mysql -u bingchun -p bingchun < prisma/seed-full.sql
 *
 * Prerequisites: schema must exist (`npx prisma db push`).
 * Driver PIN lookup uses JWT_SECRET fallback `dev-secret` — runtime JWT_SECRET must match.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { BINGCHUN_STORES, isDeliveryEnabledStore, storeIdFromName } from './data/stores';
import { PRODUCT_IMAGES } from '../src/lib/productImages';

// ─── Deterministic PRNG (mulberry32) ───────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randomInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function padNum(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function randomDate(daysBack: number, offset = 0): Date {
  const now = Date.now() - offset * 24 * 60 * 60 * 1000;
  const past = now - daysBack * 24 * 60 * 60 * 1000;
  return new Date(past + rand() * (now - past));
}

// ─── SQL helpers ─────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function escNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'NULL';
  return String(n);
}

function escBool(b: boolean): string {
  return b ? '1' : '0';
}

function escDt(d: Date): string {
  const iso = d.toISOString().slice(0, 23).replace('T', ' ');
  return `'${iso}'`;
}

function escJson(obj: unknown): string {
  return esc(JSON.stringify(obj));
}

type Row = Record<string, string | number | boolean | null | Date>;

function rowValues(row: Row, cols: string[]): string {
  return cols
    .map((c) => {
      const v = row[c];
      if (v === null || v === undefined) return 'NULL';
      if (v instanceof Date) return escDt(v);
      if (typeof v === 'boolean') return escBool(v);
      if (typeof v === 'number') return escNum(v);
      return esc(String(v));
    })
    .join(', ');
}

function insertBatch(table: string, cols: string[], rows: Row[], chunkSize = 80): string {
  if (rows.length === 0) return '';
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map((r) => `(${rowValues(r, cols)})`).join(',\n  ');
    lines.push(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES\n  ${values};`);
  }
  return lines.join('\n\n');
}

function upsertBatch(
  table: string,
  cols: string[],
  rows: Row[],
  updateCols: string[],
  chunkSize = 80,
): string {
  if (rows.length === 0) return '';
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map((r) => `(${rowValues(r, cols)})`).join(',\n  ');
    const updates = updateCols.map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(', ');
    lines.push(
      `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES\n  ${values}\nON DUPLICATE KEY UPDATE ${updates};`,
    );
  }
  return lines.join('\n\n');
}

// ─── Seed data constants (from seed.ts) ────────────────────────────────────

const CATEGORIES = [
  { id: 'cat-bubble-tea', name: 'Bubble Tea', slug: 'bubble-tea', icon: '🧋', sortOrder: 1 },
  { id: 'cat-milk-tea', name: 'Milk Tea', slug: 'milk-tea', icon: '🍵', sortOrder: 2 },
  { id: 'cat-fruit-tea', name: 'Fruit Tea', slug: 'fruit-tea', icon: '🍋', sortOrder: 3 },
  { id: 'cat-milkshake', name: 'Milkshake', slug: 'milkshake', icon: '🥤', sortOrder: 4 },
  { id: 'cat-sundae', name: 'Sundae', slug: 'sundae', icon: '🍨', sortOrder: 5 },
  { id: 'cat-ice-cream', name: 'Ice Cream', slug: 'ice-cream', icon: '🍦', sortOrder: 6 },
];

type ProductSeed = {
  categorySlug: string;
  name: string;
  basePrice: number;
  tag?: string;
  description?: string;
};

const PRODUCTS: ProductSeed[] = [
  { categorySlug: 'bubble-tea', name: 'Bobo Milk Tea', basePrice: 450, tag: 'Classic', description: 'Creamy milk tea with chewy boba pearls. Our classic signature drink.' },
  { categorySlug: 'bubble-tea', name: 'Brown Sugar Boba Milk Tea', basePrice: 480, tag: 'Popular', description: 'Rich brown sugar syrup blended with fresh milk and boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Blueberry Bobo Tea', basePrice: 450, tag: 'Classic', description: 'Refreshing blueberry tea with boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Grape Bobo Tea', basePrice: 650, tag: 'New', description: 'Bold grape flavour with soft boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Strawberry Bobo Jasmine Milk Tea', basePrice: 650, tag: 'New', description: 'Delicate jasmine milk tea with strawberry and boba.' },
  { categorySlug: 'milk-tea', name: 'Original Milk Tea', basePrice: 380, tag: 'Signature', description: 'Our signature milk tea – smooth, balanced and timeless.' },
  { categorySlug: 'milk-tea', name: 'Lychee Jasmine Milk Tea', basePrice: 650, tag: 'Signature', description: 'Floral jasmine milk tea with sweet lychee.' },
  { categorySlug: 'fruit-tea', name: 'Fresh Lemonade', basePrice: 280, tag: 'Classic', description: 'Ice-cold freshly squeezed lemonade.' },
  { categorySlug: 'fruit-tea', name: 'Jasmine Green Tea', basePrice: 320, tag: 'Classic', description: 'Light and floral jasmine green tea served cold.' },
  { categorySlug: 'fruit-tea', name: 'Lemon Black Tea', basePrice: 380, tag: 'Classic', description: 'Bold black tea with a refreshing lemon twist.' },
  { categorySlug: 'fruit-tea', name: 'Lemon Green Tea', basePrice: 380, tag: 'New', description: 'Green tea infused with fresh lemon.' },
  { categorySlug: 'fruit-tea', name: 'Strawberry Lemon Tea', basePrice: 550, tag: 'Popular', description: 'Fruity strawberry blended with zesty lemon tea.' },
  { categorySlug: 'fruit-tea', name: 'Strawberry Mango Lemon Tea', basePrice: 650, tag: 'Popular', description: 'Tropical mango and strawberry in a lemon tea base.' },
  { categorySlug: 'milkshake', name: 'Blueberry Milkshake', basePrice: 550, tag: 'Classic', description: 'Thick and creamy blueberry milkshake.' },
  { categorySlug: 'milkshake', name: 'Strawberry Milkshake', basePrice: 550, tag: 'Popular', description: 'Classic strawberry milkshake made with real fruit.' },
  { categorySlug: 'milkshake', name: 'Chocolate Oreo Milkshake', basePrice: 550, tag: 'Popular', description: 'Rich chocolate milkshake blended with Oreo cookies.' },
  { categorySlug: 'milkshake', name: 'Mulberry Milkshake', basePrice: 550, tag: 'New', description: 'Unique mulberry flavour in a creamy milkshake.' },
  { categorySlug: 'milkshake', name: 'Strawberry Oreo Milkshake', basePrice: 550, tag: 'Popular', description: 'Strawberry milkshake with crushed Oreo topping.' },
  { categorySlug: 'sundae', name: 'Blueberry Sundae', basePrice: 450, tag: 'Classic', description: 'Blueberry compote over creamy vanilla ice cream.' },
  { categorySlug: 'sundae', name: 'Blueberry Chocolate Sundae', basePrice: 480, tag: 'Popular', description: 'Blueberry and chocolate drizzle over ice cream.' },
  { categorySlug: 'sundae', name: 'Brown Sugar Boba Sundae', basePrice: 480, tag: 'Best Seller', description: 'Our best-selling sundae with brown sugar caramel and boba.' },
  { categorySlug: 'sundae', name: 'Chocolate Oreo Sundae', basePrice: 520, tag: 'Popular', description: 'Chocolate sauce, Oreo crumble and vanilla ice cream.' },
  { categorySlug: 'sundae', name: 'Chocolate Biscuit Sundae', basePrice: 420, tag: 'Classic', description: 'Chocolate sauce and biscuit topping over ice cream.' },
  { categorySlug: 'sundae', name: 'Mango Sundae', basePrice: 450, tag: 'Popular', description: 'Fresh mango with creamy vanilla sundae.' },
  { categorySlug: 'sundae', name: 'Mango Pomelo Sago', basePrice: 580, tag: 'Signature', description: 'Signature Hong Kong-style mango pomelo sago dessert.' },
  { categorySlug: 'sundae', name: 'Oreo Chocolate Sundae', basePrice: 520, tag: 'Popular', description: 'Double Oreo and chocolate indulgence sundae.' },
  { categorySlug: 'sundae', name: 'Strawberry Sundae', basePrice: 420, tag: 'Classic', description: 'Fresh strawberry coulis over vanilla ice cream.' },
  { categorySlug: 'ice-cream', name: 'Vanilla Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Classic creamy vanilla soft serve.' },
  { categorySlug: 'ice-cream', name: 'Chocolate Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Rich chocolate soft serve ice cream.' },
  { categorySlug: 'ice-cream', name: 'Mix Choco Vanilla Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Swirled chocolate and vanilla soft serve.' },
];

const TOPPINGS = [
  { id: 'topping-boba-40g', name: 'Boba 40G (Black Pearls)', extraPrice: 80 },
  { id: 'topping-bobo-25g', name: 'Bobo 25G (Crystal Pearls)', extraPrice: 80 },
  { id: 'topping-jelly-40g', name: 'Jelly 40G', extraPrice: 80 },
];

const ROLES = [
  { id: 'role-system-admin', name: 'SYSTEM_ADMIN' },
  { id: 'role-store-manager', name: 'STORE_MANAGER' },
  { id: 'role-cashier', name: 'CASHIER' },
  { id: 'role-delivery-admin', name: 'DELIVERY_ADMIN' },
  { id: 'role-report-viewer', name: 'REPORT_VIEWER' },
  { id: 'role-delivery-driver', name: 'DELIVERY_DRIVER' },
];

const MANAGER_MENUS = [
  'DASHBOARD', 'REPORTS', 'ORDERS', 'DELIVERY', 'POS', 'MENU', 'STOCK', 'WALLET', 'SALES', 'PAYMENT_HISTORY',
];

const CASHIER_MENUS = ['DASHBOARD', 'ORDERS', 'POS', 'DELIVERY', 'LIVE_DRIVERS'];

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

const DISTRICTS = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Kurunegala', 'Matara', 'Galle'];

const STREET_NAMES = [
  'Galle Road', 'Havelock Road', 'High Level Road', 'Duplication Road', 'Main Street',
  'Park Road', 'Temple Road', 'Lake Road', 'Station Road', 'School Lane',
  'Hospital Road', 'Market Street', 'Church Road', 'Garden Lane', 'Flower Road',
];

const ORDER_NOTES = [
  'Less ice please', 'Extra sugar', 'No sugar please', 'Add extra boba',
  'Please deliver to the gate', 'Ring the doorbell twice', 'Leave at the door',
  'Call before delivery', null, null, null, null,
];

const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;
const PAYMENT_METHODS = ['CARD', 'PAYHERE', 'CASH_AT_COUNTER', 'LOYALTY_POINTS'] as const;
const ORDER_MODES = ['DELIVERY', 'TAKEAWAY'] as const;
const PRODUCT_SIZES = ['REGULAR', 'LARGE'] as const;

const DEFAULT_PAYMENT_METHODS = {
  PAYHERE: { enabled: true, label: 'Online Payment', icon: '💳', modes: ['DELIVERY', 'TAKEAWAY'] },
  CARD: { enabled: false, label: 'Online Payment', icon: '💳', modes: ['DELIVERY', 'TAKEAWAY'] },
  CASH_AT_COUNTER: { enabled: false, label: 'Cash at Counter', icon: '🏪', modes: ['TAKEAWAY'] },
};

const DRINK_SLUGS = new Set(['bubble-tea', 'milk-tea', 'fruit-tea']);

const ORDERS_PER_STORE = 110;
const TEST_USER_COUNT = 150;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// ─── Build product catalog with stable IDs ───────────────────────────────────

const catSlugToId = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.id]));

const productCatalog = PRODUCTS.map((p, i) => {
  const slug = slugify(p.name);
  return {
    id: `prod-${slug}`,
    categoryId: catSlugToId[p.categorySlug],
    categorySlug: p.categorySlug,
    slug,
    name: p.name,
    description: p.description ?? null,
    basePrice: p.basePrice,
    tag: p.tag ?? null,
    imageUrl: PRODUCT_IMAGES[p.name] ?? null,
    sortOrder: i,
    hasToppings: DRINK_SLUGS.has(p.categorySlug),
  };
});

// ─── Main generator ──────────────────────────────────────────────────────────

async function generate(): Promise<string> {
  const customerHash = await bcrypt.hash('Customer@123', 12);
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const branchHash = await bcrypt.hash('Branch@123', 12);
  const cashierHash = await bcrypt.hash('Cashier@123', 12);
  const driverHash = await bcrypt.hash('1234', 12);

  const storeRows = BINGCHUN_STORES.map((s) => {
    const id = storeIdFromName(s.name);
    const { legacyNames: _legacyNames, ...rest } = s;
    return { ...rest, id, deliveryEnabled: isDeliveryEnabledStore(id) };
  });

  const nugegodaStore = storeRows.find((s) => s.name.includes('Nugegoda'))!;
  const dehiwalaStore = storeRows.find((s) => s.name === 'Bing Chun - Dehiwala')!;
  const rathmalanaStore = storeRows.find((s) => s.name.includes('Ratmalana'))!;

  const demoPinLookup = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${nugegodaStore.id}:1234`)
    .digest('hex');

  const sections: string[] = [];

  sections.push(`-- =============================================================================
-- Bing Chun Delivery — Full MySQL Seed (core + dummy volume)
-- Generated by prisma/generate-seed-sql.ts — do not edit by hand.
--
-- Prerequisites: schema must exist (npx prisma db push)
--
-- Apply:
--   mysql -u bingchun -p bingchun < prisma/seed-full.sql
--   mysql -u root -p bingchun_delivery < prisma/seed-full.sql
--
-- Demo accounts:
--   Customer:  customer@bingchun.lk / Customer@123  (phone 0771234567)
--   Super Admin: admin@bingchunsrilanka.lk / Admin@123
--   Branch Manager (Nugegoda): branch@bingchunsrilanka.lk / Branch@123
--   Branch Manager (Dehiwala): dehiwala@bingchunsrilanka.lk / Branch@123
--   Branch Manager (Rathmalana): rathmalana@bingchunsrilanka.lk / Branch@123
--   Cashier (Nugegoda): cashier@bingchunsrilanka.lk / Cashier@123
--   Delivery Driver PIN: 1234 (Nugegoda) — JWT_SECRET must be '${JWT_SECRET}'
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
`);

  // ── Cleanup transactional / dummy data ────────────────────────────────────
  sections.push(`-- ── Cleanup (transactional / test data) ─────────────────────────────────────
DELETE FROM commission_settlements;
DELETE FROM store_withdrawals;
DELETE FROM wallet_transactions;
DELETE FROM store_wallets;
DELETE FROM delivery_job_orders;
DELETE FROM delivery_jobs;
DELETE FROM platform_ratings;
DELETE FROM rider_ratings;
DELETE FROM notifications;
DELETE FROM admin_notifications;
DELETE FROM customer_notifications;
DELETE FROM loyalty_transactions;
DELETE FROM order_status_events;
DELETE FROM order_item_toppings;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM addresses WHERE userId IN (SELECT id FROM users WHERE email LIKE '%@bingchun-test.lk');
DELETE FROM users WHERE email LIKE '%@bingchun-test.lk';
`);

  // ── Roles ─────────────────────────────────────────────────────────────────
  sections.push(`-- ── Roles ───────────────────────────────────────────────────────────────────
${upsertBatch(
  'roles',
  ['id', 'name'],
  ROLES.map((r) => ({ id: r.id, name: r.name })),
  ['name'],
)}
`);

  // ── Settings ──────────────────────────────────────────────────────────────
  sections.push(`-- ── Settings ────────────────────────────────────────────────────────────────
INSERT INTO \`loyalty_settings\` (\`id\`, \`pointsPerLkr\`, \`redeemValue\`, \`maxRedeemPct\`, \`minOrderToEarn\`)
VALUES ('default', 0.01, 1.0, 100, 200)
ON DUPLICATE KEY UPDATE \`pointsPerLkr\`=VALUES(\`pointsPerLkr\`), \`redeemValue\`=VALUES(\`redeemValue\`), \`maxRedeemPct\`=VALUES(\`maxRedeemPct\`), \`minOrderToEarn\`=VALUES(\`minOrderToEarn\`);

INSERT INTO \`app_settings\` (\`id\`, \`convenientFeeRate\`, \`pickupAllowAddItemsPaidOnline\`, \`pickupAllowEditCashUnpaid\`, \`maxCupsPerRider\`, \`deliveryMilestone1Orders\`, \`deliveryMilestone2Orders\`, \`deliveryMilestone3Orders\`)
VALUES ('default', 0.065, 1, 1, 20, 50, 150, 300)
ON DUPLICATE KEY UPDATE \`convenientFeeRate\`=VALUES(\`convenientFeeRate\`), \`maxCupsPerRider\`=VALUES(\`maxCupsPerRider\`);

INSERT INTO \`system_settings\` (\`id\`, \`paymentMethods\`, \`payhereMerchantId\`, \`payhereMerchantSecret\`, \`payhereMode\`, \`updatedAt\`)
VALUES ('default', ${escJson(DEFAULT_PAYMENT_METHODS)}, NULL, NULL, 'sandbox', NOW(3))
ON DUPLICATE KEY UPDATE \`paymentMethods\`=VALUES(\`paymentMethods\`), \`payhereMode\`=VALUES(\`payhereMode\`);
`);

  // ── Categories ────────────────────────────────────────────────────────────
  sections.push(`-- ── Categories ──────────────────────────────────────────────────────────────
${upsertBatch(
  'categories',
  ['id', 'name', 'slug', 'icon', 'sortOrder', 'isActive'],
  CATEGORIES.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, sortOrder: c.sortOrder, isActive: true })),
  ['name', 'icon', 'sortOrder', 'isActive'],
)}
`);

  // ── Toppings ──────────────────────────────────────────────────────────────
  sections.push(`-- ── Toppings ────────────────────────────────────────────────────────────────
${upsertBatch(
  'toppings',
  ['id', 'name', 'extraPrice', 'isAvailable'],
  TOPPINGS.map((t) => ({ id: t.id, name: t.name, extraPrice: t.extraPrice, isAvailable: true })),
  ['extraPrice', 'isAvailable'],
)}
`);

  // ── Products ──────────────────────────────────────────────────────────────
  sections.push(`-- ── Products ────────────────────────────────────────────────────────────────
${upsertBatch(
  'products',
  ['id', 'categoryId', 'name', 'slug', 'description', 'basePrice', 'imageUrl', 'tag', 'isAvailable', 'isDeliveryAvailable', 'isCombo', 'sortOrder'],
  productCatalog.map((p) => ({
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    basePrice: p.basePrice,
    imageUrl: p.imageUrl,
    tag: p.tag,
    isAvailable: true,
    isDeliveryAvailable: true,
    isCombo: false,
    sortOrder: p.sortOrder,
  })),
  ['categoryId', 'name', 'description', 'basePrice', 'imageUrl', 'tag', 'sortOrder'],
)}
`);

  // ── Product toppings ──────────────────────────────────────────────────────
  const productToppingRows: Row[] = [];
  for (const p of productCatalog.filter((x) => x.hasToppings)) {
    for (const t of TOPPINGS) {
      productToppingRows.push({ productId: p.id, toppingId: t.id });
    }
  }
  sections.push(`-- ── Product toppings ────────────────────────────────────────────────────────
${upsertBatch('product_toppings', ['productId', 'toppingId'], productToppingRows, ['productId'])}
`);

  // ── Stores ────────────────────────────────────────────────────────────────
  sections.push(`-- ── Stores ──────────────────────────────────────────────────────────────────
${upsertBatch(
  'stores',
  ['id', 'name', 'addressLine', 'city', 'district', 'lat', 'lng', 'openTime', 'closeTime', 'isActive', 'isBusy', 'deliveryEnabled'],
  storeRows.map((s) => ({
    id: s.id,
    name: s.name,
    addressLine: s.addressLine,
    city: s.city,
    district: s.district,
    lat: s.lat,
    lng: s.lng,
    openTime: s.openTime ?? '09:00',
    closeTime: s.closeTime ?? '23:00',
    isActive: true,
    isBusy: false,
    deliveryEnabled: s.deliveryEnabled,
  })),
  ['name', 'addressLine', 'city', 'district', 'lat', 'lng', 'isActive', 'deliveryEnabled'],
)}
`);

  // ── Delivery zones ────────────────────────────────────────────────────────
  const zoneRows: Row[] = [];
  for (const s of storeRows) {
    zoneRows.push(
      { id: `zone-${s.id}-5km`, storeId: s.id, name: 'Zone 1 (0-5 km)', radiusKm: 5, fee: 150, minOrder: 500, isActive: true, isGlobal: false },
      { id: `zone-${s.id}-10km`, storeId: s.id, name: 'Zone 2 (5-10 km)', radiusKm: 10, fee: 300, minOrder: 800, isActive: true, isGlobal: false },
    );
  }
  sections.push(`-- ── Delivery zones ────────────────────────────────────────────────────────
${upsertBatch(
  'delivery_zones',
  ['id', 'storeId', 'name', 'radiusKm', 'fee', 'minOrder', 'isActive', 'isGlobal'],
  zoneRows,
  ['name', 'radiusKm', 'fee', 'minOrder', 'isActive'],
)}
`);

  // ── Store products ────────────────────────────────────────────────────────
  const storeProductRows: Row[] = [];
  for (const s of storeRows) {
    for (const p of productCatalog) {
      storeProductRows.push({ storeId: s.id, productId: p.id, stock: 50, isAvailable: true });
    }
  }
  sections.push(`-- ── Store products (inventory) ──────────────────────────────────────────────
${upsertBatch(
  'store_products',
  ['storeId', 'productId', 'stock', 'isAvailable'],
  storeProductRows,
  ['stock', 'isAvailable'],
)}
`);

  // ── Promo codes ───────────────────────────────────────────────────────────
  const promoRows: Row[] = [
    { id: 'promo-welcome10', code: 'WELCOME10', description: '10% off your first order', discountType: 'PERCENTAGE', discountValue: 10, minOrderValue: 500, maxUses: 1000, usedCount: 0, isActive: true },
    { id: 'promo-bingchun50', code: 'BINGCHUN50', description: 'LKR 50 off orders above LKR 800', discountType: 'FIXED', discountValue: 50, minOrderValue: 800, maxUses: null, usedCount: 0, isActive: true },
    { id: 'promo-summer25', code: 'SUMMER25', description: '25% off summer specials', discountType: 'PERCENTAGE', discountValue: 25, minOrderValue: 500, maxUses: 500, usedCount: 0, isActive: true },
    { id: 'promo-boba100', code: 'BOBA100', description: 'LKR 100 off on Boba orders', discountType: 'FIXED', discountValue: 100, minOrderValue: 600, maxUses: 300, usedCount: 0, isActive: true },
    { id: 'promo-newapp20', code: 'NEWAPP20', description: '20% off for new app users', discountType: 'PERCENTAGE', discountValue: 20, minOrderValue: 400, maxUses: 1000, usedCount: 0, isActive: true },
    { id: 'promo-freedelivery', code: 'FREEDELIVERY', description: 'Free delivery on orders above 1000', discountType: 'FIXED', discountValue: 150, minOrderValue: 1000, maxUses: 200, usedCount: 0, isActive: true },
    { id: 'promo-weekend15', code: 'WEEKEND15', description: '15% off weekend orders', discountType: 'PERCENTAGE', discountValue: 15, minOrderValue: 300, maxUses: 500, usedCount: 0, isActive: true },
    { id: 'promo-loyalty200', code: 'LOYALTY200', description: 'LKR 200 off for loyalty members', discountType: 'FIXED', discountValue: 200, minOrderValue: 800, maxUses: 100, usedCount: 0, isActive: true },
    { id: 'promo-birthday30', code: 'BIRTHDAY30', description: '30% off birthday orders', discountType: 'PERCENTAGE', discountValue: 30, minOrderValue: 500, maxUses: 500, usedCount: 0, isActive: true },
    { id: 'promo-expired10', code: 'EXPIRED10', description: 'Expired 10% promo', discountType: 'PERCENTAGE', discountValue: 10, minOrderValue: 200, maxUses: 100, usedCount: 0, isActive: false, expiresAt: new Date('2025-12-31') },
  ];
  sections.push(`-- ── Promo codes ─────────────────────────────────────────────────────────────
${upsertBatch(
  'promo_codes',
  ['id', 'code', 'description', 'discountType', 'discountValue', 'minOrderValue', 'maxUses', 'usedCount', 'isActive', 'expiresAt'],
  promoRows,
  ['description', 'discountType', 'discountValue', 'minOrderValue', 'maxUses', 'isActive'],
)}
`);

  // ── Demo customer ─────────────────────────────────────────────────────────
  sections.push(`-- ── Demo customer ───────────────────────────────────────────────────────────
INSERT INTO \`users\` (\`id\`, \`name\`, \`email\`, \`phone\`, \`passwordHash\`, \`isEmailVerified\`, \`isPhoneVerified\`, \`loyaltyPoints\`)
VALUES ('user-demo-customer', 'Demo Customer', 'customer@bingchun.lk', '0771234567', ${esc(customerHash)}, 0, 1, 0)
ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`), \`passwordHash\`=VALUES(\`passwordHash\`);
`);

  // ── Admin users ───────────────────────────────────────────────────────────
  const adminUsers: { id: string; email: string; name: string; hash: string; roleId: string; storeId: string | null; pinLookup: string | null }[] = [
    { id: 'admin-system', email: 'admin@bingchunsrilanka.lk', name: 'System Admin', hash: adminHash, roleId: 'role-system-admin', storeId: null, pinLookup: null },
    { id: 'admin-branch-nugegoda', email: 'branch@bingchunsrilanka.lk', name: 'Nugegoda Branch Manager', hash: branchHash, roleId: 'role-store-manager', storeId: nugegodaStore.id, pinLookup: null },
    { id: 'admin-branch-dehiwala', email: 'dehiwala@bingchunsrilanka.lk', name: 'Dehiwala Branch Manager', hash: branchHash, roleId: 'role-store-manager', storeId: dehiwalaStore.id, pinLookup: null },
    { id: 'admin-branch-rathmalana', email: 'rathmalana@bingchunsrilanka.lk', name: 'Rathmalana Branch Manager', hash: branchHash, roleId: 'role-store-manager', storeId: rathmalanaStore.id, pinLookup: null },
    { id: 'admin-cashier-nugegoda', email: 'cashier@bingchunsrilanka.lk', name: 'Nugegoda Cashier', hash: cashierHash, roleId: 'role-cashier', storeId: nugegodaStore.id, pinLookup: null },
    { id: 'admin-driver-nugegoda', email: 'delivery@bingchunsrilanka.lk', name: 'Nugegoda Delivery Driver', hash: driverHash, roleId: 'role-delivery-driver', storeId: nugegodaStore.id, pinLookup: demoPinLookup },
  ];

  sections.push(`-- ── Admin users ─────────────────────────────────────────────────────────────
${upsertBatch(
  'admin_users',
  ['id', 'name', 'email', 'passwordHash', 'pinLookup', 'roleId', 'storeId', 'isActive'],
  adminUsers.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    passwordHash: a.hash,
    pinLookup: a.pinLookup,
    roleId: a.roleId,
    storeId: a.storeId,
    isActive: true,
  })),
  ['name', 'passwordHash', 'pinLookup', 'roleId', 'storeId'],
)}
`);

  // ── Permissions ─────────────────────────────────────────────────────────────
  const permissionRows: Row[] = [];
  for (const menu of MANAGER_MENUS) {
    permissionRows.push({
      id: `perm-mgr-nugegoda-${menu.toLowerCase()}`,
      adminUserId: 'admin-branch-nugegoda',
      menu,
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
    });
    permissionRows.push({
      id: `perm-mgr-dehiwala-${menu.toLowerCase()}`,
      adminUserId: 'admin-branch-dehiwala',
      menu,
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
    });
    permissionRows.push({
      id: `perm-mgr-rathmalana-${menu.toLowerCase()}`,
      adminUserId: 'admin-branch-rathmalana',
      menu,
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
    });
  }
  for (const menu of CASHIER_MENUS) {
    permissionRows.push({
      id: `perm-cashier-${menu.toLowerCase()}`,
      adminUserId: 'admin-cashier-nugegoda',
      menu,
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
    });
  }
  sections.push(`-- ── Permissions ─────────────────────────────────────────────────────────────
${upsertBatch(
  'permissions',
  ['id', 'adminUserId', 'menu', 'canCreate', 'canRead', 'canUpdate', 'canDelete'],
  permissionRows,
  ['canCreate', 'canRead', 'canUpdate', 'canDelete'],
)}
`);

  // ── Test users ──────────────────────────────────────────────────────────────
  const testUserRows: Row[] = [];
  const testUserIds: string[] = [];
  for (let i = 0; i < TEST_USER_COUNT; i++) {
    const id = `user-test-${padNum(i + 1, 3)}`;
    testUserIds.push(id);
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    testUserRows.push({
      id,
      name: `${firstName} ${lastName}`,
      email: `test.user${i + 1}@bingchun-test.lk`,
      phone: `077${padNum(1000000 + i, 7)}`,
      passwordHash: '$2a$12$dummyHashForTestingOnlyXXXXXXXXXXXXXXXXXXXXXXXXXX',
      isEmailVerified: i % 3 !== 0,
      isPhoneVerified: true,
      loyaltyPoints: (i * 37) % 5001,
      createdAt: randomDate(180, i),
    });
  }
  sections.push(`-- ── Test customers (${TEST_USER_COUNT}) ─────────────────────────────────────────
${insertBatch('users', ['id', 'name', 'email', 'phone', 'passwordHash', 'isEmailVerified', 'isPhoneVerified', 'loyaltyPoints', 'createdAt'], testUserRows)}
`);

  // ── Addresses ─────────────────────────────────────────────────────────────
  const addressRows: Row[] = [];
  const addressMap: Record<string, string[]> = {};
  let addrCounter = 0;
  for (const userId of testUserIds) {
    const numAddresses = 1 + (addrCounter % 3);
    addressMap[userId] = [];
    for (let a = 0; a < numAddresses; a++) {
      const addrId = `addr-test-${padNum(++addrCounter, 4)}`;
      addressMap[userId].push(addrId);
      const city = CITIES[addrCounter % CITIES.length];
      addressRows.push({
        id: addrId,
        userId,
        label: a === 0 ? 'Home' : a === 1 ? 'Office' : 'Other',
        addressLine: `${(addrCounter % 500) + 1} ${STREET_NAMES[addrCounter % STREET_NAMES.length]}`,
        city,
        district: DISTRICTS[addrCounter % DISTRICTS.length],
        lat: 6.7 + (addrCounter % 50) / 100,
        lng: 79.8 + (addrCounter % 30) / 100,
        isDefault: a === 0,
        createdAt: randomDate(150, addrCounter),
      });
    }
  }
  sections.push(`-- ── Test addresses ──────────────────────────────────────────────────────────
${insertBatch('addresses', ['id', 'userId', 'label', 'addressLine', 'city', 'district', 'lat', 'lng', 'isDefault', 'createdAt'], addressRows)}
`);

  // ── Orders ────────────────────────────────────────────────────────────────
  const orderRows: Row[] = [];
  const orderItemRows: Row[] = [];
  const orderItemToppingRows: Row[] = [];
  const statusEventRows: Row[] = [];
  const allOrderIds: string[] = [];
  const storeOrderMap: Record<string, string[]> = {};
  let globalOrderCounter = 1000;
  let orderItemCounter = 0;
  let statusEventCounter = 0;

  for (const store of storeRows) {
    storeOrderMap[store.id] = [];
    const appOrderCount = Math.floor(ORDERS_PER_STORE * 0.5);

    for (let i = 0; i < ORDERS_PER_STORE; i++) {
      globalOrderCounter++;
      const orderId = `order-${store.id.replace(/^store-/, '')}-${padNum(i + 1, 4)}`;
      allOrderIds.push(orderId);
      storeOrderMap[store.id].push(orderId);

      const isApp = i < appOrderCount;
      const platform = isApp ? 1 : 0;
      const userId = testUserIds[i % testUserIds.length];
      const orderMode = ORDER_MODES[i % ORDER_MODES.length];
      const createdAt = randomDate(90, globalOrderCounter);

      const statusRoll = (globalOrderCounter % 100) / 100;
      let status: string;
      if (statusRoll < 0.45) status = 'DELIVERED';
      else if (statusRoll < 0.60) status = 'PREPARING';
      else if (statusRoll < 0.72) status = 'READY';
      else if (statusRoll < 0.82) status = 'OUT_FOR_DELIVERY';
      else if (statusRoll < 0.92) status = 'RECEIVED';
      else status = 'CANCELLED';

      let paymentMethod: string;
      if (isApp) {
        const pm = globalOrderCounter % 100;
        if (pm < 40) paymentMethod = 'PAYHERE';
        else if (pm < 75) paymentMethod = 'CARD';
        else paymentMethod = 'LOYALTY_POINTS';
      } else {
        const pm = globalOrderCounter % 100;
        if (pm < 35) paymentMethod = 'CARD';
        else if (pm < 65) paymentMethod = 'PAYHERE';
        else paymentMethod = 'CASH_AT_COUNTER';
      }
      if (orderMode === 'DELIVERY' && paymentMethod === 'CASH_AT_COUNTER') {
        paymentMethod = 'PAYHERE';
      }

      const paymentStatus =
        status === 'CANCELLED'
          ? 'REFUNDED'
          : paymentMethod === 'CASH_AT_COUNTER'
            ? status === 'DELIVERED'
              ? 'PAID'
              : 'PENDING'
            : 'PAID';

      const numItems = 1 + (globalOrderCounter % 5);
      let subtotal = 0;

      for (let j = 0; j < numItems; j++) {
        orderItemCounter++;
        const product = productCatalog[(globalOrderCounter + j) % productCatalog.length];
        const size = PRODUCT_SIZES[(globalOrderCounter + j) % PRODUCT_SIZES.length];
        const quantity = 1 + ((globalOrderCounter + j) % 3);
        const sizeMultiplier = size === 'LARGE' ? 1.3 : 1;
        const unitPrice = Math.round(product.basePrice * sizeMultiplier);
        const totalPrice = unitPrice * quantity;
        subtotal += totalPrice;

        const orderItemId = `oi-${padNum(orderItemCounter, 6)}`;
        orderItemRows.push({
          id: orderItemId,
          orderId,
          productId: product.id,
          productName: product.name,
          size,
          quantity,
          unitPrice,
          totalPrice,
        });

        if (product.hasToppings && globalOrderCounter % 3 === 0) {
          const topping = TOPPINGS[j % TOPPINGS.length];
          orderItemToppingRows.push({
            orderItemId,
            toppingId: topping.id,
            toppingName: topping.name,
            extraPrice: topping.extraPrice,
          });
          subtotal += topping.extraPrice * quantity;
        }
      }

      const deliveryFee = orderMode === 'DELIVERY' ? (globalOrderCounter % 2 === 0 ? 150 : 300) : 0;
      const convenientFee = Math.round(subtotal * 0.065);
      const discount = globalOrderCounter % 5 === 0 ? 50 + (globalOrderCounter % 151) : 0;
      const total = subtotal + deliveryFee + convenientFee - discount;

      const userAddresses = addressMap[userId] || [];
      const addressId =
        orderMode === 'DELIVERY' && userAddresses.length > 0
          ? userAddresses[globalOrderCounter % userAddresses.length]
          : null;
      const deliveryZoneId =
        orderMode === 'DELIVERY' ? (globalOrderCounter % 2 === 0 ? `zone-${store.id}-5km` : `zone-${store.id}-10km`) : null;

      const promoCodes = ['WELCOME10', 'BINGCHUN50', 'SUMMER25', 'BOBA100', 'NEWAPP20'];

      orderRows.push({
        id: orderId,
        orderNumber: `BC-${padNum(globalOrderCounter, 6)}`,
        userId,
        storeId: store.id,
        deliveryZoneId,
        addressId,
        orderMode,
        status,
        paymentMethod,
        paymentStatus,
        paymentRef: paymentStatus === 'PAID' ? `PAY-${padNum(globalOrderCounter, 8)}` : null,
        subtotal,
        deliveryFee,
        convenientFee,
        discount,
        loyaltyDiscount: 0,
        total,
        prepaidAmount:
          paymentStatus === 'PAID' && paymentMethod !== 'CASH_AT_COUNTER'
            ? total
            : 0,
        promoCode: discount > 0 ? promoCodes[globalOrderCounter % promoCodes.length] : null,
        pickupTime: orderMode === 'TAKEAWAY' ? `${10 + (globalOrderCounter % 13)}:${['00', '15', '30', '45'][globalOrderCounter % 4]}` : null,
        estimatedMinutes: 15 + (globalOrderCounter % 31),
        notes: ORDER_NOTES[globalOrderCounter % ORDER_NOTES.length],
        deliveryAddressLine:
          orderMode === 'DELIVERY' ? `${(globalOrderCounter % 500) + 1} ${STREET_NAMES[globalOrderCounter % STREET_NAMES.length]}` : null,
        deliveryCity: orderMode === 'DELIVERY' ? CITIES[globalOrderCounter % CITIES.length] : null,
        deliveryDistrict: orderMode === 'DELIVERY' ? DISTRICTS[globalOrderCounter % DISTRICTS.length] : null,
        deliveryLat: orderMode === 'DELIVERY' ? 6.7 + (globalOrderCounter % 50) / 100 : null,
        deliveryLng: orderMode === 'DELIVERY' ? 79.8 + (globalOrderCounter % 30) / 100 : null,
        platform,
        createdAt,
      });

      const statusFlow: string[] = [];
      if (status === 'CANCELLED') {
        statusFlow.push('RECEIVED', 'CANCELLED');
      } else {
        const statusIndex = ORDER_STATUSES.indexOf(status as (typeof ORDER_STATUSES)[number]);
        for (let s = 0; s <= statusIndex; s++) {
          if (ORDER_STATUSES[s] !== 'CANCELLED') statusFlow.push(ORDER_STATUSES[s]);
        }
      }

      let eventTime = new Date(createdAt);
      for (const eventStatus of statusFlow) {
        statusEventCounter++;
        statusEventRows.push({
          id: `ose-${padNum(statusEventCounter, 7)}`,
          orderId,
          status: eventStatus,
          note: eventStatus === 'CANCELLED' ? 'Customer requested' : null,
          createdAt: new Date(eventTime),
        });
        eventTime = new Date(eventTime.getTime() + (2 + (statusEventCounter % 14)) * 60 * 1000);
      }
    }
  }

  sections.push(`-- ── Orders (${orderRows.length} across ${storeRows.length} stores) ─────────────────────
${insertBatch('orders', [
  'id', 'orderNumber', 'userId', 'storeId', 'deliveryZoneId', 'addressId', 'orderMode', 'status',
  'paymentMethod', 'paymentStatus', 'paymentRef', 'subtotal', 'deliveryFee', 'convenientFee', 'discount',
  'loyaltyDiscount', 'total', 'prepaidAmount', 'promoCode', 'pickupTime', 'estimatedMinutes', 'notes',
  'deliveryAddressLine', 'deliveryCity', 'deliveryDistrict', 'deliveryLat', 'deliveryLng', 'platform', 'createdAt',
], orderRows, 40)}

-- ── Order items
${insertBatch('order_items', ['id', 'orderId', 'productId', 'productName', 'size', 'quantity', 'unitPrice', 'totalPrice'], orderItemRows, 60)}

-- ── Order item toppings
${insertBatch('order_item_toppings', ['orderItemId', 'toppingId', 'toppingName', 'extraPrice'], orderItemToppingRows, 80)}

-- ── Order status events
${insertBatch('order_status_events', ['id', 'orderId', 'status', 'note', 'createdAt'], statusEventRows, 80)}
`);

  // ── Loyalty transactions ────────────────────────────────────────────────────
  const loyaltyRows: Row[] = [];
  let loyaltyCounter = 0;
  for (const userId of testUserIds) {
    const numTxns = 2 + (loyaltyCounter % 7);
    for (let i = 0; i < numTxns; i++) {
      loyaltyCounter++;
      const type = loyaltyCounter % 10 < 7 ? 'EARNED' : 'REDEEMED';
      loyaltyRows.push({
        id: `loyalty-${padNum(loyaltyCounter, 5)}`,
        userId,
        orderId: allOrderIds[loyaltyCounter % allOrderIds.length],
        points: type === 'EARNED' ? 10 + (loyaltyCounter % 191) : -(10 + (loyaltyCounter % 91)),
        type,
        note: type === 'EARNED' ? 'Points earned from order' : 'Points redeemed on order',
        createdAt: randomDate(90, loyaltyCounter),
      });
    }
  }
  sections.push(`-- ── Loyalty transactions ──────────────────────────────────────────────────
${insertBatch('loyalty_transactions', ['id', 'userId', 'orderId', 'points', 'type', 'note', 'createdAt'], loyaltyRows, 80)}
`);

  // ── Customer notifications ──────────────────────────────────────────────────
  const customerNotifRows: Row[] = [];
  const notifTypes = ['ORDER_STATUS', 'PROMO', 'LOYALTY', 'GENERAL'];
  const notifMessages: Record<string, { title: string; message: string }[]> = {
    ORDER_STATUS: [
      { title: 'Order Confirmed', message: 'Your order has been confirmed and is being prepared.' },
      { title: 'Order Ready', message: 'Your order is ready for pickup!' },
      { title: 'Out for Delivery', message: 'Your order is on its way to you.' },
      { title: 'Order Delivered', message: 'Your order has been delivered. Enjoy!' },
    ],
    PROMO: [
      { title: 'Special Offer!', message: 'Get 25% off on all bubble tea this weekend! Use code WEEKEND15.' },
      { title: 'New Menu Item', message: 'Try our new Grape Bobo Tea! Available at all branches.' },
    ],
    LOYALTY: [
      { title: 'Points Earned', message: 'You earned 50 loyalty points from your last order!' },
      { title: 'Redeem Your Points', message: 'You have enough points for a free drink! Redeem now.' },
    ],
    GENERAL: [
      { title: 'Welcome to Bing Chun!', message: 'Thanks for joining. Enjoy your first order with code WELCOME10.' },
      { title: 'Rate Your Experience', message: 'How was your last order? Rate us and earn bonus points.' },
    ],
  };
  let custNotifCounter = 0;
  for (const userId of testUserIds) {
    const numNotifs = 3 + (custNotifCounter % 8);
    for (let i = 0; i < numNotifs; i++) {
      custNotifCounter++;
      const type = notifTypes[custNotifCounter % notifTypes.length];
      const msgs = notifMessages[type];
      const msg = msgs[custNotifCounter % msgs.length];
      customerNotifRows.push({
        id: `cnotif-${padNum(custNotifCounter, 5)}`,
        userId,
        type,
        title: msg.title,
        message: msg.message,
        orderId: type === 'ORDER_STATUS' ? allOrderIds[custNotifCounter % allOrderIds.length] : null,
        read: custNotifCounter % 10 < 6,
        createdAt: randomDate(60, custNotifCounter),
      });
    }
  }
  sections.push(`-- ── Customer notifications ──────────────────────────────────────────────────
${insertBatch('customer_notifications', ['id', 'userId', 'type', 'title', 'message', 'orderId', 'read', 'createdAt'], customerNotifRows, 60)}
`);

  // ── Admin notifications ─────────────────────────────────────────────────────
  const adminNotifRows: Row[] = [];
  const adminNotifTypes = ['NEW_ORDER', 'ORDER_CANCELLED', 'LOW_STOCK', 'DELIVERY_COMPLETE'];
  const branchAdmins = adminUsers.filter((a) => a.storeId && a.roleId === 'role-store-manager');
  let adminNotifCounter = 0;
  for (const admin of branchAdmins) {
    const numNotifs = 20 + (adminNotifCounter % 31);
    for (let i = 0; i < numNotifs; i++) {
      adminNotifCounter++;
      const type = adminNotifTypes[adminNotifCounter % adminNotifTypes.length];
      const storeOrders = storeOrderMap[admin.storeId!] || [];
      adminNotifRows.push({
        id: `anotif-${padNum(adminNotifCounter, 5)}`,
        adminUserId: admin.id,
        storeId: admin.storeId!,
        type,
        title:
          type === 'NEW_ORDER'
            ? 'New Order Received'
            : type === 'ORDER_CANCELLED'
              ? 'Order Cancelled'
              : type === 'LOW_STOCK'
                ? 'Low Stock Alert'
                : 'Delivery Completed',
        message:
          type === 'NEW_ORDER'
            ? 'A new order has been placed at your branch.'
            : type === 'ORDER_CANCELLED'
              ? 'An order has been cancelled by the customer.'
              : type === 'LOW_STOCK'
                ? `${productCatalog[adminNotifCounter % productCatalog.length].name} is running low in stock.`
                : 'A delivery has been completed successfully.',
        orderId: storeOrders.length > 0 ? storeOrders[adminNotifCounter % storeOrders.length] : null,
        read: adminNotifCounter % 2 === 0,
        createdAt: randomDate(30, adminNotifCounter),
      });
    }
  }
  sections.push(`-- ── Admin notifications ─────────────────────────────────────────────────────
${insertBatch('admin_notifications', ['id', 'adminUserId', 'storeId', 'type', 'title', 'message', 'orderId', 'read', 'createdAt'], adminNotifRows, 60)}
`);

  // ── Notification logs ───────────────────────────────────────────────────────
  const notifLogRows: Row[] = [];
  const notifLogTypes = ['SMS', 'EMAIL', 'PUSH'] as const;
  for (let i = 0; i < 300; i++) {
    const userId = testUserIds[i % testUserIds.length];
    const type = notifLogTypes[i % notifLogTypes.length];
    notifLogRows.push({
      id: `notif-${padNum(i + 1, 4)}`,
      userId,
      phone: type === 'SMS' ? `077${padNum(1000000 + (i % TEST_USER_COUNT), 7)}` : null,
      email: type === 'EMAIL' ? `test.user${(i % TEST_USER_COUNT) + 1}@bingchun-test.lk` : null,
      type,
      subject: type === 'EMAIL' ? 'Your Bing Chun Order Update' : null,
      message: 'Your order status has been updated. Thank you for choosing Bing Chun!',
      sent: i % 10 !== 0,
      sentAt: i % 10 !== 0 ? randomDate(60, i) : null,
      createdAt: randomDate(60, i + 100),
    });
  }
  sections.push(`-- ── Notification logs ─────────────────────────────────────────────────────────
${insertBatch('notifications', ['id', 'userId', 'phone', 'email', 'type', 'subject', 'message', 'sent', 'sentAt', 'createdAt'], notifLogRows, 60)}
`);

  // ── Delivery jobs ───────────────────────────────────────────────────────────
  const deliveryJobRows: Row[] = [];
  const deliveryJobOrderRows: Row[] = [];
  let jobCounter = 0;
  const jobStatuses = ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED', 'COMPLETED'] as const;

  for (const store of storeRows) {
    const deliveryOrderIds = (storeOrderMap[store.id] || []).slice(0, 30);
    if (deliveryOrderIds.length === 0) continue;

    const numJobs = 5 + (jobCounter % 6);
    for (let j = 0; j < numJobs; j++) {
      jobCounter++;
      const jobId = `djob-${store.id.replace(/^store-/, '')}-${padNum(j + 1, 2)}`;
      const jobStatus = jobStatuses[jobCounter % jobStatuses.length];
      const scheduledAt = randomDate(30, jobCounter);

      deliveryJobRows.push({
        id: jobId,
        storeId: store.id,
        driverId: jobStatus !== 'SCHEDULED' ? 'admin-driver-nugegoda' : null,
        title: `Delivery Run ${j + 1} - ${store.name.replace('Bing Chun - ', '')}`,
        status: jobStatus,
        scheduledAt,
        assignedAt: jobStatus !== 'SCHEDULED' ? new Date(scheduledAt.getTime() + 5 * 60000) : null,
        startedAt: ['IN_PROGRESS', 'COMPLETED'].includes(jobStatus) ? new Date(scheduledAt.getTime() + 10 * 60000) : null,
        completedAt: jobStatus === 'COMPLETED' ? new Date(scheduledAt.getTime() + 45 * 60000) : null,
      });

      const ordersForJob = deliveryOrderIds.slice(0, 2 + (j % 4));
      for (let seq = 0; seq < ordersForJob.length; seq++) {
        deliveryJobOrderRows.push({ jobId, orderId: ordersForJob[seq], sequence: seq + 1 });
      }
    }
  }
  sections.push(`-- ── Delivery jobs ─────────────────────────────────────────────────────────────
${insertBatch('delivery_jobs', ['id', 'storeId', 'driverId', 'title', 'status', 'scheduledAt', 'assignedAt', 'startedAt', 'completedAt'], deliveryJobRows, 40)}

-- ── Delivery job orders
${insertBatch('delivery_job_orders', ['jobId', 'orderId', 'sequence'], deliveryJobOrderRows, 80)}
`);

  // ── Store wallets & transactions ────────────────────────────────────────────
  const walletRows: Row[] = [];
  const walletTxRows: Row[] = [];
  let walletTxCounter = 0;

  for (const store of storeRows) {
    const storeIdx = storeRows.indexOf(store);
    const balance = 50000 + (storeIdx % 451) * 1000;
    const totalEarnings = 500000 + (storeIdx % 1501) * 1000;
    const totalWithdrawn = 100000 + (storeIdx % 701) * 1000;
    walletRows.push({
      id: `wallet-${store.id.replace(/^store-/, '')}`,
      storeId: store.id,
      balance,
      totalEarnings,
      totalWithdrawn,
      currency: 'LKR',
    });

    const numTxns = 20 + (storeIdx % 21);
    let runningBalance = balance;
    const storeOrders = storeOrderMap[store.id] || [];
    const txTypes = ['ORDER_PAYMENT', 'ORDER_PAYMENT', 'ORDER_PAYMENT', 'REFUND', 'ADJUSTMENT'] as const;
    const usedOrderType = new Set<string>();

    for (let t = 0; t < numTxns; t++) {
      walletTxCounter++;
      const txType = txTypes[walletTxCounter % txTypes.length];
      const amount = txType === 'REFUND' ? -(200 + (walletTxCounter % 1801)) : 500 + (walletTxCounter % 4501);
      runningBalance += amount;

      let orderId: string | null = null;
      if (txType !== 'ADJUSTMENT' && storeOrders.length > 0) {
        const candidate = storeOrders[(walletTxCounter + t) % storeOrders.length];
        const key = `${candidate}:${txType}`;
        if (!usedOrderType.has(key)) {
          usedOrderType.add(key);
          orderId = candidate;
        }
      }

      walletTxRows.push({
        id: `wtx-${padNum(walletTxCounter, 6)}`,
        storeId: store.id,
        orderId,
        type: txType,
        amount: Math.abs(amount),
        balanceAfter: Math.max(0, runningBalance),
        paymentMethod: ['CARD', 'PAYHERE'][walletTxCounter % 2],
        description:
          txType === 'ORDER_PAYMENT' ? 'Payment received for order'
            : txType === 'REFUND' ? 'Refund processed'
              : 'Balance adjustment',
        createdAt: randomDate(60, walletTxCounter),
      });
    }
  }
  sections.push(`-- ── Store wallets ───────────────────────────────────────────────────────────
${insertBatch('store_wallets', ['id', 'storeId', 'balance', 'totalEarnings', 'totalWithdrawn', 'currency'], walletRows, 40)}

-- ── Wallet transactions
${insertBatch('wallet_transactions', ['id', 'storeId', 'orderId', 'type', 'amount', 'balanceAfter', 'paymentMethod', 'description', 'createdAt'], walletTxRows, 60)}
`);

  // ── Commission settlements ──────────────────────────────────────────────────
  const settlementRows: Row[] = [];
  let settlementCounter = 0;
  for (const store of storeRows) {
    const numSettlements = 2 + (settlementCounter % 3);
    for (let s = 0; s < numSettlements; s++) {
      settlementCounter++;
      const periodFrom = new Date(Date.now() - (s + 1) * 30 * 24 * 60 * 60 * 1000 - settlementCounter * 3600000);
      const periodTo = new Date(periodFrom.getTime() + 30 * 24 * 60 * 60 * 1000);
      const totalCommission = 5000 + (settlementCounter % 45001);
      const totalProviderFee = 1000 + (settlementCounter % 9001);

      settlementRows.push({
        id: `csettle-${padNum(settlementCounter, 4)}`,
        statementRef: `STMT-${store.id.slice(0, 8)}-${s + 1}`,
        storeId: store.id,
        periodFrom,
        periodTo,
        status: settlementCounter % 3 === 0 ? 'PENDING_VERIFICATION' : 'VERIFIED',
        paymentMethod: ['BANK_TRANSFER', 'CASH', 'ONLINE'][settlementCounter % 3],
        breakdown: JSON.stringify({
          totalOrders: 50 + (settlementCounter % 151),
          totalSales: 100000 + (settlementCounter % 400001),
          commissionRate: 0.15,
          totalCommission,
          totalProviderFee,
          netPayable: totalCommission - totalProviderFee,
        }),
        totalCommission,
        totalProviderFee,
        createdAt: periodTo,
      });
    }
  }
  sections.push(`-- ── Commission settlements ──────────────────────────────────────────────────
${insertBatch('commission_settlements', ['id', 'statementRef', 'storeId', 'periodFrom', 'periodTo', 'status', 'paymentMethod', 'breakdown', 'totalCommission', 'totalProviderFee', 'createdAt'], settlementRows, 40)}
`);

  // ── Nugegoda delivery job for READY orders (from seed.ts) ───────────────────
  const nugegodaReadyOrders = orderRows
    .filter((o) => o.storeId === nugegodaStore.id && o.orderMode === 'DELIVERY' && o.status === 'READY')
    .slice(0, 6)
    .map((o) => o.id as string);

  if (nugegodaReadyOrders.length > 0) {
    const jobOrderLinks = nugegodaReadyOrders.map((orderId, i) => `('djob-nugegoda-seed', ${esc(orderId)}, ${i + 1})`).join(',\n  ');
    sections.push(`-- ── Nugegoda scheduled delivery job (ready orders) ──────────────────────────
INSERT INTO \`delivery_jobs\` (\`id\`, \`storeId\`, \`title\`, \`status\`, \`scheduledAt\`)
VALUES ('djob-nugegoda-seed', ${esc(nugegodaStore.id)}, ${esc(`Nugegoda delivery run (${nugegodaReadyOrders.length} orders)`)}, 'SCHEDULED', NOW(3))
ON DUPLICATE KEY UPDATE \`title\`=VALUES(\`title\`);

INSERT INTO \`delivery_job_orders\` (\`jobId\`, \`orderId\`, \`sequence\`) VALUES
  ${jobOrderLinks}
ON DUPLICATE KEY UPDATE \`sequence\`=VALUES(\`sequence\`);
`);
  }

  sections.push(`SET FOREIGN_KEY_CHECKS = 1;

-- Seed complete.
-- Users: ${TEST_USER_COUNT} test + 1 demo | Orders: ${orderRows.length} | Stores: ${storeRows.length}
`);

  return sections.join('\n');
}

async function main() {
  console.log('Generating seed-full.sql...');
  const sql = await generate();
  const outPath = path.join(__dirname, 'seed-full.sql');
  fs.writeFileSync(outPath, sql, 'utf8');
  const sizeMb = (Buffer.byteLength(sql, 'utf8') / 1024 / 1024).toFixed(2);
  console.log(`✅ Wrote ${outPath} (${sizeMb} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
