'use client';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DeliveryMilestoneProgressCell from '@/components/admin/DeliveryMilestoneProgressCell';
import {
  computeDeliveryMilestoneProgress,
  DEFAULT_DELIVERY_MILESTONE_ORDERS,
  type DeliveryMilestoneProgress,
} from '@/lib/deliveryAccessMilestones';
import { formatMoneyAmount } from '@/lib/receipt';
import { shortBranchName } from '@/lib/branchName';

export type DeliveryAccessRow = {
  storeId: string;
  branchName: string;
  deliveryEnabled: boolean;
  tier: 'top' | 'standard';
  ordersThisMonth: number;
  grossSalesThisMonth: number;
  milestone?: DeliveryMilestoneProgress;
};

export type DeliveryAccessFilter = 'all' | 'delivery' | 'pickup';

type Props = {
  rows: DeliveryAccessRow[];
  loading?: boolean;
  onRefresh?: () => void;
  pageSize?: number;
};

const PAGE_SIZE = 10;

function resolveMilestone(row: DeliveryAccessRow): DeliveryMilestoneProgress {
  if (row.milestone) return row.milestone;
  return computeDeliveryMilestoneProgress(row.ordersThisMonth, row.deliveryEnabled, {
    milestone1: DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone1,
    milestone2: DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone2,
    milestone3: DEFAULT_DELIVERY_MILESTONE_ORDERS.milestone3,
  });
}

