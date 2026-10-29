import { describe, expect, it } from 'vitest';
import {
  buildPermissionsMap,
  hasMenuReadAccess,
  serializePermissionsMap,
  type AdminPermission,
} from '@/lib/adminPermissions';

describe('hasMenuReadAccess LIVE_DRIVERS', () => {
  it('inherits DELIVERY read when LIVE_DRIVERS row is empty poison row', () => {
    const permissions = {
      DELIVERY: { canRead: true },
      LIVE_DRIVERS: { canRead: false },
    };
    expect(hasMenuReadAccess(permissions, 'LIVE_DRIVERS')).toBe(true);
  });

  it('uses explicit LIVE_DRIVERS read when that row has any grant', () => {
    const permissions = {
      DELIVERY: { canRead: true },
      LIVE_DRIVERS: { canRead: false, canUpdate: true },
    };
    expect(hasMenuReadAccess(permissions, 'LIVE_DRIVERS')).toBe(false);
  });

  it('falls back to DELIVERY when LIVE_DRIVERS key is absent', () => {
    expect(hasMenuReadAccess({ DELIVERY: { canRead: true } }, 'LIVE_DRIVERS')).toBe(true);
  });
});

describe('serializePermissionsMap', () => {
  it('does not persist empty LIVE_DRIVERS rows when only DELIVERY is granted', () => {
    const map = buildPermissionsMap([], 'STORE_MANAGER');
    map.DELIVERY = {
      menu: 'DELIVERY',
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
    };
    map.LIVE_DRIVERS = {
      menu: 'LIVE_DRIVERS',
      canCreate: false,
      canRead: false,
      canUpdate: false,
      canDelete: false,
    };

    const serialized = serializePermissionsMap(map);
    const liveRow = serialized.find((p) => p.menu === 'LIVE_DRIVERS');
    expect(liveRow).toBeUndefined();
    expect(serialized.some((p) => p.menu === 'DELIVERY' && p.canRead)).toBe(true);
  });

  it('includes LIVE_DRIVERS when explicitly granted', () => {
    const map: Record<string, AdminPermission> = {
      LIVE_DRIVERS: {
        menu: 'LIVE_DRIVERS',
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
      },
    };
    const serialized = serializePermissionsMap(map);
    expect(serialized).toEqual([
      expect.objectContaining({ menu: 'LIVE_DRIVERS', canRead: true }),
    ]);
  });
});

describe('buildPermissionsMap LIVE_DRIVERS', () => {
  it('inherits DELIVERY from DB when LIVE_DRIVERS row is all false', () => {
    const initial: AdminPermission[] = [
      {
        menu: 'DELIVERY',
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
      },
      {
        menu: 'LIVE_DRIVERS',
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
      },
    ];
    const map = buildPermissionsMap(initial, 'STORE_MANAGER');
    expect(map.LIVE_DRIVERS.canRead).toBe(true);
  });
});
