import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { resolveAvailableProductId } from '../../src/lib/resolveProductFk';

describe('resolveAvailableProductId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns canonical id when matched by slug', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({ id: 'prod-blueberry-milkshake' } as never);
    const id = await resolveAvailableProductId('blueberry-milkshake');
    expect(id).toBe('prod-blueberry-milkshake');
  });

  it('throws when product is missing or unavailable', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);
    await expect(resolveAvailableProductId('nope')).rejects.toBeInstanceOf(AppError);
  });
});
