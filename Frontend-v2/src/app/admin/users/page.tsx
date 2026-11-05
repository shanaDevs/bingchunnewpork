'use client';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, UserX, Settings2, Plus, Building2 } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { getDefaultMenusForRole, getPermissionMenuLabel } from '@/lib/adminPermissions';
import { buildPageList } from '@/lib/pagination';
import { formatStaffRole, getStaffRoleAvatarUrl } from '@/lib/staffRoleAvatar';

/* ------------------------------------------------------------------ */
/*  API helper                                                         */
/* ------------------------------------------------------------------ */
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
    return d;
  });
}

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

interface StoreOption {
  id: string;
  name: string;
  city: string;
}

interface PaginatedResponse {
  data: AdminUser[];
  meta: { total: number; page: number; limit: number; pages: number };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PAGE_SIZE = 20;

/**
 * Staff types an admin can create. `hq: true` means the account covers every
 * branch and is never linked to one — matches the backend's HQ_ROLES.
 */
const STAFF_TYPES = [
  {
    role: 'STORE_MANAGER',
    label: 'Branch Admin',
    blurb: 'Runs a single branch end to end.',
    hq: false,
  },
  {
    role: 'CASHIER',
    label: 'Cashier',
    blurb: 'Takes orders and handles the counter at one branch.',
    hq: false,
  },
  {
    role: 'DELIVERY_ADMIN',
    label: 'Delivery Admin',
    blurb: 'Runs delivery, live drivers, and the delivery wallet across all branches.',
    hq: true,
  },
] as const;

type StaffRole = (typeof STAFF_TYPES)[number]['role'];

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'STORE_MANAGER' as StaffRole,
  storeId: '',
};

function formatBranchLabel(name: string) {
  return name.replace('Bing Chun - ', '');
}

