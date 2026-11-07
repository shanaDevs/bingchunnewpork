'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  UserCheck,
  ShieldAlert,
  Calendar,
  Store,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowUpDown,
  ExternalLink,
  Users,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { adminAuthHeaders } from '@/lib/adminSession';
import { isSuperAdmin, getAdminSession } from '@/lib/adminAuth';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/receipt';
import { CustomerAccountStatusBadge } from '@/components/admin/CustomerAccountStatusBadge';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  isInvalidPhone: boolean;
  email: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'BANNED' | 'DELETED';
  bannedAt: string | null;
  bannedReason: string | null;
  lifetimeSpend: number;
  ordersCount: number;
  favouriteBranch: { name: string; city: string } | null;
  lastOrderAt: string | null;
}

interface CustomersResponse {
  data: CustomerSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/* ------------------------------------------------------------------ */
/*  API Client                                                         */
/* ------------------------------------------------------------------ */
function adminFetch(endpoint: string, options?: RequestInit): Promise<CustomersResponse> {
  return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: adminAuthHeaders({
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    }),
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    // Paginated admin APIs: { success, data: CustomerSummary[], meta }
    if (Array.isArray(d.data) && d.meta) {
      return { data: d.data, meta: d.meta } as CustomersResponse;
    }
    // Legacy nested shape: { success, data: { data, meta } }
    if (d.data && Array.isArray(d.data.data) && d.data.meta) {
      return d.data as CustomersResponse;
    }
    return d as CustomersResponse;
  });
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof getAdminSession> | null>(() =>
    typeof window !== 'undefined' ? getAdminSession() : null,
  );

  useEffect(() => {
    setSession(getAdminSession());
  }, []);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned' | 'deleted'>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error } = useQuery<CustomersResponse>({
    queryKey: ['admin-customers', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        status: statusFilter,
      });
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }
      const res = await adminFetch(`/admin/customers?${params.toString()}`);
      return res;
    },
    enabled: Boolean(session && isSuperAdmin(session)),
  });

  const isSuper = session ? isSuperAdmin(session) : false;
  const sessionReady = session !== null;
  const tableLoading = !sessionReady || (isSuper && isLoading);
  const showStatusColumn = statusFilter === 'all';
  const tableColSpan = showStatusColumn ? 8 : 7;

  if (session && !isSuper) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="inline-flex p-4 rounded-full bg-rose-500/10 text-rose-500 mb-4">
          <ShieldAlert size={48} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Access Restricted</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          The Customer 360 overview and HQ tools are exclusively available to Super Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Customers
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              HQ Tools
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Customer 360 profiles, order history, lifetime metrics, and fraud controls.
          </p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-sm backdrop-blur-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl overflow-x-auto">
          {(['all', 'active', 'banned', 'deleted'] as const).map((tab) => {
            const active = statusFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setStatusFilter(tab);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone (07...), email, order #..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
            <thead className="bg-zinc-50/80 dark:bg-zinc-800/40 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th scope="col" className="px-5 py-3.5">Customer</th>
                <th scope="col" className="px-5 py-3.5">Phone</th>
                <th scope="col" className="px-5 py-3.5">Signup Date</th>
                <th scope="col" className="px-5 py-3.5">Favourite Branch</th>
                <th scope="col" className="px-5 py-3.5">Lifetime Spend (LKR)</th>
                <th scope="col" className="px-5 py-3.5">Last Order</th>
                {showStatusColumn && <th scope="col" className="px-5 py-3.5">Status</th>}
                <th scope="col" className="px-5 py-3.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {tableLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={tableColSpan} className="px-5 py-4">
                      <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md w-full" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-5 py-12 text-center text-rose-500">
                    Failed to load customers: {(error as Error).message}
                  </td>
                </tr>
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-5 py-12 text-center text-zinc-500 dark:text-zinc-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users size={32} className="text-zinc-400" />
                      <p className="font-medium">No customers found</p>
                      <p className="text-xs text-zinc-400">
                        {statusFilter === 'all'
                          ? 'Try adjusting your search or status filter.'
                          : `No ${statusFilter} customers match your search.`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.data.map((c) => {
                  const isDeleted = c.status === 'DELETED';
                  const isBanned = c.status === 'BANNED';
                  const initials = c.name
                    ? c.name
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0]?.toUpperCase())
                        .join('')
                    : 'U';

                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/admin/customers/${c.id}`)}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                    >
                      {/* Name & Email */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/20">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                              {c.name}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">
                              {c.email || '—'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                          <span>{c.phone}</span>
                          {c.isInvalidPhone && (
                            <span
                              title="0700000000 or guest-style placeholder"
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            >
                              Guest
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Signup Date */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs">
                        {formatDate(c.createdAt)}
                      </td>

                      {/* Favourite Branch */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs">
                        {c.favouriteBranch ? (
                          <div className="flex items-center gap-1.5">
                            <Store size={14} className="text-zinc-400 shrink-0" />
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {c.favouriteBranch.name}
                            </span>
                            <span className="text-zinc-400">({c.favouriteBranch.city})</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>

                      {/* Lifetime Spend */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs">
                        <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {formatMoneyAmount(c.lifetimeSpend)}
                        </span>
                        <div className="text-[11px] text-zinc-400">
                          {c.ordersCount} {c.ordersCount === 1 ? 'order' : 'orders'}
                        </div>
                      </td>

                      {/* Last Order */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-zinc-500">
                        {c.lastOrderAt ? formatDate(c.lastOrderAt) : 'Never'}
                      </td>

                      {showStatusColumn && (
                        <td className="px-5 py-4 whitespace-nowrap">
                          <CustomerAccountStatusBadge isBanned={isBanned} isDeleted={isDeleted} />
                        </td>
                      )}

                      {/* Action */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/customers/${c.id}`);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-600 transition-colors"
                        >
                          <span>Profile</span>
                          <ExternalLink size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {Boolean(data?.meta && data.meta.pages > 1) && (
          <div className="px-5 py-3.5 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/20 text-xs">
            <p className="text-zinc-500">
              Showing <span className="font-semibold text-zinc-800 dark:text-zinc-200">{(page - 1) * limit + 1}</span> to{' '}
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {Math.min(page * limit, data!.meta.total)}
              </span>{' '}
              of <span className="font-semibold text-zinc-800 dark:text-zinc-200">{data!.meta.total}</span> customers
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                Page {page} of {data!.meta.pages}
              </span>
              <button
                type="button"
                disabled={page >= data!.meta.pages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
