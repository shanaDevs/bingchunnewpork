export interface AdminPermission {
  menu: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export const PERMISSION_MODULES = [
  {
    category: 'Dashboard & Analytics',
    items: ['DASHBOARD', 'REPORTS'],
  },
  {
    category: 'Orders & Sales',
    items: ['ORDERS', 'DELIVERY', 'LIVE_DRIVERS'],
  },
  {
    category: 'Menu & Inventory',
    items: ['MENU', 'STOCK'],
  },
  {
    category: 'Finance & Payments',
    items: ['WALLET', 'DELIVERY_WALLET', 'SALES', 'PAYMENT_HISTORY'],
  },
  {
    category: 'Staff & Management',
    items: ['STORES', 'USERS', 'BRANCH_MANAGERS', 'CASHIERS'],
  },
  {
    category: 'Marketing',
    items: ['PROMOS'],
  },
  {
    category: 'System',
    items: ['SETTINGS'],
  },
] as const;

export const PERMISSION_MENU_LABELS: Record<string, string> = {
  LIVE_DRIVERS: 'LIVE DRIVERS',
  STOCK: 'BRANCH STOCK',
  PAYMENT_HISTORY: 'SETTLEMENT PAYOUTS',
  DELIVERY_WALLET: 'DELIVERY WALLET',
};

export function getPermissionMenuLabel(menu: string): string {
  return PERMISSION_MENU_LABELS[menu] ?? menu.replace(/_/g, ' ');
}

export const DEFAULT_BRANCH_MANAGER_MENUS = [
  'DASHBOARD',
  'ORDERS',
  'DELIVERY',
  'LIVE_DRIVERS',
  'STOCK',
  'SALES',
  'WALLET',
  'PAYMENT_HISTORY',
  'CASHIERS',
  'PROMOS',
  'REPORTS',
  'SETTINGS',
] as const;

export const DEFAULT_CASHIER_MENUS = [
  'DASHBOARD',
  'ORDERS',
  'DELIVERY',
  'LIVE_DRIVERS',
  'STOCK',
] as const;

/** Delivery admins are HQ-wide (no store link) and own delivery ops plus the delivery wallet. */
export const DEFAULT_DELIVERY_ADMIN_MENUS = [
  'DELIVERY',
  'LIVE_DRIVERS',
  'DELIVERY_WALLET',
] as const;

const ROLE_DEFAULT_MENUS: Record<string, readonly string[]> = {
  STORE_MANAGER: DEFAULT_BRANCH_MANAGER_MENUS,
  CASHIER: DEFAULT_CASHIER_MENUS,
  DELIVERY_ADMIN: DEFAULT_DELIVERY_ADMIN_MENUS,
};

export function getDefaultMenusForRole(roleName?: string): readonly string[] {
  if (!roleName) return [];
  return ROLE_DEFAULT_MENUS[roleName] ?? [];
}

function emptyPermission(menu: string): AdminPermission {
  return {
    menu,
    canCreate: false,
    canRead: false,
    canUpdate: false,
    canDelete: false,
  };
}

export function createEmptyPermission(menu: string): AdminPermission {
  return emptyPermission(menu);
}

function fullPermission(menu: string): AdminPermission {
  return {
    menu,
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
  };
}

function normalizePermissionRow(raw: unknown): AdminPermission | null {
  if (!raw || typeof raw !== 'object' || !('menu' in raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    menu: String(row.menu),
    canCreate: Boolean(row.canCreate),
    canRead: Boolean(row.canRead),
    canUpdate: Boolean(row.canUpdate),
    canDelete: Boolean(row.canDelete),
  };
}

export function normalizePermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => normalizePermissionRow(row))
    .filter((row): row is AdminPermission => row !== null);
}

function isEmptyPermission(permission: AdminPermission): boolean {
  return !permission.canCreate && !permission.canRead && !permission.canUpdate && !permission.canDelete;
}

function withMenu(menu: string, permission: AdminPermission): AdminPermission {
  return { ...permission, menu };
}

function resolveSavedPermission(
  menu: string,
  savedByMenu: Map<string, AdminPermission>,
): AdminPermission | undefined {
  const saved = savedByMenu.get(menu);
  if (menu !== 'LIVE_DRIVERS') {
    return saved;
  }

  if (saved) {
    return withMenu(menu, saved);
  }

  const delivery = savedByMenu.get('DELIVERY');
  if (delivery && !isEmptyPermission(delivery)) {
    return withMenu(menu, delivery);
  }

  return undefined;
}