/* ------------------------------------------------------------------ */
/*  Skeleton card for loading state                                    */
/* ------------------------------------------------------------------ */
function UserTableSkeleton() {
  return (
    <tr className="border-b border-navy-border animate-pulse">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/5" />
          <div className="space-y-2">
            <div className="h-3.5 w-32 rounded bg-white/5" />
            <div className="h-2.5 w-48 rounded bg-white/5" />
          </div>
        </div>
      </td>
      <td className="px-4 py-4"><div className="h-4 w-24 rounded bg-white/5" /></td>
      <td className="px-4 py-4"><div className="h-3 w-32 rounded bg-white/5" /></td>
      <td className="px-4 py-4"><div className="h-5 w-16 rounded-full bg-white/5" /></td>
      <td className="px-4 py-4"><div className="h-7 w-20 rounded-lg bg-white/5" /></td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Create staff modal                                                 */
/* ------------------------------------------------------------------ */
function CreateStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const queryClient = useQueryClient();

  const selectedType = STAFF_TYPES.find((t) => t.role === form.role) ?? STAFF_TYPES[0];

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['admin-stores'],
    queryFn: async () => (await adminFetch('/stores')).data ?? [],
    enabled: open,
  });

  const branchOptions = useMemo(
    () =>
      stores.map((store) => ({
        id: store.id,
        name: `${formatBranchLabel(store.name)} — ${store.city}`,
      })),
    [stores],
  );

  // The areas the chosen type is provisioned with, so the operator sees what they grant.
  const defaultAreas = useMemo(
    () => getDefaultMenusForRole(form.role).map(getPermissionMenuLabel),
    [form.role],
  );

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminFetch('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`${selectedType.label} created`);
      setForm(EMPTY_FORM);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create staff account'),
  });

  function close() {
    setForm(EMPTY_FORM);
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType.hq && !form.storeId) {
      toast.error('Select a branch for this staff type');
      return;
    }
    createMutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      // HQ roles must not send a branch — the API rejects it.
      ...(selectedType.hq ? {} : { storeId: form.storeId }),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (createMutation.isPending) return;
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden border border-navy-border bg-navy-card p-0 shadow-2xl sm:max-w-lg"
        showCloseButton={!createMutation.isPending}
      >
        <form onSubmit={handleSubmit} autoComplete="off">
          <DialogHeader className="border-b border-navy-border px-6 py-4">
            <DialogTitle className="text-lg font-semibold text-white">Add Staff</DialogTitle>
            <DialogDescription className="text-sm text-muted">
              Choose a staff type — the account is created with that type&apos;s default access.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[65vh] gap-4 overflow-y-auto px-6 py-5">
            {/* Staff type */}
            <div>
              <span className="mb-2 block text-xs font-medium text-muted">Staff type</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {STAFF_TYPES.map((type) => {
                  const active = type.role === form.role;
                  return (
                    <button
                      key={type.role}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, role: type.role, storeId: type.hq ? '' : f.storeId }))
                      }
                      aria-pressed={active}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                        active
                          ? 'border-brand bg-brand/15 text-white'
                          : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{type.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">{selectedType.blurb}</p>
            </div>

            <div>
              <label htmlFor="new-staff-name" className="mb-1.5 block text-xs font-medium text-muted">
                Full name
              </label>
              <input
                id="new-staff-name"
                className="input-field"
                placeholder="Full name"
                name="new-staff-name"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                minLength={2}
                required
              />
            </div>

            <div>
              <label htmlFor="new-staff-email" className="mb-1.5 block text-xs font-medium text-muted">
                Email
              </label>
              <input
                id="new-staff-email"
                className="input-field"
                type="email"
                placeholder="Email"
                name="new-staff-email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label htmlFor="new-staff-password" className="mb-1.5 block text-xs font-medium text-muted">
                Password
              </label>
              <input
                id="new-staff-password"
                className="input-field"
                type="password"
                placeholder="Password (min 8 characters)"
                name="new-staff-password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                minLength={8}
                required
              />
            </div>

            {/* Branch — hidden for headquarters roles */}
            {selectedType.hq ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
                <Building2 size={16} className="mt-0.5 shrink-0 text-muted" />
                <div>
                  <p className="text-sm font-medium text-white">Headquarters — all branches</p>
                  <p className="text-xs text-muted">
                    Delivery admins are not linked to a branch and can filter across every branch.
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-full">
                <label className="mb-1.5 block text-xs font-medium text-muted">Assigned branch</label>
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
            )}

            {/* Default access preview */}
            <div className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
              <p className="mb-2 text-xs font-medium text-muted">
                Default access for {selectedType.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {defaultAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-md bg-brand/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand"
                  >
                    {area}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Fine-tune these afterwards from Manage → Access Permissions.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t border-navy-border bg-navy-light/20 px-6 pb-6 pt-4">
            <button
              type="button"
              onClick={close}
              disabled={createMutation.isPending}
              className="btn-outline px-5 py-2.5 text-sm"
            >
              Cancel
            </button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary px-6 py-2.5 text-sm">
              {createMutation.isPending ? 'Creating...' : 'Create Account'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */
export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });

  const { data, isLoading, isError } = useQuery<PaginatedResponse>({
    queryKey: ['admin-users', page, debouncedSearch],
    queryFn: () => adminFetch(`/admin/users?${queryParams.toString()}`),
    placeholderData: (prev) => prev,
  });

  const users = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: PAGE_SIZE, pages: 1 };
  const totalPages = Math.max(1, meta.pages);
  const totalItems = meta.total;
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalItems);
  const pageList = buildPageList(page, totalPages);

  // Clamp page if it goes out of range
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff Management</h1>
          <p className="text-muted text-sm">
            {totalItems > 0 ? `${totalItems.toLocaleString()} registered staff accounts` : 'Registered staff accounts'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Search */}
          <div className="input-icon-wrap w-full sm:w-80">
            <Search size={16} className="input-icon" aria-hidden />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field w-full py-2.5 text-sm"
              aria-label="Search staff by name or email"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary shrink-0 px-4 py-2.5 text-sm"
          >
            <Plus size={15} /> Add Staff
          </button>
        </div>
      </div>

      <CreateStaffDialog open={showCreate} onOpenChange={setShowCreate} />

      {/* Loading State */}
      {isLoading && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border">
                  {['User', 'Role', 'Branch', 'Status', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <UserTableSkeleton key={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="card p-8 text-center">
          <p className="text-red-400 text-sm">Failed to load staff. Please try again.</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && users.length === 0 && (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'rgba(48,126,242,0.12)' }}>
            <UserX size={28} className="text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Staff Found</h3>
          <p className="text-muted text-sm max-w-sm mx-auto">
            {debouncedSearch
              ? `No staff match "${debouncedSearch}". Try a different search term.`
              : 'No registered staff yet.'}
          </p>
        </div>
      )}

      {/* User Table */}
      {!isLoading && !isError && users.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-border">
                    {['User', 'Role', 'Branch', 'Status', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-navy-border hover:bg-navy-light/30 transition-colors">
                      {/* Avatar + Name + Email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={getStaffRoleAvatarUrl(user.role.name)}
                            alt={`${formatStaffRole(user.role.name)} avatar`}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-full shrink-0 object-cover ring-2 ring-white/10"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user.name}</p>
                            <p className="text-xs text-muted truncate">{user.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-brand/15 text-brand border border-brand/20">
                          {formatStaffRole(user.role.name)}
                        </span>
                      </td>
                      {/* Branch */}
                      <td className="px-4 py-3 text-muted text-xs">
                        {user.store ? user.store.name.replace('Bing Chun - ', '') : 'Headquarters'}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {user.isActive ? (
                          <span className="text-[11px] font-medium text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">Active</span>
                        ) : (
                          <span className="text-[11px] font-medium text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full">Inactive</span>
                        )}
                      </td>
                      {/* Action */}
                      <td className="px-4 py-3">
                        <Link 
                          href={`/admin/users/${user.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand hover:text-white bg-brand/10 hover:bg-brand rounded-lg transition-colors"
                        >
                          <Settings2 size={14} />
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="admin-table-pagination">
              <p className="admin-table-pagination__summary text-xs text-muted">
                Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
                <span className="text-fg font-semibold tabular-nums">{totalItems.toLocaleString()}</span> staff
              </p>
              <nav className="admin-table-pagination__nav" aria-label="Staff pagination">
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="admin-table-pagination__arrow"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="admin-table-pagination__pages">
                  {pageList.map((item, i) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${i}`} className="admin-table-pagination__ellipsis" aria-hidden>
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handlePageChange(item)}
                        aria-label={`Page ${item}`}
                        aria-current={item === page ? 'page' : undefined}
                        className={`admin-table-pagination__page${item === page ? ' admin-table-pagination__page--active' : ''}`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="admin-table-pagination__arrow"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </div>
  );
}
