'use client';

export interface AdminSession {
  id: string;
  name: string;
  email: string;
  role: 'SYSTEM_ADMIN' | 'STORE_MANAGER' | 'CASHIER' | 'DELIVERY_ADMIN' | 'REPORT_VIEWER';
  storeId?: string | null;
  storeName?: string | null;
  storeCity?: string | null;
  /** Store delivery flag for branch-scoped accounts; null/undefined for HQ roles. */
  deliveryEnabled?: boolean | null;
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('bc_admin');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function isSuperAdmin(admin: AdminSession | null): boolean {
  return admin?.role === 'SYSTEM_ADMIN';
}

export function isBranchAdmin(admin: AdminSession | null): boolean {
  return admin?.role === 'STORE_MANAGER';
}

export function isCashier(admin: AdminSession | null): boolean {
  return admin?.role === 'CASHIER';
}

/** Delivery admins are headquarters accounts — they cover every branch. */
export function isDeliveryAdmin(admin: AdminSession | null): boolean {
  return admin?.role === 'DELIVERY_ADMIN';
}

export function isBranchScoped(admin: AdminSession | null): boolean {
  return isBranchAdmin(admin) || isCashier(admin);
}

/** Branch/cashier store can accept delivery orders. HQ roles always return true. */
export function storeSupportsDelivery(admin: AdminSession | null): boolean {
  if (!isBranchScoped(admin)) return true;
  return admin?.deliveryEnabled === true;
}

/** Pickup-only branch portal — hide delivery nav, tabs, and KPIs. */
export function isPickupOnlyBranchAdmin(admin: AdminSession | null): boolean {
  return isBranchScoped(admin) && !storeSupportsDelivery(admin);
}

/** Roles that view every branch and pick one through a filter rather than a linked store. */
export function isAllBranchView(admin: AdminSession | null): boolean {
  return isSuperAdmin(admin) || isDeliveryAdmin(admin);
}

/** First page inside the main admin. Delivery admins open delivery operations. */
export function adminHomeHref(admin: Pick<AdminSession, 'role'> | null): string {
  if (admin?.role === 'DELIVERY_ADMIN') return '/admin/delivery';
  return '/admin';
}

export function adminRoleLabel(role?: string): string {
  if (role === 'SYSTEM_ADMIN') return 'Super Admin';
  if (role === 'STORE_MANAGER') return 'Branch Admin';
  if (role === 'CASHIER') return 'Cashier';
  if (role === 'DELIVERY_ADMIN') return 'Delivery Admin';
  if (role === 'REPORT_VIEWER') return 'Report Viewer';
  return role ?? 'Admin';
}
