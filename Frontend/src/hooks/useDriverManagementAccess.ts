'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminSession, isDeliveryAdmin, isSuperAdmin } from '@/lib/adminAuth';
import { adminApiJson } from '@/lib/adminApi';
import { hasMenuCreateAccess, hasMenuUpdateAccess } from '@/lib/adminPermissions';

type PermissionRow = {
  menu?: string;
  canCreate?: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
};

function permissionsMapFromApi(list: unknown): Record<string, PermissionRow> {
  const map: Record<string, PermissionRow> = {};
  if (!Array.isArray(list)) return map;
  list.forEach((raw) => {
    const row = raw as PermissionRow;
    if (!row.menu) return;
    map[row.menu] = {
      canCreate: Boolean(row.canCreate),
      canRead: Boolean(row.canRead),
      canUpdate: Boolean(row.canUpdate),
      canDelete: Boolean(row.canDelete),
    };
  });
  return map;
}

export function useDriverManagementAccess() {
  const session = getAdminSession();
  const roleGate = isSuperAdmin(session) || isDeliveryAdmin(session);

  const permissionsQuery = useQuery({
    queryKey: ['admin-me-permissions', session?.id, 'driver-management'],
    enabled: !!session && roleGate,
    staleTime: 60_000,
    queryFn: async () => {
      const json = await adminApiJson('/admin/me/permissions');
      const list = json.data ?? json;
      return permissionsMapFromApi(list);
    },
  });

  const perms = permissionsQuery.data ?? {};
  const superBypass = isSuperAdmin(session);

  const canCreateDrivers =
    roleGate && (superBypass || hasMenuCreateAccess(perms, 'DELIVERY'));
  const canUpdateDrivers =
    roleGate && (superBypass || hasMenuUpdateAccess(perms, 'DELIVERY'));

  return {
    canCreateDrivers,
    canUpdateDrivers,
    canManageDrivers: canCreateDrivers || canUpdateDrivers,
    isLoading: roleGate && permissionsQuery.isLoading,
  };
}
