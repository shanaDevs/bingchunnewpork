'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Mail,
  Building2,
  Calendar,
  User,
  ShieldAlert,
  KeyRound,
  Shield,
  TriangleAlert,
  Eye,
  EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import StaffPermissionsGrid from '@/components/admin/StaffPermissionsGrid';
import BranchAccessManager from '@/components/admin/BranchAccessManager';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { confirmDialog } from '@/store/confirmStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatStaffRole, getStaffRoleAvatarUrl } from '@/lib/staffRoleAvatar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: { id: string, name: string };
  storeId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  store?: { id: string; name: string; city: string } | null;
}

// Generate a display ID like EMP37883522 from UUID
function getEmpId(uuid: string): string {
  if (!uuid) return 'EMP00000000';
  const numericStr = uuid.replace(/\D/g, ''); // Extract only numbers
  return `EMP${(numericStr.padEnd(8, '0')).slice(0, 8)}`;
}

export default function StaffManagementPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id as string;

  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { data: user, isLoading, isError } = useQuery<AdminUser>({
    queryKey: ['admin-user', id],
    queryFn: () => adminFetch(`/admin/users/${id}`),
    enabled: !!id,
  });

  const resetMutation = useMutation({
    mutationFn: (password: string) =>
      adminFetch(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      closeResetModal();
      toast.success('Password updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to reset password'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      adminFetch(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (updated: AdminUser) => {
      qc.setQueryData(['admin-user', id], updated);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(updated.isActive ? 'Account activated' : 'Account deactivated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update status'),
  });

  function closeResetModal() {
    setResetOpen(false);
    setNewPassword('');
    setShowPassword(false);
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return;
    resetMutation.mutate(newPassword);
  }

  async function handleToggleActive() {
    if (!user || toggleActiveMutation.isPending) return;
    const nextActive = !user.isActive;
    const confirmed = await confirmDialog({
      title: nextActive ? 'Activate account?' : 'Deactivate account?',
      message: nextActive
        ? `Re-enable login for ${user.name}?`
        : `Deactivate ${user.name}? They will no longer be able to sign in.`,
      confirmLabel: nextActive ? 'Activate' : 'Deactivate',
      variant: nextActive ? 'default' : 'danger',
    });
    if (!confirmed) return;
    toggleActiveMutation.mutate(nextActive);
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Staff Permissions Management</h1>
        <p className="text-muted text-sm">Search and manage access privileges for staff members</p>
      </div>

      {isLoading && (
        <div className="card p-6 animate-pulse">
          <div className="flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
            <div className="flex gap-4 items-center">
              <div className="w-20 h-20 rounded-full bg-white/10" />
              <div className="space-y-3">
                <div className="w-40 h-5 bg-white/10 rounded" />
                <div className="w-56 h-4 bg-white/10 rounded" />
                <div className="flex gap-2">
                  <div className="w-24 h-6 bg-white/10 rounded-full" />
                  <div className="w-24 h-6 bg-white/10 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isError && (
        <div className="card p-8 text-center border-red-500/20 bg-red-500/5">
          <ShieldAlert size={32} className="mx-auto text-red-400 mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">Error Loading Staff Member</h3>
          <p className="text-red-400/80 text-sm mb-4">Could not load details for this user.</p>
          <button onClick={() => router.push('/admin/users')} className="btn-outline px-4 py-2">
            Back to Search
          </button>
        </div>
      )}

      {user && (
        <div className="card p-6 bg-gradient-to-br from-navy-light to-navy">
          <div className="flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
            
            {/* User Info Left Side */}
            <div className="flex items-start gap-4">
              <div className="relative">
                <img
                  src={getStaffRoleAvatarUrl(user.role.name)}
                  alt={`${formatStaffRole(user.role.name)} avatar`}
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-brand/20"
                />
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-navy-light ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`} title={user.isActive ? 'Active' : 'Inactive'} />
              </div>
              
              <div>
                <h2 className="text-xl font-bold text-white mb-1">{user.name}</h2>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted mb-3">
                  <span className="font-mono">{getEmpId(user.id)}</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="flex items-center gap-1.5"><Mail size={12} /> {user.email}</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-brand/15 text-brand border border-brand/20">
                    {formatStaffRole(user.role.name)}
                  </span>
                  <span className="inline-flex items-center text-[10px] font-medium px-2.5 py-1 rounded bg-white/5 text-white/70">
                    {formatStaffRole(user.role.name).toLowerCase()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded bg-white/5 text-white/70">
                    <Building2 size={12} />
                    {user.store ? user.store.name.replace('Bing Chun - ', '') : 'Headquarters'}
                  </span>
                </div>
              </div>
            </div>

            {/* Back Button Right Side */}
            <button 
              onClick={() => router.push('/admin/users')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
            >
              <ArrowLeft size={16} />
              Back to Search
            </button>
          </div>
        </div>
      )}

      {user && (
        <>
          <div className="mt-6 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            {/* Account Details */}
            <div className="card flex h-full flex-col p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-fg">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <User size={16} />
                </span>
                Account Details
              </h3>

              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-3 border-b border-navy-border/70 py-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-light text-muted">
                    <Calendar size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Joined Date</p>
                    <p className="text-sm font-semibold text-fg">
                      {new Date(user.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-b border-navy-border/70 py-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-light text-muted">
                    <Calendar size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Last Login</p>
                    <p className="text-sm font-semibold text-fg">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : 'Never logged in'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-light text-muted">
                    <Shield size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Account Status</p>
                    {user.isActive ? (
                      <span className="mt-1 inline-flex rounded-full bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
                        Active Account
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-500">
                        Inactive Account
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card flex h-full flex-col p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-fg">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-500">
                  <ShieldAlert size={16} />
                </span>
                Quick Actions
              </h3>

              <div className="flex flex-1 flex-col justify-center gap-3">
                <div className="flex flex-col gap-3 rounded-xl border border-navy-border bg-navy-card/40 px-3.5 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <KeyRound size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">Reset Password</p>
                      <p className="text-xs text-muted">Create a new password for this account</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPassword('');
                      setShowPassword(false);
                      setResetOpen(true);
                    }}
                    className="shrink-0 self-start rounded-lg border border-brand/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 sm:self-center"
                  >
                    Reset Password
                  </button>
                </div>

                <div
                  className={`flex flex-col gap-3 rounded-xl border px-3.5 py-3 sm:flex-row sm:items-center ${
                    user.isActive
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-green-500/20 bg-green-500/5'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        user.isActive
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-green-500/10 text-green-600 dark:text-green-400'
                      }`}
                    >
                      <TriangleAlert size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold ${
                          user.isActive ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'
                        }`}
                      >
                        {user.isActive ? 'Deactivate Account' : 'Activate Account'}
                      </p>
                      <p className="text-xs text-muted">
                        {user.isActive
                          ? 'Prevent this user from accessing the system'
                          : 'Re-enable login access for this account'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive()}
                    disabled={toggleActiveMutation.isPending}
                    className={`shrink-0 self-start rounded-lg border bg-transparent px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 sm:self-center ${
                      user.isActive
                        ? 'border-red-500/40 text-red-500 hover:bg-red-500/10'
                        : 'border-green-500/40 text-green-600 hover:bg-green-500/10 dark:text-green-400'
                    }`}
                  >
                    {toggleActiveMutation.isPending
                      ? 'Updating...'
                      : user.isActive
                        ? 'Deactivate'
                        : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <BranchAccessManager userId={id} primaryStore={user.store ?? null} />
          <StaffPermissionsGrid id={id} roleName={user.role.name} />
        </>
      )}

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!open && !resetMutation.isPending) closeResetModal();
        }}
      >
        <DialogContent
          className="gap-0 overflow-hidden border border-navy-border bg-navy-card p-0 shadow-2xl sm:max-w-lg"
          showCloseButton={!resetMutation.isPending}
        >
          <form onSubmit={submitReset} autoComplete="off">
            <DialogHeader className="border-b border-navy-border px-6 py-4">
              <DialogTitle className="text-lg font-semibold text-white">Reset Password</DialogTitle>
              <DialogDescription className="text-sm text-muted">
                Set a new password for {user?.name ?? 'this staff member'}. Minimum 8 characters.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5">
              <label htmlFor="reset-staff-password" className="mb-1.5 block text-xs font-medium text-muted">
                New password
              </label>
              <div className="relative">
                <input
                  id="reset-staff-password"
                  className="input-field w-full pr-10"
                  type={showPassword ? 'text' : 'password'}
                  name="reset-staff-password"
                  autoComplete="new-password"
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <DialogFooter className="-mx-0 -mb-0 border-t border-navy-border bg-navy-light/20 px-6 pb-6 pt-4">
              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetMutation.isPending}
                className="btn-outline px-5 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetMutation.isPending || newPassword.length < 8}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                {resetMutation.isPending ? 'Saving...' : 'Update Password'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
