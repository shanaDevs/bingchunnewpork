import { describe, expect, it } from 'vitest';
import { isReady } from '../src/lib/readiness';

describe('isReady', () => {
  it('requires database ok', () => {
    expect(isReady({ database: 'fail', redis: 'skipped' })).toBe(false);
    expect(isReady({ database: 'ok', redis: 'skipped' })).toBe(true);
  });

  it('fails when redis is configured but unhealthy', () => {
    expect(isReady({ database: 'ok', redis: 'fail' })).toBe(false);
    expect(isReady({ database: 'ok', redis: 'ok' })).toBe(true);
  });
});
