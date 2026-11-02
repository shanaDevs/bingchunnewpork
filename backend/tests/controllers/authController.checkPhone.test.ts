import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

vi.mock('../../src/lib/userAccount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/userAccount')>();
  return {
    ...actual,
    findUserByPhone: vi.fn(),
  };
});

import { checkPhone } from '../../src/controllers/authController';
import { findUserByPhone } from '../../src/lib/userAccount';

describe('checkPhone', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns opaque ok for valid phone without database lookup', async () => {
    const req = createMockReq({ body: { phone: '+94771234567' } });
    const res = createMockRes();

    await checkPhone(req, res, next);

    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ok: true },
    });
  });

  it('returns the same opaque ok for 0-prefixed valid phone', async () => {
    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await checkPhone(req, res, next);

    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ok: true },
    });
  });

  it('forwards validation errors', async () => {
    const req = createMockReq({ body: { phone: '123' } });
    const res = createMockRes();

    await checkPhone(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(findUserByPhone).not.toHaveBeenCalled();
  });
});
