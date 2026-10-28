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
  'REPORTS',
] as const;

/** Branch cashiers use delivery classification + live map (see Frontend CASHIER_NAV_HREFS). */
export const DEFAULT_CASHIER_MENUS = [
  'DASHBOARD',
  'ORDERS',
  'STOCK',
  'DELIVERY',
  'LIVE_DRIVERS',
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

/** Roles that get a default permission matrix when created. */
export const ROLES_WITH_DEFAULT_MENUS = Object.keys(ROLE_DEFAULT_MENUS);

export function getDefaultMenusForRole(roleName?: string): readonly string[] {
  if (!roleName) return [];
  return ROLE_DEFAULT_MENUS[roleName] ?? [];
}

export type DefaultPermissionRow = {
  adminUserId: string;
  menu: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

type MenuCrudOverride = Pick<DefaultPermissionRow, 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete'>;

const MENU_CRUD_OVERRIDES: Partial<Record<string, Partial<MenuCrudOverride>>> = {
  WALLET: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  PAYMENT_HISTORY: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
  ORDERS: { canCreate: false, canRead: true, canUpdate: true, canDelete: false },
  DELIVERY_WALLET: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
};

function defaultCrudForMenu(menu: string): MenuCrudOverride {
  const override = MENU_CRUD_OVERRIDES[menu];
  return {
    canCreate: override?.canCreate ?? true,
    canRead: override?.canRead ?? true,
    canUpdate: override?.canUpdate ?? true,
    canDelete: override?.canDelete ?? true,
  };
}

export function buildDefaultPermissionRows(
  adminUserId: string,
  menus: readonly string[],
): DefaultPermissionRow[] {
  return menus.map((menu) => ({
    adminUserId,
    menu,
    ...defaultCrudForMenu(menu),
  }));
}
