import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

type ProductRow = { id: string; name: string; basePrice: number; isAvailable: boolean };

export function computeUnitPriceFromProduct(
  product: ProductRow,
  size: string,
  toppingLinks: Array<{ topping: { id: string; name: string; extraPrice: number; isAvailable: boolean } }>,
  requestedToppingIds: string[],
): number {
  if (!product.isAvailable) throw new AppError(`${product.name} is currently unavailable`, 400);
  if (requestedToppingIds.length > 0 && toppingLinks.length !== requestedToppingIds.length) {
    throw new AppError('Invalid topping selection for this product', 400);
  }
  const unavailable = toppingLinks.find((l) => !l.topping.isAvailable);
  if (unavailable) {
    throw new AppError(`${unavailable.topping.name} is currently unavailable`, 400);
  }

  let price = product.basePrice;
  if (size === 'LARGE') price += 100;
  price += toppingLinks.reduce((sum, l) => sum + l.topping.extraPrice, 0);
  return price;
}

export async function computeUnitPrice(
  productId: string,
  size: string,
  toppingIds: string[],
): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  if (!product.isAvailable) throw new AppError('Product is currently unavailable', 400);

  const links = toppingIds.length
    ? await prisma.productTopping.findMany({
        where: { productId, toppingId: { in: toppingIds } },
        include: { topping: true },
      })
    : [];

  return computeUnitPriceFromProduct(product, size, links, toppingIds);
}

/** Batch price resolution for checkout — avoids per-line product queries. */
export async function batchResolveLinePricing(
  lines: Array<{ productId: string; size: string; toppingIds: string[] }>,
): Promise<Map<string, { unitPrice: number; toppings: Array<{ toppingId: string; topping: { id: string; name: string; extraPrice: number } }> }>> {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const allToppingIds = [...new Set(lines.flatMap((l) => l.toppingIds))];
  const toppingLinks = allToppingIds.length
    ? await prisma.productTopping.findMany({
        where: { productId: { in: productIds }, toppingId: { in: allToppingIds } },
        include: { topping: true },
      })
    : [];
  const linksByProduct = new Map<string, typeof toppingLinks>();
  for (const link of toppingLinks) {
    const list = linksByProduct.get(link.productId) ?? [];
    list.push(link);
    linksByProduct.set(link.productId, list);
  }

  const out = new Map<string, { unitPrice: number; toppings: Array<{ toppingId: string; topping: { id: string; name: string; extraPrice: number } }> }>();
  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) throw new AppError(`Product not found: ${line.productId}`, 400);

    const productLinks = (linksByProduct.get(line.productId) ?? []).filter((l) =>
      line.toppingIds.includes(l.toppingId),
    );
    const unitPrice = computeUnitPriceFromProduct(product, line.size, productLinks, line.toppingIds);
    out.set(`${line.productId}:${line.size}:${line.toppingIds.join(',')}`, {
      unitPrice,
      toppings: productLinks.map((l) => ({
        toppingId: l.toppingId,
        topping: { id: l.topping.id, name: l.topping.name, extraPrice: l.topping.extraPrice },
      })),
    });
  }
  return out;
}
