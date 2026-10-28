'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, KeyRound, Save, Pencil, Search } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import DeliveryAccessHistoryLog, {
  type DeliveryAccessLogEntry,
} from '@/components/admin/DeliveryAccessHistoryLog';
import DeliveryAccessSettingsTable, {
  type DeliveryAccessRow,
} from '@/components/admin/DeliveryAccessSettingsTable';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { DEFAULT_DELIVERY_MILESTONE_ORDERS } from '@/lib/deliveryAccessMilestones';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';

function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: adminAuthHeaders({ 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined),
    credentials: 'include',
  }),
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    return d.data ?? d;
  });
}

const EMPTY = { name: '', email: '', password: '', storeId: '' };
const EDIT_EMPTY = { name: '', email: '', storeId: '' };

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBranchLabel(name: string) {
  return name.replace('Bing Chun - ', '');
}

function matchesManagerSearch(manager: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const branchName = manager.store?.name?.replace('Bing Chun - ', '') ?? '';
  const haystack = [
    manager.name,
    manager.email,
    branchName,
    manager.store?.city,
    manager.isActive ? 'active' : 'inactive',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export default function BranchAccessPage() {
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [toggleTarget, setToggleTarget] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);
  const [deliveryMilestone1Orders, setDeliveryMilestone1Orders] = useState(
    String(DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone1),
  );
  const [deliveryMilestone2Orders, setDeliveryMilestone2Orders] = useState(
    String(DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone2),
  );
  const [deliveryMilestone3Orders, setDeliveryMilestone3Orders] = useState(
    String(DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone3),
  );
  const qc = useQueryClient();

  const { data: managers = [], isLoading } = useQuery<any[]>({
    queryKey: ['admin-branch-managers'],
    queryFn: () => adminFetch('/admin/branch-managers'),
  });

  const filteredManagers = useMemo(
    () => managers.filter((manager) => matchesManagerSearch(manager, searchQuery)),
    [managers, searchQuery],
  );

  const totalPages = Math.max(1, Math.ceil(filteredManagers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedManagers = useMemo(
    () => filteredManagers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredManagers, safePage, pageSize],
  );
  const rangeStart = filteredManagers.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredManagers.length);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ['admin-stores'],
    queryFn: () => adminFetch('/stores'),
  });

  const branchOptions = useMemo(
    () =>
      stores.map((store: any) => ({
        id: store.id,
        name: `${formatBranchLabel(store.name)} — ${store.city}`,
      })),
    [stores],
  );

  const { data: appSettings } = useQuery({
    queryKey: ['admin-app-settings'],
    queryFn: () => adminFetch('/settings/app'),
  });

  useEffect(() => {
    if (appSettings?.deliveryMilestone1Orders != null) {
      setDeliveryMilestone1Orders(String(appSettings.deliveryMilestone1Orders));
    }
    if (appSettings?.deliveryMilestone2Orders != null) {
      setDeliveryMilestone2Orders(String(appSettings.deliveryMilestone2Orders));
    }
    if (appSettings?.deliveryMilestone3Orders != null) {
      setDeliveryMilestone3Orders(String(appSettings.deliveryMilestone3Orders));
    }
  }, [appSettings]);

  const { data: deliveryAccessRows = [], isLoading: deliveryAccessLoading } = useQuery<DeliveryAccessRow[]>({
    queryKey: ['delivery-access-stores'],
    queryFn: () => adminFetch('/admin/stores/delivery-access'),
  });

  const { data: deliveryAccessLog = [], isLoading: deliveryLogLoading } = useQuery<DeliveryAccessLogEntry[]>({
    queryKey: ['delivery-access-log'],
    queryFn: () => adminFetch('/admin/stores/delivery-access-log'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY) => adminFetch('/admin/branch-managers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-branch-managers'] });
      setForm(EMPTY);
      setShowForm(false);
      toast.success('Branch manager registered');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to register'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/admin/branch-managers/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-branch-managers'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update'),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminFetch(`/admin/branch-managers/${id}`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-branch-managers'] });
      setResetId(null);
      setNewPassword('');
      toast.success('Password updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to reset password'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof EDIT_EMPTY }) =>
      adminFetch(`/admin/branch-managers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-branch-managers'] });
      closeEditModal();
      toast.success('Branch manager updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update'),
  });

  const saveMilestones = useMutation({
    mutationFn: async () => {
      const m1 = parseInt(deliveryMilestone1Orders, 10) || DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone1;
      const m2 = parseInt(deliveryMilestone2Orders, 10) || DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone2;
      const m3 = parseInt(deliveryMilestone3Orders, 10) || DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone3;
      if (!(m1 < m2 && m2 < m3)) {
        throw new Error('Milestones must be strictly ascending (Starter < Growth < Delivery ready)');
      }
      return adminFetch('/settings/app', {
        method: 'PUT',
        body: JSON.stringify({
          deliveryMilestone1Orders: m1,
          deliveryMilestone2Orders: m2,
          deliveryMilestone3Orders: m3,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      qc.invalidateQueries({ queryKey: ['delivery-access-stores'] });
      toast.success('Milestones saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save milestones'),
  });

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.storeId) {
      toast.error('Please select a branch');
      return;
    }
    createMutation.mutate(form);
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetId || newPassword.length < 8) return;
    resetMutation.mutate({ id: resetId, password: newPassword });
  }

  function startEdit(manager: any) {
    setEditingId(manager.id);
    setEditForm({
      name: manager.name,
      email: manager.email,
      storeId: manager.storeId || manager.store?.id || '',
    });
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
    if (!editingId) return;
    if (!editForm.storeId) {
      toast.error('Please select a branch');
      return;
    }
    updateMutation.mutate({ id: editingId, data: editForm });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Branch Access</h1>
        <p className="text-muted text-sm">Manage branch admins and delivery access</p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">Branch managers</h2>
            <p className="text-muted text-sm">Register and manage branch admin accounts</p>
          </div>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setEditForm(EDIT_EMPTY);
              setResetId(null);
              setNewPassword('');
            }}
            className="btn-primary px-4 py-2.5 text-sm"
          >
            <Plus size={15} /> Register Manager
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 mb-6">
              <h3 className="font-semibold text-white mb-4">New Branch Manager</h3>
              <form onSubmit={submitForm} autoComplete="off" className="grid sm:grid-cols-2 gap-4">
                <input
                  className="input-field"
                  placeholder="Full name"
                  name="branch-manager-name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
                <input
                  className="input-field"
                  type="email"
                  placeholder="Email"
                  name="branch-manager-email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
                <input
                  className="input-field"
                  type="password"
                  placeholder="Password (min 8 characters)"
                  name="branch-manager-password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  minLength={8}
                  required
                />
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted sm:sr-only">
                    Assigned branch
                  </label>
                  <SearchableBranchSelect
                    stores={branchOptions}
                    value={form.storeId || undefined}
                    onChange={(storeId) => setForm((f) => ({ ...f, storeId }))}
                    formatName={(name) => name}
                    allowAll={false}
                    placeholder="Select branch"
                    fullWidth
                  />
                </div>
                <div className="sm:col-span-2 flex gap-3">
                  <button type="submit" disabled={createMutation.isPending} className="btn-primary px-6 py-2.5 text-sm">
                    {createMutation.isPending ? 'Registering...' : 'Register Manager'}
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
          {resetId && (
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
          <div className="border-b border-navy-border px-4 py-3">
            <div className="input-icon-wrap max-w-sm">
              <Search size={14} className="input-icon" aria-hidden />
              <input
                className="search-bar text-sm"
                placeholder="Search branch managers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search branch managers"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border">
                  {['Name', 'Email', 'Branch', 'Status', 'Last Login', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">Loading...</td>
                  </tr>
                )}
                {!isLoading && managers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">No branch managers registered yet</td>
                  </tr>
                )}
                {!isLoading && managers.length > 0 && filteredManagers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      No branch managers match &quot;{searchQuery}&quot;
                    </td>
                  </tr>
                )}
                {paginatedManagers.map((m: any) => (
                  <tr key={m.id} className="border-b border-navy-border hover:bg-navy-light/30">
                    <td className="px-4 py-3 text-white font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-muted text-xs">{m.email}</td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {m.store ? `${m.store.name.replace('Bing Chun - ', '')} (${m.store.city})` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${m.isActive ? 'text-green-400' : 'text-red-400'}`}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{formatDate(m.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          className="p-1.5 rounded-lg border border-navy-border text-muted hover:text-white hover:border-brand"
                          title="Edit details"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setToggleTarget(m)}
                          className={`p-1.5 rounded-lg border text-xs ${m.isActive ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'}`}
                          title={m.isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetId(m.id);
                            setNewPassword('');
                            setEditingId(null);
                            setEditForm(EDIT_EMPTY);
                          }}
                          className="p-1.5 rounded-lg border border-navy-border text-muted hover:text-white hover:border-brand"
                          title="Reset password"
                        >
                          <KeyRound size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminTablePagination
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalItems={filteredManagers.length}
            safePage={safePage}
            totalPages={totalPages}
            pageList={buildPageList(safePage, totalPages)}
            onPageChange={setPage}
            itemLabel="branch managers"
            ariaLabel="Branch managers pagination"
          />
        </div>
      </section>

      <section className="space-y-6">
        <div className="card p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="mb-1 font-semibold text-fg">Delivery access milestones</h2>
              <p className="text-xs text-muted">
                Monthly paid order targets for the progress bar in Delivery Access. Does not auto-enable delivery.
              </p>
            </div>
            <button
              type="button"
              onClick={() => saveMilestones.mutate()}
              disabled={saveMilestones.isPending}
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm shrink-0"
            >
              <Save size={14} />
              {saveMilestones.isPending ? 'Saving…' : 'Save milestones'}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="milestone-starter" className="mb-1.5 block text-xs font-medium text-muted">
                Starter (orders/mo)
              </label>
              <input
                id="milestone-starter"
                className="input-field text-sm"
                type="number"
                min={1}
                value={deliveryMilestone1Orders}
                onChange={(e) => setDeliveryMilestone1Orders(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="milestone-growth" className="mb-1.5 block text-xs font-medium text-muted">
                Growth (orders/mo)
              </label>
              <input
                id="milestone-growth"
                className="input-field text-sm"
                type="number"
                min={1}
                value={deliveryMilestone2Orders}
                onChange={(e) => setDeliveryMilestone2Orders(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="milestone-ready" className="mb-1.5 block text-xs font-medium text-muted">
                Delivery ready (orders/mo)
              </label>
              <input
                id="milestone-ready"
                className="input-field text-sm"
                type="number"
                min={1}
                value={deliveryMilestone3Orders}
                onChange={(e) => setDeliveryMilestone3Orders(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DeliveryAccessSettingsTable rows={deliveryAccessRows} loading={deliveryAccessLoading} />
        <DeliveryAccessHistoryLog entries={deliveryAccessLog} loading={deliveryLogLoading} />
      </section>

      <Dialog
        open={!!editingId}
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
              <DialogTitle className="text-lg font-semibold text-white">Edit Branch Manager</DialogTitle>
              <DialogDescription className="text-sm text-muted">
                Update name, email, or assigned branch.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-6 py-5">
              <div>
                <label htmlFor="edit-manager-name" className="mb-1.5 block text-xs font-medium text-muted">
                  Full name
                </label>
                <input
                  id="edit-manager-name"
                  className="input-field"
                  placeholder="Full name"
                  name="edit-branch-manager-name"
                  autoComplete="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-manager-email" className="mb-1.5 block text-xs font-medium text-muted">
                  Email
                </label>
                <input
                  id="edit-manager-email"
                  className="input-field"
                  type="email"
                  placeholder="Email"
                  name="edit-branch-manager-email"
                  autoComplete="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="w-full">
                <label htmlFor="edit-manager-branch" className="mb-1.5 block text-xs font-medium text-muted">
                  Assigned branch
                </label>
                <SearchableBranchSelect
                  stores={branchOptions}
                  value={editForm.storeId || undefined}
                  onChange={(storeId) => setEditForm((f) => ({ ...f, storeId }))}
                  formatName={(name) => name}
                  allowAll={false}
                  placeholder="Select branch"
                  fullWidth
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

      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia
              className={
                toggleTarget?.isActive
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-green-500/10 text-green-500'
              }
            >
              <Power />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? 'Deactivate branch manager?' : 'Activate branch manager?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget
                ? toggleTarget.isActive
                  ? `"${toggleTarget.name}" will lose access to the admin panel${toggleTarget.store ? ` for ${toggleTarget.store.name.replace('Bing Chun - ', '')}` : ''}. You can reactivate them later.`
                  : `"${toggleTarget.name}" will regain access to the admin panel${toggleTarget.store ? ` for ${toggleTarget.store.name.replace('Bing Chun - ', '')}` : ''}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={toggleTarget?.isActive ? 'destructive' : 'default'}
              disabled={toggleMutation.isPending}
              onClick={() => {
                if (!toggleTarget) return;
                toggleMutation.mutate(
                  { id: toggleTarget.id, isActive: !toggleTarget.isActive },
                  { onSuccess: () => setToggleTarget(null) },
                );
              }}
            >
              {toggleMutation.isPending
                ? toggleTarget?.isActive
                  ? 'Deactivating…'
                  : 'Activating…'
                : toggleTarget?.isActive
                  ? 'Deactivate'
                  : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
