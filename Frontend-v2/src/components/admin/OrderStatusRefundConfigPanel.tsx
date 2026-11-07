'use client';

import { getApiBaseUrl } from '@/lib/apiBase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getStatusLabel } from '@/lib/orderStatus';
import type { OrderStatus } from '@/types';

export type OrderStatusRefundConfig = {
  id: string;
  orderStatus: OrderStatus;
  refundPercentage: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditFormState = {
  refundPercentage: string;
  isActive: boolean;
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

const STATUS_ORDER: OrderStatus[] = [
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

export default function OrderStatusRefundConfigPanel() {
  const qc = useQueryClient();
  const [editingStatus, setEditingStatus] = useState<OrderStatus | null>(null);
  const [form, setForm] = useState<EditFormState>({ refundPercentage: '100', isActive: true });

  const configsQuery = useQuery({
    queryKey: ['admin-order-status-refund-configs'],
    queryFn: () => adminFetch<OrderStatusRefundConfig[]>('/settings/order-status-refunds/all'),
  });

  const saveMutation = useMutation({
    mutationFn: async (orderStatus: OrderStatus) => {
      const refundPercentage = Number.parseFloat(form.refundPercentage);
      if (!Number.isFinite(refundPercentage) || refundPercentage < 0 || refundPercentage > 100) {
        throw new Error('Enter a valid refund percentage between 0 and 100');
      }
      return adminFetch<OrderStatusRefundConfig>(`/settings/order-status-refunds/${orderStatus}`, {
        method: 'PUT',
        body: JSON.stringify({
          refundPercentage,
          isActive: form.isActive,
        }),
      });
    },
    onSuccess: () => {
      toast.success('Status refund percentage updated');
      setEditingStatus(null);
      void qc.invalidateQueries({ queryKey: ['admin-order-status-refund-configs'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ orderStatus, isActive, refundPercentage }: {
      orderStatus: OrderStatus;
      isActive: boolean;
      refundPercentage: number;
    }) =>
      adminFetch<OrderStatusRefundConfig>(`/settings/order-status-refunds/${orderStatus}`, {
        method: 'PUT',
        body: JSON.stringify({ refundPercentage, isActive }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-order-status-refund-configs'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const configs = configsQuery.data ?? [];
  const configByStatus = useMemo(
    () => new Map(configs.map((config) => [config.orderStatus, config])),
    [configs],
  );

  const orderedConfigs = useMemo(
    () => STATUS_ORDER
      .map((status) => configByStatus.get(status))
      .filter((config): config is OrderStatusRefundConfig => config != null),
    [configByStatus],
  );

  const activeCount = useMemo(
    () => orderedConfigs.filter((config) => config.isActive).length,
    [orderedConfigs],
  );

  function openEditForm(config: OrderStatusRefundConfig) {
    setEditingStatus(config.orderStatus);
    setForm({
      refundPercentage: String(config.refundPercentage),
      isActive: config.isActive,
    });
  }

  return (
    <div className="card p-5 mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h2 className="font-semibold text-white">Status Refund Percentages</h2>
          <p className="text-xs text-muted mt-1">
            Set the fixed refund percentage applied when a customer cancels after the full-refund window, based on the order status at cancellation.
          </p>
          <p className="text-xs text-muted mt-1">{activeCount} active status rule{activeCount === 1 ? '' : 's'}</p>
        </div>
      </div>

      {configsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading status refund rules...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs text-muted">Order status</th>
                <th className="px-3 py-2 text-left text-xs text-muted">Refund %</th>
                <th className="px-3 py-2 text-left text-xs text-muted">Status</th>
                <th className="px-3 py-2 text-right text-xs text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedConfigs.map((config) => (
                <tr key={config.id} className="border-t border-navy-border">
                  <td className="px-3 py-3">{getStatusLabel(config.orderStatus)}</td>
                  <td className="px-3 py-3 tabular-nums">{config.refundPercentage}%</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      config.isActive
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-navy-light text-muted border border-navy-border'
                    }`}>
                      {config.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(config)}
                        className="btn-outline p-2"
                        aria-label={`Edit ${getStatusLabel(config.orderStatus)}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({
                          orderStatus: config.orderStatus,
                          isActive: !config.isActive,
                          refundPercentage: config.refundPercentage,
                        })}
                        className="btn-outline p-2"
                        aria-label={config.isActive ? `Deactivate ${getStatusLabel(config.orderStatus)}` : `Activate ${getStatusLabel(config.orderStatus)}`}
                      >
                        {config.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingStatus && (
        <div className="mt-5 rounded-xl border border-navy-border bg-navy-light/40 p-4">
          <h3 className="font-medium text-fg mb-3">
            Edit refund percentage — {getStatusLabel(editingStatus)}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 max-w-md">
            <div>
              <label className="text-xs text-muted block mb-1">Refund percentage</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="input-field w-full tabular-nums"
                value={form.refundPercentage}
                onChange={(e) => setForm((prev) => ({ ...prev, refundPercentage: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate(editingStatus)}
              disabled={saveMutation.isPending}
              className="btn-primary px-4 py-2 text-sm"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => setEditingStatus(null)}
              className="btn-outline px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