export default function DeliveryAccessSettingsTable({
  rows,
  loading,
  onRefresh,
  pageSize = PAGE_SIZE,
}: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<DeliveryAccessFilter>('all');
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<DeliveryAccessRow | null>(null);
  const [nextEnabled, setNextEnabled] = useState<boolean | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = rows;
    if (tierFilter === 'delivery') list = list.filter((row) => row.deliveryEnabled);
    if (tierFilter === 'pickup') list = list.filter((row) => !row.deliveryEnabled);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        row.branchName.toLowerCase().includes(q) ||
        shortBranchName(row.branchName).toLowerCase().includes(q),
    );
  }, [rows, search, tierFilter]);

  useEffect(() => {
    setPage(0);
  }, [search, tierFilter, rows.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleRows = useMemo(() => {
    const start = safePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const toggleMutation = useMutation({
    mutationFn: ({
      storeId,
      enabled,
      password: passcode,
      reason: changeReason,
    }: {
      storeId: string;
      enabled: boolean;
      password: string;
      reason?: string;
    }) =>
      adminFetch(`/admin/stores/${storeId}/delivery-access`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled,
          password: passcode,
          reason: changeReason?.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Delivery access updated');
      qc.invalidateQueries({ queryKey: ['delivery-access-stores'] });
      qc.invalidateQueries({ queryKey: ['delivery-access-log'] });
      onRefresh?.();
      clearAutofillPollution();
      closeModal();
    },
    onError: (err: Error) => {
      if (err.message.toLowerCase().includes('passcode') || err.message.toLowerCase().includes('invalid')) {
        setPasscodeError(err.message);
        return;
      }
      toast.error(err.message);
    },
  });

  function closeModal() {
    setPending(null);
    setNextEnabled(null);
    setModalStep(1);
    setReason('');
    setPassword('');
    setShowPassword(false);
    setPasscodeError(null);
  }

  function clearAutofillPollution() {
    setSearch((prev) => (prev.includes('@') ? '' : prev));
  }

  function requestToggle(row: DeliveryAccessRow) {
    setPending(row);
    setNextEnabled(!row.deliveryEnabled);
    setModalStep(1);
    setReason('');
    setPassword('');
    setShowPassword(false);
    setPasscodeError(null);
  }

  if (loading) {
    return (
      <div className="card flex min-h-[240px] items-center justify-center text-sm text-muted">
        Loading delivery access settings…
      </div>
    );
  }

  return (
    <>
      <div className="card flex h-full flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-navy-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-fg">Delivery Access</h2>
            <p className="mt-0.5 text-xs text-muted">
              Enable or disable delivery for any branch. Changes take effect immediately.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10.5rem] sm:items-center sm:gap-3">
            <div className="input-icon-wrap min-w-0">
              <Search size={14} className="input-icon" aria-hidden />
              <input
                className="search-bar text-sm"
                type="search"
                name="delivery-access-branch-search"
                placeholder="Search branch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore
                aria-label="Search branches"
              />
            </div>
            <select
              className="filter-select w-full text-sm"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as DeliveryAccessFilter)}
              aria-label="Filter delivery access"
            >
              <option value="all">All Branches</option>
              <option value="delivery">Delivery & Pickup</option>
              <option value="pickup">Pickup Only</option>
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="flex min-h-[220px] flex-1 items-center justify-center p-5 text-sm text-muted">
            {search.trim() || tierFilter !== 'all'
              ? 'No branches match your filters'
              : 'No branches found'}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-navy-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-semibold">Branch</th>
                    <th className="px-3 py-3 font-semibold">Tier</th>
                    <th className="px-3 py-3 pr-8 font-semibold">Current Milestone Progress</th>
                    <th className="py-3 pl-4 pr-3 font-semibold">Orders / mo</th>
                    <th className="px-3 py-3 font-semibold">Gross Sales (LKR)</th>
                    <th className="px-5 py-3 font-semibold">Delivery Access</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                <tr key={row.storeId} className="border-b border-navy-border/60 last:border-0">
                  <td className="px-5 py-3 font-medium text-fg">
                    {shortBranchName(row.branchName)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        row.tier === 'top'
                          ? 'bg-indigo-500/15 text-indigo-400'
                          : 'bg-amber-500/15 text-amber-500'
                      }`}
                    >
                      {row.tier === 'top' ? 'Delivery & Pickup' : 'Pickup Only'}
                    </span>
                  </td>
                  <td className="px-3 py-3 pr-8">
                    <DeliveryMilestoneProgressCell milestone={resolveMilestone(row)} />
                  </td>
                  <td className="py-3 pl-4 pr-3 font-bold tabular-nums text-fg">
                    {row.ordersThisMonth}
                  </td>
                  <td className="px-3 py-3 font-bold tabular-nums text-fg">
                    {formatMoneyAmount(row.grossSalesThisMonth)}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.deliveryEnabled}
                      onClick={() => requestToggle(row)}
                      disabled={toggleMutation.isPending}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                        row.deliveryEnabled ? 'bg-brand' : 'bg-navy-light'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          row.deliveryEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-navy-border/60 px-5 py-3">
              <p className="text-xs text-muted">
                Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of{' '}
                {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <span className="text-xs font-medium text-muted">
                  Page {safePage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {pending && nextEnabled !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            {modalStep === 1 ? (
              <>
                <h3 className="text-lg font-bold text-fg">
                  {nextEnabled ? 'Enable delivery access?' : 'Disable delivery access?'}
                </h3>
                <p className="mt-2 text-sm text-muted">
                  {nextEnabled
                    ? `Enable delivery for ${shortBranchName(pending.branchName)}? This branch will become a Delivery & Pickup branch.`
                    : `Disable delivery for ${shortBranchName(pending.branchName)}? Active delivery orders won't be affected, but no new delivery orders can be placed.`}
                </p>
                <div className="mt-4">
                  <label htmlFor="delivery-access-reason" className="mb-1.5 block text-xs font-medium text-muted">
                    Reason (optional)
                  </label>
                  <textarea
                    id="delivery-access-reason"
                    className="input-field min-h-[80px] w-full resize-y text-sm"
                    placeholder="Why are you making this change?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                  />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" className="btn-outline px-4 py-2 text-sm" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    onClick={() => setModalStep(2)}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <form
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (toggleMutation.isPending || !password.trim()) return;
                  toggleMutation.mutate({
                    storeId: pending.storeId,
                    enabled: nextEnabled,
                    password,
                    reason,
                  });
                }}
              >
                <h3 className="text-lg font-bold text-fg">Confirm your identity</h3>
                <p className="mt-2 text-sm text-muted">
                  Enter your admin password to {nextEnabled ? 'enable' : 'disable'} delivery for{' '}
                  {shortBranchName(pending.branchName)}.
                </p>
                <div className="mt-4">
                  <label htmlFor="delivery-access-password" className="mb-1.5 block text-xs font-medium text-muted">
                    Admin password
                  </label>
                  <div className="relative">
                    <input
                      id="delivery-access-password"
                      name="delivery-access-admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="input-field w-full pr-10 text-sm"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasscodeError(null);
                      }}
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
                  {passcodeError && (
                    <p className="mt-2 text-xs text-red-400" role="alert">
                      {passcodeError}
                    </p>
                  )}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="btn-outline px-4 py-2 text-sm"
                    onClick={() => {
                      setModalStep(1);
                      setPassword('');
                      setPasscodeError(null);
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${
                      nextEnabled ? 'btn-primary' : 'bg-red-500 text-white hover:bg-red-600'
                    }`}
                    disabled={toggleMutation.isPending || !password.trim()}
                  >
                    {toggleMutation.isPending ? 'Saving…' : 'Confirm Change'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
