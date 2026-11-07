'use client';

import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import StaffPermissionsGrid from '@/components/admin/StaffPermissionsGrid';
import { formatStaffRole, getStaffRoleAvatarUrl } from '@/lib/staffRoleAvatar';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: { id: string; name: string };
}

function getEmpId(uuid: string): string {
  if (!uuid) return 'EMP00000000';
  const numericStr = uuid.replace(/\D/g, '');
  return `EMP${(numericStr.padEnd(8, '0')).slice(0, 8)}`;
}

export default function StaffPermissionsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: user, isLoading } = useQuery<AdminUser>({
    queryKey: ['admin-user', id],
    queryFn: () => adminFetch(`/admin/users/${id}`),
    enabled: !!id,
  });

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Staff Permissions Management</h1>
        <p className="text-muted text-sm">Search and manage access privileges for staff members</p>
      </div>

      {isLoading && (
        <div className="card p-6 animate-pulse mb-6">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-full bg-white/10" />
            <div className="space-y-3">
              <div className="w-40 h-5 bg-white/10 rounded" />
              <div className="w-56 h-4 bg-white/10 rounded" />
            </div>
          </div>
        </div>
      )}

      {user && (
        <div className="card p-6 bg-gradient-to-r from-white/[0.03] to-transparent border border-white/5 mb-2 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
          <div className="flex items-start gap-4">
            <img
              src={getStaffRoleAvatarUrl(user.role.name)}
              alt={`${formatStaffRole(user.role.name)} avatar`}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-white/10"
            />
            <div>
              <h2 className="text-lg font-bold text-white mb-1">{user.name}</h2>
              <p className="text-sm text-muted mb-2 font-mono">{getEmpId(user.id)} • {user.email}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-brand/15 text-brand border border-brand/20">
                  {formatStaffRole(user.role.name)}
                </span>
                <span className="inline-flex items-center text-[10px] font-medium px-2.5 py-1 rounded bg-white/5 text-white/70">
                  {formatStaffRole(user.role.name).toLowerCase()}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push(`/admin/users/${id}`)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
          >
            <ArrowLeft size={16} />
            Back to Profile
          </button>
        </div>
      )}

      <StaffPermissionsGrid id={id} roleName={user?.role.name} />
    </div>
  );
}
