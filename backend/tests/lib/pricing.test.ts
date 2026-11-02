import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
    },
    productTopping: {
      findMany: vi.fn(),
    },
  },
}));

import { computeUnitPrice } from '../../src/lib/pricing';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('computeUnitPrice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.productTopping.findMany).mockResolvedValue([]);
  });

  it('returns base price for a regular size', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1',
      basePrice: 450,
      isAvailable: true,
    } as never);

    await expect(computeUnitPrice('prod-1', 'REGULAR', [])).resolves.toBe(450);
  });

  it('adds 100 for large size', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1',
      basePrice: 450,
      isAvailable: true,
    } as never);

    await expect(computeUnitPrice('prod-1', 'LARGE', [])).resolves.toBe(550);
  });

  it('sums topping extra prices for linked toppings', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1',
      basePrice: 450,
      isAvailable: true,
    } as never);
    vi.mocked(prisma.productTopping.findMany).mockResolvedValue([
      { topping: { id: 't1', extraPrice: 50, isAvailable: true, name: 'Pearl' } },
      { topping: { id: 't2', extraPrice: 75, isAvailable: true, name: 'Jelly' } },
    ] as never);

    await expect(computeUnitPrice('prod-1', 'REGULAR', ['t1', 't2'])).resolves.toBe(575);
    expect(prisma.productTopping.findMany).toHaveBeenCalledWith({
      where: { productId: 'prod-1', toppingId: { in: ['t1', 't2'] } },
      include: { topping: true },
    });
  });

  it('throws when a topping is not linked to the product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1',
      basePrice: 450,
      isAvailable: true,
    } as never);
    vi.mocked(prisma.productTopping.findMany).mockResolvedValue([
      { topping: { id: 't1', extraPrice: 50, isAvailable: true, name: 'Pearl' } },
    ] as never);

    await expect(computeUnitPrice('prod-1', 'REGULAR', ['t1', 't2'])).rejects.toMatchObject({
      message: 'Invalid topping selection for this product',
      statusCode: 400,
    } satisfies Partial<AppError>);
  });

  it('throws 404 when product is missing', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

    await expect(computeUnitPrice('missing', 'REGULAR', [])).rejects.toMatchObject({
      message: 'Product not found',
      statusCode: 404,
    } satisfies Partial<AppError>);
  });

  it('throws 400 when product is unavailable', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1',
      basePrice: 450,
      isAvailable: false,
    } as never);

    await expect(computeUnitPrice('prod-1', 'REGULAR', [])).rejects.toMatchObject({
      message: 'Product is currently unavailable',
      statusCode: 400,
    } satisfies Partial<AppError>);
  });
});
