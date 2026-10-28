/**
 * Remove test/admin-created products and align DB with the canonical Bing Chun menu.
 * Ensures every active store has a store_products row for each menu item (0 stock, inactive).
 *
 * Run: npm run migrate:bingchun-menu -w @bingchun/backend
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  BINGCHUN_CATEGORIES,
  BINGCHUN_PRODUCTS,
  BINGCHUN_PRODUCT_SLUGS,
  BINGCHUN_TOPPINGS,
  DRINK_CATEGORY_SLUGS,
  productSlug,
} from './data/bingchunMenu';
import { productImageUrl } from '../src/lib/productImages';
import { syncAllStoreProducts, ensureStoreProductsTable } from '../src/lib/storeInventory';

const prisma = new PrismaClient();

async function removeNonCanonicalProducts(): Promise<number> {
  const toRemove = await prisma.product.findMany({
    where: { slug: { notIn: [...BINGCHUN_PRODUCT_SLUGS] } },
    select: { id: true, name: true, slug: true },
  });

  if (toRemove.length === 0) {
    console.log('No non-menu products to delete.');
    return 0;
  }

  console.log(`Removing ${toRemove.length} non-menu product(s):`);
  for (const p of toRemove) {
    console.log(`  - ${p.slug} (${p.name})`);
  }

  const removeIds = toRemove.map((p) => p.id);

  await prisma.storeProductReservation.deleteMany({ where: { productId: { in: removeIds } } });
  await prisma.stockAuditLog.deleteMany({ where: { productId: { in: removeIds } } });

  const cartItems = await prisma.cartItem.findMany({
    where: { productId: { in: removeIds } },
    select: { id: true },
  });
  if (cartItems.length > 0) {
    await prisma.cartItemTopping.deleteMany({
      where: { cartItemId: { in: cartItems.map((c) => c.id) } },
    });
    await prisma.cartItem.deleteMany({ where: { productId: { in: removeIds } } });
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { productId: { in: removeIds } },
    select: { id: true },
  });
  if (orderItems.length > 0) {
    await prisma.orderItemTopping.deleteMany({
      where: { orderItemId: { in: orderItems.map((o) => o.id) } },
    });
    await prisma.orderItem.deleteMany({ where: { productId: { in: removeIds } } });
  }

  await prisma.productTopping.deleteMany({ where: { productId: { in: removeIds } } });
  await prisma.product.deleteMany({ where: { id: { in: removeIds } } });

  return toRemove.length;
}

async function upsertCategories(): Promise<Record<string, string>> {
  const catMap: Record<string, string> = {};
  for (const cat of BINGCHUN_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder, isActive: true },
      create: { name: cat.name, slug: cat.slug, icon: cat.icon, sortOrder: cat.sortOrder },
    });
    catMap[cat.slug] = row.id;
  }
  return catMap;
}

async function upsertToppings() {
  for (const topping of BINGCHUN_TOPPINGS) {
    await prisma.topping.upsert({
      where: { name: topping.name },
      update: { extraPrice: topping.extraPrice, isAvailable: true },
      create: { ...topping, isAvailable: true },
    });
  }
}

async function upsertProducts(catMap: Record<string, string>): Promise<number> {
  let sortOrder = 0;
  for (const p of BINGCHUN_PRODUCTS) {
    const slug = productSlug(p.name);
    const imageUrl = productImageUrl(p.name);
    await prisma.product.upsert({
      where: { slug },
      update: {
        categoryId: catMap[p.categorySlug],
        name: p.name,
        description: p.description,
        basePrice: p.basePrice,
        tag: p.tag ?? null,
        imageUrl: imageUrl ?? null,
        isAvailable: true,
        isDeliveryAvailable: true,
        sortOrder: sortOrder++,
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
  return BINGCHUN_PRODUCTS.length;
}

async function linkDrinkToppings() {
  const allToppings = await prisma.topping.findMany();
  const drinkProducts = await prisma.product.findMany({
    where: { category: { slug: { in: [...DRINK_CATEGORY_SLUGS] } } },
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
}

async function syncAllBranches() {
  await ensureStoreProductsTable();
  const added = await syncAllStoreProducts({ stock: 0, isAvailable: false });
  return added;
}

async function main() {
  console.log('🧋 Bing Chun menu migration\n');

  const removed = await removeNonCanonicalProducts();
  const catMap = await upsertCategories();
  await upsertToppings();
  const productCount = await upsertProducts(catMap);
  await linkDrinkToppings();
  const storeRowsAdded = await syncAllBranches();

  const [finalProducts, finalStoreProducts, stores] = await Promise.all([
    prisma.product.count(),
    prisma.storeProduct.count(),
    prisma.store.count({ where: { isActive: true } }),
  ]);

  console.log('\n✅ Migration complete');
  console.log(`   Removed test products: ${removed}`);
  console.log(`   Canonical menu items:  ${productCount}`);
  console.log(`   Active stores:         ${stores}`);
  console.log(`   New store-product rows: ${storeRowsAdded}`);
  console.log(`   Total products in DB:  ${finalProducts}`);
  console.log(`   Total store_products:  ${finalStoreProducts}`);
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
