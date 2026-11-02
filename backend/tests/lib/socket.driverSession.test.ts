import { describe, expect, it } from 'vitest';
import { revokeDriverSockets } from '../../src/lib/socket';

describe('revokeDriverSockets', () => {
  it('does not throw when socket.io has not been started', () => {
    expect(() => revokeDriverSockets('driver-1')).not.toThrow();
  });
});
