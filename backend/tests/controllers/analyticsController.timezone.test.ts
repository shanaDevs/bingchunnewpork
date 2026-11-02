import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn(),
    requireBranchStoreId: vi.fn(),
  };
});

import { getSalesReport, getTopProducts } from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';
import * as reportQueryRange from '../../src/lib/reportQueryRange';
import { resolveBranchStoreId } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

describe('analytics timezone and span guards', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
  });

  it('getTopProducts uses Colombo midnight for custom from/to filters', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-09-08', to: '2026-09-08' },
    });
    const res = createMockRes();

    const rangeSpy = vi.spyOn(reportQueryRange, 'resolveReportDayRange');

    await getTopProducts(req, res, next);

    expect(rangeSpy).toHaveBeenCalledWith('2026-09-08', '2026-09-08');
    const reportRange = rangeSpy.mock.results[0]?.value as ReturnType<
      typeof reportQueryRange.resolveReportDayRange
    >;
    expect(reportRange.gte).toEqual(new Date('2026-09-07T18:30:00.000Z'));
    expect(reportRange.lte).toEqual(new Date('2026-09-08T18:29:59.999Z'));
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();

    rangeSpy.mockRestore();
  });

  it('getSalesReport rejects spans wider than 92 days', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      },
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toContain('92 days');
  });
});
