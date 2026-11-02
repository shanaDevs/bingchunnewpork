import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {},
  Prisma: {},
}));

vi.mock('../../src/lib/spaces', () => ({
  uploadToSpaces: vi.fn(),
}));

vi.mock('../../src/middleware/upload', () => ({
  assertAllowedImageUpload: vi.fn(),
}));

import { promoSchema, promoUpdateSchema } from '../../src/controllers/promoController';

const validMinimalCreate = {
  code: 'ENDDATE1',
  discountValue: 10,
  expiresAt: '2026-09-20T10:00:00.000Z',
};

function expiresAtIssues(result: ReturnType<typeof promoSchema.safeParse> | ReturnType<typeof promoUpdateSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.filter((issue) => issue.path[0] === 'expiresAt');
}

describe('promoSchema expiresAt', () => {
  it('rejects create payload without expiresAt', () => {
    const result = promoSchema.safeParse({
      code: 'ENDDATE1',
      discountValue: 10,
    });
    expect(result.success).toBe(false);
    expect(expiresAtIssues(result).length).toBeGreaterThan(0);
  });

  it('rejects explicit null expiresAt on create', () => {
    const result = promoSchema.safeParse({
      ...validMinimalCreate,
      expiresAt: null,
    });
    expect(result.success).toBe(false);
    expect(expiresAtIssues(result).length).toBeGreaterThan(0);
  });

  it('rejects a non-datetime expiresAt on create', () => {
    const result = promoSchema.safeParse({
      ...validMinimalCreate,
      expiresAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
    expect(expiresAtIssues(result).some((issue) => issue.message === 'End date is required')).toBe(true);
  });

  it('accepts create payload with expiresAt', () => {
    const parsed = promoSchema.parse(validMinimalCreate);
    expect(parsed.expiresAt).toBe('2026-09-20T10:00:00.000Z');
  });
});

describe('promoUpdateSchema expiresAt', () => {
  it('allows partial update without expiresAt (toggle active)', () => {
    const parsed = promoUpdateSchema.parse({ isActive: true });
    expect(parsed.isActive).toBe(true);
    expect(parsed.expiresAt).toBeUndefined();
  });

  it('rejects explicit null expiresAt', () => {
    const result = promoUpdateSchema.safeParse({ expiresAt: null });
    expect(result.success).toBe(false);
    expect(expiresAtIssues(result).length).toBeGreaterThan(0);
  });

  it('accepts a datetime expiresAt on update', () => {
    const parsed = promoUpdateSchema.parse({ expiresAt: '2026-10-01T00:00:00.000Z' });
    expect(parsed.expiresAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('allows partial update with only title', () => {
    const parsed = promoUpdateSchema.parse({ title: 'Updated title' });
    expect(parsed.title).toBe('Updated title');
  });
});
