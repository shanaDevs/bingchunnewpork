import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { error, paginated, success } from '../../src/utils/apiResponse';

function createMockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('success', () => {
  it('returns a success payload with default status 200', () => {
    const res = createMockRes();

    success(res, { id: 'abc' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'abc' } });
  });

  it('allows a custom status code', () => {
    const res = createMockRes();

    success(res, { created: true }, 201);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { created: true } });
  });
});

describe('paginated', () => {
  it('returns data with pagination meta', () => {
    const res = createMockRes();

    paginated(res, [{ id: 1 }, { id: 2 }], 25, 2, 10);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      meta: { total: 25, page: 2, limit: 10, pages: 3 },
    });
  });
});

describe('error', () => {
  it('returns an error payload with default status 400', () => {
    const res = createMockRes();

    error(res, 'Bad request');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Bad request',
      details: undefined,
    });
  });

  it('includes optional details and custom status code', () => {
    const res = createMockRes();

    error(res, 'Validation error', 422, { field: 'phone' });

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation error',
      details: { field: 'phone' },
    });
  });
});
