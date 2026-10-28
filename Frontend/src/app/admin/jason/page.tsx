'use client';

import { getApiBaseUrl } from '@/lib/apiBase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import { formatDate, todayDateString } from '@/lib/datetime';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { formatWithdrawalPayoutRef } from '@/components/admin/settlementTypes';
import { confirmDialog } from '@/store/confirmStore';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type LedgerType = 'INVESTMENT' | 'EXPENSE';
type TypeFilter = 'ALL' | LedgerType;

type LedgerEntry = {
  id: string;
  type: LedgerType;
  amount: number;
  description: string;
  occurredAt: string;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  storeId?: string | null;
  storeWithdrawalId?: string | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
};

type LedgerResponse = {
  entries: LedgerEntry[];
  summary: {
    totalInvestments: number;
    totalExpenses: number;
    net: number;
  };
};

const EMPTY_FORM = {
  amount: '',
  type: 'EXPENSE' as LedgerType,
  description: '',
  occurredAt: todayDateString(),
};

function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    return d.data ?? d;
  });
}

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'INVESTMENT', label: 'Investments' },
  { id: 'EXPENSE', label: 'Expenses' },
];

export default function JasonLedgerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isSuperAdmin(session)) {
      router.replace('/admin');
      return;
    }
    setReady(true);
  }, [router]);

  const queryKey = ['admin-jason-ledger', typeFilter] as const;

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey,
    queryFn: () => {
      const qs = typeFilter === 'ALL' ? '' : `?type=${typeFilter}`;
      return adminFetch(`/admin/jason${qs}`);
    },
    enabled: ready,
  });

  const entries = data?.entries ?? [];
  const summary = data?.summary ?? { totalInvestments: 0, totalExpenses: 0, net: 0 };
  const hasPayoutLinkedEntries = entries.some((entry) => entry.storeWithdrawalId);

  const createMutation = useMutation({
    mutationFn: (body: { amount: number; type: LedgerType; description: string; occurredAt: string }) =>
      adminFetch('/admin/jason', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-jason-ledger'] });
      setForm({ ...EMPTY_FORM, occurredAt: todayDateString() });
      setShowForm(false);
      toast.success('Entry added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add entry'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/admin/jason/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-jason-ledger'] });
      toast.success(vars.isActive ? 'Entry activated' : 'Entry inactivated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update entry'),
  });

  function openAddSheet() {
    setForm({ ...EMPTY_FORM, occurredAt: todayDateString() });
    setShowForm(true);
  }

  function closeAddSheet() {
    if (createMutation.isPending) return;
    setShowForm(false);
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    createMutation.mutate({
      amount,
      type: form.type,
      description: form.description.trim(),
      occurredAt: form.occurredAt,
    });
  }

  async function handleToggleActive(entry: LedgerEntry) {
    if (entry.isActive) {
      const confirmed = await confirmDialog({
        title: 'Mark this entry inactive?',
        message: `The ${entry.type === 'INVESTMENT' ? 'investment' : 'expense'} of ${formatMoney(entry.amount)} will stay in the ledger but will not count toward totals.`,
        confirmLabel: 'Mark inactive',
        cancelLabel: 'Cancel',
        variant: 'danger',
      });
      if (!confirmed) return;
      toggleMutation.mutate({ id: entry.id, isActive: false });
      return;
    }
    toggleMutation.mutate({ id: entry.id, isActive: true });
  }

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">JASON</h1>
          <p className="text-sm text-muted">Investments and expenses ledger</p>
        </div>
        <button
          type="button"
          onClick={openAddSheet}
          className="btn-primary px-4 py-2.5 text-sm"
        >
          <Plus size={15} /> Add entry
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DashboardKpiCard
          variant="sales"
          label="Total investments"
          value={formatMoney(summary.totalInvestments)}
          icon={TrendingUp}
          tone="green"
          loading={isLoading}
        />
        <DashboardKpiCard
          variant="sales"
          label="Total expenses"
          value={formatMoney(summary.totalExpenses)}
          icon={TrendingDown}
          tone="orange"
          loading={isLoading}
        />
        <DashboardKpiCard
          variant="sales"
          label="Net"
          value={formatMoney(summary.net)}
          icon={Scale}
          tone="blue"
          loading={isLoading}
        />
      </div>

      <Sheet open={showForm} onOpenChange={(open) => { if (!open) closeAddSheet(); }}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden border-navy-border bg-navy-card p-0 text-fg sm:max-w-md"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-navy-border px-5 py-5 pr-12">
            <SheetTitle className="text-lg font-bold text-white">New entry</SheetTitle>
            <SheetDescription className="text-sm text-muted">
              Add an investment or expense to the JASON ledger.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submitForm} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <label className="mb-1 block text-xs text-muted">Amount (LKR)</label>
                <input
                  className="input-field"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Type</label>
                <select
                  className="input-field"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LedgerType }))}
                  required
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="INVESTMENT">Investment</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Date</label>
                <input
                  className="input-field"
                  type="date"
                  value={form.occurredAt}
                  onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Description</label>
                <textarea
                  className="input-field min-h-[120px] resize-y"
                  placeholder="What was this for?"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>
            </div>

            <SheetFooter className="shrink-0 flex-row border-t border-navy-border px-5 py-4">
              <button
                type="button"
                onClick={closeAddSheet}
                disabled={createMutation.isPending}
                className="btn-outline flex-1 px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary flex-1 px-4 py-2.5 text-sm"
              >
                {createMutation.isPending ? 'Saving...' : 'Save entry'}
              </button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-navy-border p-4">
          {TYPE_TABS.map((tab) => {
            const isActive = typeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'bg-white/5 text-muted hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr className="border-b border-navy-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted">Amount (LKR)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Description</th>
                {hasPayoutLinkedEntries && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">Payout</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">Jason balance</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={hasPayoutLinkedEntries ? 8 : 6} className="px-4 py-8 text-center text-muted">
                    Loading...
                  </td>
                </tr>
              )}
              {!isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={hasPayoutLinkedEntries ? 8 : 6} className="px-4 py-8 text-center text-muted">
                    No entries yet. Add an investment or expense to start the ledger.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-b border-navy-border hover:bg-navy-light/30 ${entry.isActive ? '' : 'opacity-60'}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDate(entry.occurredAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        entry.type === 'INVESTMENT'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-orange-500/15 text-orange-300'
                      }`}
                    >
                      {entry.type === 'INVESTMENT' ? 'Investment' : 'Expense'}
                    </span>
                  </td>
                  <td className="admin-table__amount whitespace-nowrap px-4 py-3 text-right tabular-nums text-white">
                    {formatMoneyAmount(entry.amount)}
                  </td>
                  <td className={`max-w-md px-4 py-3 ${entry.isActive ? 'text-white' : 'text-muted'}`}>
                    {entry.description}
                  </td>
                  {hasPayoutLinkedEntries && (
                    <>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {entry.storeWithdrawalId ? (
                          <span title={entry.storeWithdrawalId}>
                            {formatWithdrawalPayoutRef(entry.storeWithdrawalId, entry.storeId)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="admin-table__amount whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-muted">
                        {entry.balanceBefore != null && entry.balanceAfter != null ? (
                          <>
                            {formatMoneyAmount(entry.balanceBefore)} → {formatMoneyAmount(entry.balanceAfter)}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${entry.isActive ? 'text-green-400' : 'text-red-400'}`}>
                      {entry.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(entry)}
                      disabled={toggleMutation.isPending}
                      className={`rounded-lg border p-1.5 text-xs ${
                        entry.isActive
                          ? 'border-red-500/30 text-red-400'
                          : 'border-green-500/30 text-green-400'
                      }`}
                      title={entry.isActive ? 'Mark inactive' : 'Activate'}
                    >
                      <Power size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
