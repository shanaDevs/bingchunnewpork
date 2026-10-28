import { describe, expect, it } from 'vitest';
import {
  buildDefaultPermissionRows,
  getDefaultMenusForRole,
  ROLES_WITH_DEFAULT_MENUS,
  DEFAULT_BRANCH_MANAGER_MENUS,
  DEFAULT_CASHIER_MENUS,
  DEFAULT_DELIVERY_ADMIN_MENUS,
} from '../../src/constants/defaultPermissions';

describe('role default menus', () => {
  it('resolves the preset for each creatable staff type', () => {
    expect(getDefaultMenusForRole('STORE_MANAGER')).toEqual(DEFAULT_BRANCH_MANAGER_MENUS);
    expect(getDefaultMenusForRole('CASHIER')).toEqual(DEFAULT_CASHIER_MENUS);
    expect(getDefaultMenusForRole('DELIVERY_ADMIN')).toEqual(DEFAULT_DELIVERY_ADMIN_MENUS);
  });

  it('returns nothing for roles that get no default matrix', () => {
    expect(getDefaultMenusForRole('SYSTEM_ADMIN')).toEqual([]);
    expect(getDefaultMenusForRole('DELIVERY_DRIVER')).toEqual([]);
    expect(getDefaultMenusForRole(undefined)).toEqual([]);
    expect(getDefaultMenusForRole('NOT_A_ROLE')).toEqual([]);
  });

  it('lists exactly the roles that have a preset', () => {
    expect([...ROLES_WITH_DEFAULT_MENUS].sort()).toEqual([
      'CASHIER',
      'DELIVERY_ADMIN',
      'STORE_MANAGER',
    ]);
    ROLES_WITH_DEFAULT_MENUS.forEach((role) => {
      expect(getDefaultMenusForRole(role).length).toBeGreaterThan(0);
    });
  });

  it('scopes the delivery admin to delivery ops and the delivery wallet', () => {
    expect(DEFAULT_DELIVERY_ADMIN_MENUS).toEqual([
      'DELIVERY',
      'LIVE_DRIVERS',
      'DELIVERY_WALLET',
    ]);
    // No dashboard, orders (also hides Refunds and WhatsApp), branch, staff, or branch-wallet.
    ['DASHBOARD', 'ORDERS', 'STOCK', 'SALES', 'WALLET', 'PAYMENT_HISTORY', 'CASHIERS', 'USERS', 'SETTINGS'].forEach(
      (menu) => {
        expect(DEFAULT_DELIVERY_ADMIN_MENUS).not.toContain(menu);
      },
    );
  });

  it('does not grant Spin Wheel to new branch managers by default', () => {
    expect(DEFAULT_BRANCH_MANAGER_MENUS).not.toContain('SPIN');
  });

  it('does not grant delivery wallet to branch staff', () => {
    expect(DEFAULT_BRANCH_MANAGER_MENUS).not.toContain('DELIVERY_WALLET');
    expect(DEFAULT_CASHIER_MENUS).not.toContain('DELIVERY_WALLET');
  });

  it('does not grant SETTINGS or PROMOS to new branch managers', () => {
    expect(DEFAULT_BRANCH_MANAGER_MENUS).not.toContain('SETTINGS');
    expect(DEFAULT_BRANCH_MANAGER_MENUS).not.toContain('PROMOS');
  });

  it('grants delivery ops menus to cashiers who use branch delivery UI', () => {
    expect(DEFAULT_CASHIER_MENUS).toContain('DELIVERY');
    expect(DEFAULT_CASHIER_MENUS).toContain('LIVE_DRIVERS');
    expect(DEFAULT_CASHIER_MENUS).not.toContain('DELIVERY_WALLET');
  });
});

describe('buildDefaultPermissionRows', () => {
  it('grants full CRUD on every menu in the preset except delivery wallet', () => {
    const rows = buildDefaultPermissionRows('user-1', DEFAULT_DELIVERY_ADMIN_MENUS);

    expect(rows).toHaveLength(DEFAULT_DELIVERY_ADMIN_MENUS.length);
    rows.forEach((row) => {
      expect(row.adminUserId).toBe('user-1');
      expect(row.canRead).toBe(true);
      if (row.menu === 'DELIVERY_WALLET') {
        expect(row.canCreate).toBe(false);
        expect(row.canUpdate).toBe(false);
        expect(row.canDelete).toBe(false);
      } else {
        expect(row.canCreate).toBe(true);
        expect(row.canUpdate).toBe(true);
        expect(row.canDelete).toBe(true);
      }
    });
    expect(rows.map((r) => r.menu)).toEqual([...DEFAULT_DELIVERY_ADMIN_MENUS]);
  });

  it('produces no rows for a role without a preset', () => {
    expect(buildDefaultPermissionRows('user-1', getDefaultMenusForRole('SYSTEM_ADMIN'))).toEqual([]);
  });

  it('grants WALLET read-only for branch managers by default', () => {
    const rows = buildDefaultPermissionRows('user-1', ['WALLET']);
    expect(rows[0]).toMatchObject({
      menu: 'WALLET',
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    });
  });

  it('limits ORDERS to read and update for cashiers by default', () => {
    const rows = buildDefaultPermissionRows('user-1', ['ORDERS']);
    expect(rows[0]).toMatchObject({
      menu: 'ORDERS',
      canCreate: false,
      canRead: true,
      canUpdate: true,
      canDelete: false,
    });
  });
});
