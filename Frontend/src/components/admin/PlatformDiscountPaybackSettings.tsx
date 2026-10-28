'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, Percent, Save, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';

function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return data.data ?? data;
  });
}

type BranchPaybackRow = {
  storeId: string;
  name: string;
  city: string;
  platformDiscountPaybackEnabled: boolean;
  hasPendingWithdrawals: boolean;
};

export default function PlatformDiscountPaybackSettings() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [branches, setBranches] = useState<BranchPaybackRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, boolean>>({});
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-platform-discount-payback'],
    queryFn: () => adminFetch('/settings/platform-discount-payback'),
  });

  useEffect(() => {
    if (!data || !Array.isArray(data)) return;
    setBranches(data);
    const snapshot: Record<string, boolean> = {};
    for (const row of data as BranchPaybackRow[]) {
      snapshot[row.storeId] = row.platformDiscountPaybackEnabled;
    }
    setSavedSnapshot(snapshot);
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.storeId.toLowerCase().includes(q),
    );
  }, [branches, search]);

  const changedCount = useMemo(() => {
    return branches.filter((b) => savedSnapshot[b.storeId] !== b.platformDiscountPaybackEnabled).length;
  }, [branches, savedSnapshot]);

  const isDirty = changedCount > 0;

  const save = useMutation({
    mutationFn: async ({ passcode: adminPasscode }: { passcode: string }) => {
      await adminFetch('/settings/platform-discount-payback', {
        method: 'PUT',
        body: JSON.stringify({
          branches: branches.map((b) => ({
            storeId: b.storeId,
            enabled: b.platformDiscountPaybackEnabled,
          })),
          passcode: adminPasscode,
        }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-platform-discount-payback'] });
      closePasscodeModal();
      toast.success('Platform discount payback settings saved');
    },
    onError: (e: Error) => {
      const message = e.message.toLowerCase();
      if (message.includes('passcode') || message.includes('invalid')) {
        setPasscodeError(e.message);
        return;
      }
      toast.error(e.message);
    },
  });

  function closePasscodeModal() {
    setShowPasscodeModal(false);
    setPasscode('');
    setShowPasscode(false);
    setPasscodeError(null);
  }

  function openPasscodeModal() {
    setPasscode('');
    setShowPasscode(false);
    setPasscodeError(null);
    setShowPasscodeModal(true);
  }

  function confirmSave() {
    if (!passcode.trim()) return;
    save.mutate({ passcode });
  }

  function setAll(enabled: boolean) {
    const visibleIds = new Set(filtered.map((b) => b.storeId));
    setBranches((prev) =>
      prev.map((b) =>
        visibleIds.has(b.storeId) && !b.hasPendingWithdrawals
          ? { ...b, platformDiscountPaybackEnabled: enabled }
          : b,
      ),
    );
  }

  function toggleBranch(storeId: string, enabled: boolean) {
    setBranches((prev) =>
      prev.map((b) => (b.storeId === storeId ? { ...b, platformDiscountPaybackEnabled: enabled } : b)),
    );
  }

  return (
    <>
      <div className="card p-5">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
          <Percent size={18} className="text-brand" />
          Platform Discount Payback
        </h2>
        <p className="text-xs text-muted mb-4">
          Super admin only — choose which branches receive reimbursement when customers use platform-funded promotions.
          Branches with pending payout requests cannot be changed until those requests are completed.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search branches by name"
              className="input-field pl-9 w-full"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="btn-outline text-xs px-3 py-2" onClick={() => setAll(true)}>
              Enable all
            </button>
            <button type="button" className="btn-outline text-xs px-3 py-2" onClick={() => setAll(false)}>
              Disable all
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Loading branches…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">No branches match your search.</p>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filtered.map((branch) => (
              <li key={branch.storeId}>
                <label
                  className={`flex items-center justify-between gap-4 p-3 rounded-xl border border-navy-border ${
                    branch.hasPendingWithdrawals
                      ? 'opacity-70 cursor-not-allowed'
                      : 'cursor-pointer hover:border-brand/40'
                  }`}
                  title={
                    branch.hasPendingWithdrawals
                      ? 'This branch has pending payout requests. Complete them first.'
                      : undefined
                  }
                >
                  <div className="min-w-0 flex items-center gap-2">
                    {branch.hasPendingWithdrawals && (
                      <Lock size={14} className="text-amber-400 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{branch.name}</p>
                      <p className="text-xs text-muted">
                        {branch.city}
                        {branch.hasPendingWithdrawals ? ' · Pending payout requests' : ''}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={branch.platformDiscountPaybackEnabled}
                    disabled={branch.hasPendingWithdrawals}
                    onChange={(e) => toggleBranch(branch.storeId, e.target.checked)}
                    className="w-5 h-5 accent-brand shrink-0 disabled:cursor-not-allowed"
                  />
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            disabled={!isDirty || save.isPending}
            onClick={openPasscodeModal}
          >
            <Save size={16} />
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {showPasscodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-fg">Confirm your identity</h3>
            <p className="mt-2 text-sm text-muted">
              You are updating payback settings for {changedCount} branch
              {changedCount === 1 ? '' : 'es'}. Enter your admin password to continue.
            </p>
            <div className="mt-4">
              <label htmlFor="payback-settings-passcode" className="mb-1.5 block text-xs font-medium text-muted">
                Admin password
              </label>
              <div className="relative">
                <input
                  id="payback-settings-passcode"
                  type={showPasscode ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input-field w-full pr-10 text-sm"
                  placeholder="Enter your password"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    setPasscodeError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && passcode.trim()) {
                      confirmSave();
                    }
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                  onClick={() => setShowPasscode((value) => !value)}
                  aria-label={showPasscode ? 'Hide password' : 'Show password'}
                >
                  {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
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
                disabled={save.isPending}
                onClick={closePasscodeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                disabled={save.isPending || !passcode.trim()}
                onClick={confirmSave}
              >
                {save.isPending ? 'Saving…' : 'Confirm & save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
