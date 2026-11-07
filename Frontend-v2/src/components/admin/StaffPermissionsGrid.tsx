'use client';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import {
  AdminPermission,
  buildPermissionsMap,
  createEmptyPermission,
  getPermissionMenuLabel,
  normalizePermissions,
  PERMISSION_MODULES,
  serializePermissionsMap,
} from '@/lib/adminPermissions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

interface AdminUser {
  role: { name: string };
}

function normalizePermissionsResponse(value: unknown): AdminPermission[] {
  return normalizePermissions(value);
}

export default function StaffPermissionsGrid({
  id,
  roleName,
}: {
  id: string;
  roleName?: string;
}) {
  const queryClient = useQueryClient();

  const { data: user, isLoading: isUserLoading } = useQuery<AdminUser>({
    queryKey: ['admin-user', id],
    queryFn: () => adminFetch(`/admin/users/${id}`),
    enabled: !!id,
  });

  const { data: initialPermissions, isLoading: isPermsLoading } = useQuery<AdminPermission[]>({
    queryKey: ['admin-permissions', id],
    queryFn: () => adminFetch(`/admin/users/${id}/permissions`),
    enabled: !!id,
  });

  const effectiveRole = roleName ?? user?.role?.name;

  const baselineMap = useMemo(() => {
    if (initialPermissions === undefined || !effectiveRole) return null;
    return buildPermissionsMap(normalizePermissionsResponse(initialPermissions), effectiveRole);
  }, [initialPermissions, effectiveRole]);

  const [permissionsMap, setPermissionsMap] = useState<Record<string, AdminPermission>>({});

  useEffect(() => {
    if (baselineMap) {
      setPermissionsMap(baselineMap);
    }
  }, [baselineMap]);

  const saveMutation = useMutation({
    mutationFn: (perms: AdminPermission[]) => adminFetch(`/admin/users/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions: perms }),
    }),
    onSuccess: () => {
      toast.success('Permissions saved successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-permissions', id] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save permissions');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(serializePermissionsMap(permissionsMap));
  };

  const handleToggle = (menu: string, action: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete') => {
    setPermissionsMap((prev) => {
      const current = prev[menu] ?? createEmptyPermission(menu);
      return {
        ...prev,
        [menu]: {
          ...current,
          menu,
          [action]: !current[action],
        },
      };
    });
  };

  const isLoading = isUserLoading || isPermsLoading || !baselineMap;

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse mt-8">
        <div className="h-6 w-48 bg-white/10 rounded mb-6" />
        <div className="space-y-4">
          <div className="h-10 w-full bg-white/5 rounded" />
          <div className="h-10 w-full bg-white/5 rounded" />
          <div className="h-10 w-full bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Access Permissions</h2>
          <p className="text-sm text-muted">
            Default access for this role is pre-selected. Adjust and save to apply changes.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-primary px-6 py-2 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
        >
          {saveMutation.isPending ? (
            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <Save size={18} /> Save Changes
            </>
          )}
        </button>
      </div>

      <div className="space-y-6">
        {PERMISSION_MODULES.map((group) => (
          <div key={group.category} className="card overflow-hidden">
            <div className="bg-white/5 px-6 py-4 border-b border-white/5">
              <h3 className="font-semibold text-white">{group.category}</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-black/20 text-muted border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-medium w-1/3">Menu</th>
                    <th className="px-6 py-4 font-medium text-center">Create</th>
                    <th className="px-6 py-4 font-medium text-center">Read</th>
                    <th className="px-6 py-4 font-medium text-center">Edit</th>
                    <th className="px-6 py-4 font-medium text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {group.items.map((menu) => {
                    const p = permissionsMap[menu] || {
                      canCreate: false,
                      canRead: false,
                      canUpdate: false,
                      canDelete: false,
                    };
                    return (
                      <tr key={menu} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-white/80 font-medium">
                          {getPermissionMenuLabel(menu)}
                        </td>
                        {(['canCreate', 'canRead', 'canUpdate', 'canDelete'] as const).map((action) => (
                          <td key={action} className="px-6 py-4 text-center">
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={p[action]}
                                onChange={() => handleToggle(menu, action)}
                              />
                              <div
                                className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                                  p[action] ? 'bg-brand border-brand' : 'border-white/20 bg-black/20'
                                }`}
                              >
                                {p[action] && <Check size={14} className="text-navy font-bold" />}
                              </div>
                            </label>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