export function hasMenuReadAccess(
  permissions: Record<string, { canRead?: boolean }>,
  menuKey: string,
): boolean {
  if (menuKey === 'LIVE_DRIVERS') {
    if (Object.prototype.hasOwnProperty.call(permissions, 'LIVE_DRIVERS')) {
      return !!permissions.LIVE_DRIVERS?.canRead;
    }
    return !!permissions.DELIVERY?.canRead;
  }
  return !!permissions[menuKey]?.canRead;
}

export function hasMenuCreateAccess(
  permissions: Record<string, { canCreate?: boolean }>,
  menuKey: string,
): boolean {
  if (menuKey === 'LIVE_DRIVERS') {
    if (Object.prototype.hasOwnProperty.call(permissions, 'LIVE_DRIVERS')) {
      return !!permissions.LIVE_DRIVERS?.canCreate;
    }
    return !!permissions.DELIVERY?.canCreate;
  }
  return !!permissions[menuKey]?.canCreate;
}

export function hasMenuUpdateAccess(
  permissions: Record<string, { canUpdate?: boolean }>,
  menuKey: string,
): boolean {
  if (menuKey === 'LIVE_DRIVERS') {
    if (Object.prototype.hasOwnProperty.call(permissions, 'LIVE_DRIVERS')) {
      return !!permissions.LIVE_DRIVERS?.canUpdate;
    }
    return !!permissions.DELIVERY?.canUpdate;
  }
  return !!permissions[menuKey]?.canUpdate;
}

export function hasMenuDeleteAccess(
  permissions: Record<string, { canDelete?: boolean }>,
  menuKey: string,
): boolean {
  if (menuKey === 'LIVE_DRIVERS') {
    if (Object.prototype.hasOwnProperty.call(permissions, 'LIVE_DRIVERS')) {
      return !!permissions.LIVE_DRIVERS?.canDelete;
    }
    return !!permissions.DELIVERY?.canDelete;
  }
  return !!permissions[menuKey]?.canDelete;
}

export function buildPermissionsMap(
  initialPermissions: AdminPermission[],
  roleName?: string,
): Record<string, AdminPermission> {
  const defaultMenus = new Set(getDefaultMenusForRole(roleName));
  const savedByMenu = new Map(
    normalizePermissions(initialPermissions).map((permission) => [permission.menu, permission]),
  );
  const hasSavedPermissions = savedByMenu.size > 0;

  const map: Record<string, AdminPermission> = {};

  PERMISSION_MODULES.forEach((group) => {
    group.items.forEach((item) => {
      const saved = resolveSavedPermission(item, savedByMenu);
      if (saved) {
        map[item] = withMenu(item, saved);
      } else if (!hasSavedPermissions && defaultMenus.has(item)) {
        map[item] = fullPermission(item);
      } else {
        map[item] = emptyPermission(item);
      }
    });
  });

  normalizePermissions(initialPermissions).forEach((permission) => {
    if (!map[permission.menu]) {
      map[permission.menu] = withMenu(permission.menu, permission);
    }
  });

  return map;
}

export function serializePermissionsMap(
  permissionsMap: Record<string, AdminPermission>,
): AdminPermission[] {
  return PERMISSION_MODULES.flatMap((group) =>
    group.items.map((menu) => ({
      menu,
      canCreate: permissionsMap[menu]?.canCreate ?? false,
      canRead: permissionsMap[menu]?.canRead ?? false,
      canUpdate: permissionsMap[menu]?.canUpdate ?? false,
      canDelete: permissionsMap[menu]?.canDelete ?? false,
    })),
  ).filter((permission) => {
    const hasAny =
      permission.canCreate || permission.canRead || permission.canUpdate || permission.canDelete;
    if (hasAny) return true;

    const delivery = permissionsMap.DELIVERY;
    const deliveryGranted =
      delivery?.canCreate || delivery?.canRead || delivery?.canUpdate || delivery?.canDelete;

    return permission.menu === 'LIVE_DRIVERS' && Boolean(deliveryGranted);
  });
}
