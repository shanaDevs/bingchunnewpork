/**
 * Profile images under /public/roles — filenames use spaces matching role labels.
 * e.g. SYSTEM_ADMIN → /roles/SYSTEM ADMIN.jpeg
 */
const ROLE_AVATAR_FILES: Record<string, string> = {
  SYSTEM_ADMIN: 'SYSTEM ADMIN.jpeg',
  STORE_MANAGER: 'STORE MANAGER.jpeg',
  CASHIER: 'CASHIER.jpeg',
  DELIVERY_ADMIN: 'DELIVERY ADMIN.jpeg',
  DELIVERY_DRIVER: 'DELIVERY DRIVER.jpeg',
  REPORT_VIEWER: 'REPORT VIEWER.jpeg',
};

const FALLBACK_FILE = 'STORE MANAGER.jpeg';

export function formatStaffRole(roleName: string): string {
  return roleName.replace(/_/g, ' ');
}

export function getStaffRoleAvatarUrl(roleName?: string | null): string {
  const file = (roleName && ROLE_AVATAR_FILES[roleName]) || FALLBACK_FILE;
  return `/roles/${encodeURIComponent(file)}`;
}
