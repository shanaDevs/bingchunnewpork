'use client';

import { getApiBaseUrl } from '@/lib/apiBase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Pencil, Plus, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

export type CancelReasonConfig = {
  id: string;
  label: string;
  value: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  label: string;
  value: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  label: '',
  value: '',
  sortOrder: '0',
  isActive: true,
};

async function adminFetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json.data as T;
}

function parseForm(form: FormState, isEdit: boolean) {
  const sortOrder = Number.parseInt(form.sortOrder, 10);

  if (!form.label.trim()) throw new Error('Label is required');

  return {
    label: form.label.trim(),
    ...(isEdit && form.value.trim() ? { value: form.value.trim() } : {}),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    isActive: form.isActive,
  };
}

export default function CancelReasonConfigPanel() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [portalReady, setPortalReady] = useState(false);

  const reasonsQuery = useQuery({
    queryKey: ['admin-cancel-reason-configs'],
    queryFn: () => adminFetch<CancelReasonConfig[]>('/settings/cancel-reasons/all'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = parseForm(form, Boolean(editingId));
      if (editingId) {
        return adminFetch<CancelReasonConfig>(`/settings/cancel-reasons/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      return adminFetch<CancelReasonConfig>('/settings/cancel-reasons', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editingId ? 'Cancellation reason updated' : 'Cancellation reason created');
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ['admin-cancel-reason-configs'] });
      void qc.invalidateQueries({ queryKey: ['cancel-reasons'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch<CancelReasonConfig>(`/settings/cancel-reasons/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-cancel-reason-configs'] });
      void qc.invalidateQueries({ queryKey: ['cancel-reasons'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reasons = reasonsQuery.data ?? [];
  const activeCount = useMemo(() => reasons.filter((reason) => reason.isActive).length, [reasons]);

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditForm(reason: CancelReasonConfig) {
    setEditingId(reason.id);
    setForm({
      label: reason.label,
      value: reason.value,
      sortOrder: String(reason.sortOrder),
      isActive: reason.isActive,
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [formOpen]);

  return (
    <div className="card p-5 mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h2 className="font-semibold text-white">Cancellation Reasons</h2>
          <p className="text-xs text-muted mt-1">
            Manage customer-facing cancellation reasons shown when an order is cancelled.
          </p>
          <p className="text-xs text-muted mt-1">{activeCount} active reason{activeCount === 1 ? '' : 's'}</p>
        </div>
        <button type="button" onClick={openCreateForm} className="btn-primary px-3 py-2 text-sm flex items-center gap-1.5 shrink-0">
          <Plus size={14} />
          Add Reason
        </button>
      </div>

      {reasonsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading cancellation reasons...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs text-muted">Label</th>
                <th className="px-3 py-2 text-left text-xs text-muted">Value</th>
                <th className="px-3 py-2 text-left text-xs text-muted">Order</th>
                <th className="px-3 py-2 text-left text-xs text-muted">Status</th>
                <th className="px-3 py-2 text-right text-xs text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((reason) => (
                <tr key={reason.id} className="border-t border-navy-border">
                  <td className="px-3 py-3">{reason.label}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted">{reason.value}</td>
                  <td className="px-3 py-3 tabular-nums">{reason.sortOrder}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      reason.isActive
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-navy-light text-muted border border-navy-border'
                    }`}>
                      {reason.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(reason)}
                        className="btn-outline p-2"
                        aria-label={`Edit ${reason.label}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({ id: reason.id, isActive: !reason.isActive })}
                        className="btn-outline p-2"
                        aria-label={reason.isActive ? `Deactivate ${reason.label}` : `Activate ${reason.label}`}
                      >
                        {reason.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {portalReady && createPortal(
        <AnimatePresence>
          {formOpen && (
            <>
              <motion.button
                key="cancel-reason-backdrop"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm"
                aria-label="Close"
                onClick={closeForm}
              />
              <motion.aside
                key="cancel-reason-drawer"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="fixed inset-y-0 right-0 z-[1201] flex h-dvh w-full max-w-md flex-col border-l border-navy-border bg-navy-card shadow-2xl"
                role="dialog"
                aria-modal
                aria-label={editingId ? 'Edit cancellation reason' : 'Add cancellation reason'}
              >
                <div className="flex shrink-0 items-start justify-between border-b border-navy-border px-6 py-5">
                  <div>
                    <h3 className="text-lg font-semibold text-fg">
                      {editingId ? 'Edit cancellation reason' : 'Add cancellation reason'}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      Shown to customers when they cancel an order.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-muted hover:bg-navy-light hover:text-fg"
                    onClick={closeForm}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <div>
                    <label className="mb-1 block text-xs text-muted">Label</label>
                    <input
                      className="input-field w-full"
                      value={form.label}
                      onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                      placeholder="Changed my mind"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Sort order</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field w-full"
                      value={form.sortOrder}
                      onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                    />
                    Active for customers
                  </label>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-navy-border px-6 py-4">
                  <button type="button" onClick={closeForm} className="btn-outline px-4 py-2 text-sm">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {saveMutation.isPending ? 'Saving...' : editingId ? 'Save changes' : 'Create reason'}
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
