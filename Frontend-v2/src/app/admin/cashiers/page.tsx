'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, KeyRound, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import {
  hasMenuCreateAccess,
  hasMenuDeleteAccess,
  hasMenuUpdateAccess,
  type AdminPermission,
} from '@/lib/adminPermissions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const EMPTY = { name: '', email: '', password: '' };
const EDIT_EMPTY = { name: '', email: '' };

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

function localIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CashiersPage() {
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [branchName, setBranchName] = useState(() => {
    const session = getAdminSession();
    return session?.storeName?.replace('Bing Chun - ', '') ?? '';
  });
  const [isSuper] = useState(() => isSuperAdmin(getAdminSession()));
  const qc = useQueryClient();

  useEffect(() => {
    const session = getAdminSession();
    if (session?.storeName) {
      setBranchName(session.storeName.replace('Bing Chun - ', ''));
    }
  }, []);

  const { data: permissionRows = [] } = useQuery<AdminPermission[]>({
    queryKey: ['admin-me-permissions'],
    queryFn: () => adminFetch('/admin/me/permissions'),
    enabled: !isSuper,
  });

  const permissionsMap = Object.fromEntries(
    permissionRows.map((row) => [row.menu, row]),
  ) as Record<string, AdminPermission>;

  const canCreate = isSuper || hasMenuCreateAccess(permissionsMap, 'CASHIERS');
  const canUpdate = isSuper || hasMenuUpdateAccess(permissionsMap, 'CASHIERS');
  const canDelete = isSuper || hasMenuDeleteAccess(permissionsMap, 'CASHIERS');
  const canManageActions = canUpdate || canDelete;

  const { data: cashiers = [], isLoading } = useQuery<any[]>({
    queryKey: ['admin-cashiers'],
    queryFn: () => adminFetch('/admin/cashiers'),
  });

  const activityRange = (() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localIsoDate(from), to: localIsoDate(now) };
  })();

  const { data: activity } = useQuery<{
    cashiers: Array<{
      adminId: string;
      name: string;
      ordersProcessed: number;
      cashCollectedAmount: number;
      cancels: number;
    }>;
  }>({
    queryKey: ['cashier-activity', activityRange.from, activityRange.to],
    queryFn: () => adminFetch(`/orders/cashier-activity?from=${activityRange.from}&to=${activityRange.to}`),
  });

  const activityById = Object.fromEntries(
    (activity?.cashiers ?? []).map((row) => [row.adminId, row]),
  );

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY) => adminFetch('/admin/cashiers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-cashiers'] });
      setForm(EMPTY);
      setShowForm(false);
      toast.success('Cashier registered');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to register'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof EDIT_EMPTY }) =>
      adminFetch(`/admin/cashiers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-cashiers'] });
      closeEditModal();
      toast.success('Cashier updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!canDelete) throw new Error('Permission denied: Cannot delete CASHIERS');
      return adminFetch(`/admin/cashiers/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-cashiers'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update'),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminFetch(`/admin/cashiers/${id}`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-cashiers'] });
      setResetId(null);
      setNewPassword('');
      toast.success('Password updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to reset password'),
  });

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    createMutation.mutate(form);
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!canUpdate || !resetId || newPassword.length < 8) return;
    resetMutation.mutate({ id: resetId, password: newPassword });
  }

  function startEdit(cashier: { id: string; name: string; email: string }) {
    if (!canUpdate) return;
    setEditingId(cashier.id);
    setEditForm({ name: cashier.name, email: cashier.email });
    setShowForm(false);
    setResetId(null);
    setNewPassword('');
  }

  function closeEditModal() {
    setEditingId(null);
    setEditForm(EDIT_EMPTY);
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!canUpdate || !editingId) return;
    updateMutation.mutate({ id: editingId, data: editForm });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cashiers</h1>
          <p className="text-muted text-sm">
            Register and manage cashier accounts for {branchName || 'your branch'} (Dashboard, Orders & Delivery).
            Order activity below is for this month.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              closeEditModal();
              setResetId(null);
            }}
            className="btn-primary px-4 py-2.5 text-sm"
          >
            <Plus size={15} /> Register Cashier
          </button>
        )}
      </div>

      <AnimatePresence>
        {showForm && canCreate && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 mb-6">
            <h3 className="font-semibold text-white mb-4">New Cashier</h3>
            <form onSubmit={submitForm} className="grid sm:grid-cols-2 gap-4">
              <input
                className="input-field"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <input
                className="input-field"
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
              <input
                className="input-field sm:col-span-2"
                type="password"
                placeholder="Password (min 8 characters)"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                minLength={8}
                required
              />
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={createMutation.isPending} className="btn-primary px-6 py-2.5 text-sm">
                  {createMutation.isPending ? 'Registering...' : 'Register Cashier'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline px-6 py-2.5 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resetId && canUpdate && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 mb-6">
            <h3 className="font-semibold text-white mb-4">Reset Password</h3>
            <form onSubmit={submitReset} className="flex flex-col sm:flex-row gap-3">
              <input
                className="input-field flex-1"
                type="password"
                placeholder="New password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
              <button type="submit" disabled={resetMutation.isPending} className="btn-primary px-6 py-2.5 text-sm">
                {resetMutation.isPending ? 'Saving...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => { setResetId(null); setNewPassword(''); }}
                className="btn-outline px-6 py-2.5 text-sm"
              >
                Cancel
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-border">
                {['Name', 'Email', 'Status', 'Orders processed', 'Cash collected', 'Cancels', 'Last Login', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">Loading...</td>
                </tr>
              )}
              {!isLoading && cashiers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">No cashiers registered yet</td>
                </tr>
              )}
              {cashiers.map((c: any) => (
                <tr key={c.id} className="border-b border-navy-border hover:bg-navy-light/30">
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted text-xs">{c.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${c.isActive ? 'text-green-400' : 'text-red-400'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs tabular-nums">
                    {activityById[c.id]?.ordersProcessed ?? 0}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs tabular-nums">
                    LKR {(activityById[c.id]?.cashCollectedAmount ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs tabular-nums">
                    {activityById[c.id]?.cancels ?? 0}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(c.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    {canManageActions ? (
                      <div className="flex items-center gap-2">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="p-1.5 rounded-lg border border-navy-border text-muted hover:text-white hover:border-brand"
                            title="Edit details"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
                            className={`p-1.5 rounded-lg border text-xs ${c.isActive ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'}`}
                            title={c.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Power size={12} />
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => { setResetId(c.id); setNewPassword(''); closeEditModal(); setShowForm(false); }}
                            className="p-1.5 rounded-lg border border-navy-border text-muted hover:text-white hover:border-brand"
                            title="Reset password"
                          >
                            <KeyRound size={12} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={!!editingId && canUpdate}
        onOpenChange={(open) => {
          if (!open && !updateMutation.isPending) closeEditModal();
        }}
      >
        <DialogContent
          className="gap-0 overflow-hidden border border-navy-border bg-navy-card p-0 shadow-2xl sm:max-w-lg"
          showCloseButton={!updateMutation.isPending}
        >
          <form onSubmit={submitEdit} autoComplete="off">
            <DialogHeader className="border-b border-navy-border px-6 py-4">
              <DialogTitle className="text-lg font-semibold text-white">Edit Cashier</DialogTitle>
              <DialogDescription className="text-sm text-muted">
                Update name or email for this cashier account.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-6 py-5">
              <div>
                <label htmlFor="edit-cashier-name" className="mb-1.5 block text-xs font-medium text-muted">
                  Full name
                </label>
                <input
                  id="edit-cashier-name"
                  className="input-field"
                  placeholder="Full name"
                  name="edit-cashier-name"
                  autoComplete="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-cashier-email" className="mb-1.5 block text-xs font-medium text-muted">
                  Email
                </label>
                <input
                  id="edit-cashier-email"
                  className="input-field"
                  type="email"
                  placeholder="Email"
                  name="edit-cashier-email"
                  autoComplete="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            <DialogFooter className="-mx-0 -mb-0 border-t border-navy-border bg-navy-light/20 px-6 pb-6 pt-4">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={updateMutation.isPending}
                className="btn-outline px-5 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
