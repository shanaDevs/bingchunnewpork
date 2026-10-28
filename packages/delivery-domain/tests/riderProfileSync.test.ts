import { describe, expect, it, afterEach } from 'vitest';
import { riderProfileEnabled } from '../src/riderProfileSync';

describe('riderProfileEnabled', () => {
  const prev = process.env.DELIVERY_RIDER_PROFILE_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.DELIVERY_RIDER_PROFILE_ENABLED;
    else process.env.DELIVERY_RIDER_PROFILE_ENABLED = prev;
  });

  it('is false by default', () => {
    delete process.env.DELIVERY_RIDER_PROFILE_ENABLED;
    expect(riderProfileEnabled()).toBe(false);
  });

  it('is true when env is true', () => {
    process.env.DELIVERY_RIDER_PROFILE_ENABLED = 'true';
    expect(riderProfileEnabled()).toBe(true);
  });
});
