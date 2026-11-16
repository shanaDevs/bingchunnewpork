import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/middleware/auth', () => ({
  requireBranchStoreId: vi.fn(),
}));

vi.mock('../../src/lib/storeOrderingSchema', () => ({
  fetchStoreBranchOperatingRow: vi.fn(),
  updateStoreBranchClosedAt: vi.fn(),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastBranchOperating: vi.fn(),
}));

import {
  closeBranch,
  getBranchOperatingStatus,
  openBranch,
} from '../../src/controllers/branchOperatingController';
import { requireBranchStoreId } from '../../src/middleware/auth';
import {
  fetchStoreBranchOperatingRow,
  updateStoreBranchClosedAt,
} from '../../src/lib/storeOrderingSchema';
import { broadcastBranchOperating } from '../../src/lib/socket';

describe('branchOperatingController', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-1');
  });

  it('returns branchClosedAt from the active store', async () => {
    const closedAt = new Date('2026-10-06T10:00:00.000Z');
    vi.mocked(fetchStoreBranchOperatingRow).mockResolvedValue({
      id: 'store-1',
      isActive: true,
      branchClosedAt: closedAt,
    });

    const res = createMockRes();
    await getBranchOperatingStatus(createMockReq({ user: { role: 'STORE_MANAGER' } }), res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { branchClosedAt: closedAt.toISOString() },
    });
  });

  it('returns 404 when the store is missing or inactive', async () => {
    vi.mocked(fetchStoreBranchOperatingRow).mockResolvedValue(null);
    const res = createMockRes();
    await getBranchOperatingStatus(createMockReq({}), res, next);
    expect(asMockFn(next)).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('closes the branch and returns ISO timestamp', async () => {
    vi.mocked(fetchStoreBranchOperatingRow).mockResolvedValue({
      id: 'store-1',
      isActive: true,
      branchClosedAt: null,
    });
    vi.mocked(updateStoreBranchClosedAt).mockImplementation(async (_id, closedAt) => closedAt);

    const res = createMockRes();
    await closeBranch(createMockReq({}), res, next);

    expect(updateStoreBranchClosedAt).toHaveBeenCalledWith('store-1', expect.any(Date));
    expect(broadcastBranchOperating).toHaveBeenCalledWith({
      storeId: 'store-1',
      branchClosedAt: expect.any(String),
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { branchClosedAt: expect.any(String) },
    });
  });

  it('opens the branch by clearing branchClosedAt', async () => {
    vi.mocked(fetchStoreBranchOperatingRow).mockResolvedValue({
      id: 'store-1',
      isActive: true,
      branchClosedAt: new Date(),
    });
    vi.mocked(updateStoreBranchClosedAt).mockResolvedValue(null);

    const res = createMockRes();
    await openBranch(createMockReq({}), res, next);

    expect(updateStoreBranchClosedAt).toHaveBeenCalledWith('store-1', null);
    expect(broadcastBranchOperating).toHaveBeenCalledWith({
      storeId: 'store-1',
      branchClosedAt: null,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { branchClosedAt: null },
    });
  });
});
