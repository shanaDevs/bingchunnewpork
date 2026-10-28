import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/config', () => ({
  config: {
    internalServiceSecret: 'rotation-test-secret-at-least-32-chars!!',
  },
}));

import { requireInternalSecret } from '../../src/middleware/internalAuth';

describe('requireInternalSecret', () => {
  it('accepts a matching X-Internal-Secret', () => {
    const next = vi.fn();
    requireInternalSecret(
      {
        headers: { 'x-internal-secret': 'rotation-test-secret-at-least-32-chars!!' },
      } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a wrong or missing secret with 403', () => {
    expect(() =>
      requireInternalSecret(
        { headers: { 'x-internal-secret': 'wrong-secret' } } as never,
        {} as never,
        vi.fn(),
      ),
    ).toThrow(AppError);

    expect(() =>
      requireInternalSecret({ headers: {} } as never, {} as never, vi.fn()),
    ).toThrow(AppError);
  });
});
