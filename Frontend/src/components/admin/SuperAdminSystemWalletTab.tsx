'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Search, Wallet } from 'lucide-react';
import SuperAdminWalletSummaryCards from '@/components/admin/SuperAdminWalletSummaryCards';
import type { BranchWalletDashboard } from '@/components/admin/BranchWalletSummaryCards';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import WalletAnalysisSection from '@/components/admin/wallet-analysis/WalletAnalysisSection';
import { BranchWalletCardSkeleton } from '@/components/admin/wallet-analysis/WalletOverviewSkeletons';
import { buildPageList } from '@/lib/pagination';
import { cn } from '@/lib/utils';

export interface StoreWallet {
  id: string;
  storeId: string;
  balance: number;
  totalEarnings?: number;
  netTransferableEarnings?: number;
  totalWithdrawn?: number;
  currentBalance?: number;
  availableBalance?: number;
  updatedAt: string;
  store: { id: string; name: string; city: string; isActive: boolean };
  _count: { transactions: number };
}

const BRANCH_WALLETS_PAGE_SIZE = 16;

type StatusFilter = 'all' | 'active' | 'inactive';

function fmt(cents: number) {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function payableBalanceClass(balance: number) {
  if (balance < 0) return 'text-red-500';
  if (balance > 0) return 'text-[#307ef2]';
  return 'text-muted';
}

export type SuperAdminSystemWalletTabProps = {
  dashboard: BranchWalletDashboard | null;
  loading: boolean;
  walletListReady?: boolean;
  wallets: StoreWallet[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onBranchClick: (wallet: StoreWallet) => void;
  periodLabel?: string | null;
};

export default function SuperAdminSystemWalletTab({
  dashboard,
  loading,
  walletListReady = true,
  wallets,
  searchQuery,
  onSearchQueryChange,
  onBranchClick,
  periodLabel = null,
}: SuperAdminSystemWalletTabProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredWallets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return wallets.filter((w) => {
      if (statusFilter === 'active' && !w.store.isActive) return false;
      if (statusFilter === 'inactive' && w.store.isActive) return false;
      if (!q) return true;
      const name = w.store.name.toLowerCase();
      const city = w.store.city.toLowerCase();
      return name.includes(q) || city.includes(q);
    });
  }, [wallets, searchQuery, statusFilter]);

  const totalItems = filteredWallets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / BRANCH_WALLETS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = totalItems === 0 ? 0 : (safePage - 1) * BRANCH_WALLETS_PAGE_SIZE;
  const rangeStart = totalItems === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(safePage * BRANCH_WALLETS_PAGE_SIZE, totalItems);
  const pageWallets = useMemo(
    () => filteredWallets.slice(pageStart, pageStart + BRANCH_WALLETS_PAGE_SIZE),
    [filteredWallets, pageStart],
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <SuperAdminWalletSummaryCards
        dashboard={dashboard}
        loading={loading}
        periodLabel={periodLabel}
      />

      <WalletAnalysisSection
        branches={wallets.map((w) => ({ storeId: w.storeId, name: w.store.name }))}
        walletListReady={walletListReady}
      />

      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-[13px] font-semibold text-fg">Branch Wallets</h2>
            <p className="mt-0.5 mb-0 text-[11px] text-muted">
              Total earnings and transaction count per branch
            </p>
          </div>
          {loading ? (
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-visible" aria-hidden>
              <DashSkel className="h-8 w-[220px] shrink-0 rounded-[12px]" />
              <DashSkel className="h-8 w-[9.5rem] shrink-0 rounded-[12px]" />
            </div>
          ) : wallets.length > 0 ? (
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-visible">
              <div className="relative w-[220px] shrink-0">
                <Search
                  size={13}
                  className="pointer-events-none absolute top-1/2 left-2.5 z-[2] -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <input
                  type="text"
                  placeholder="Search branches..."
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  className="input-field h-8 w-full rounded-[12px] py-0 pr-3 pl-9 text-xs"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter by status"
                className="filter-select h-8 !w-[9.5rem] min-w-[9.5rem] shrink-0 rounded-[12px] text-xs"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          ) : null}
        </div>

        {loading && wallets.length === 0 ? (
          <div
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
            aria-busy
            aria-label="Loading branch wallets"
          >
            {Array.from({ length: 8 }, (_, index) => (
              <BranchWalletCardSkeleton key={index} />
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="py-10 text-center text-muted">
            <Wallet size={32} className="mx-auto mb-2 opacity-30" />
            <p>No wallets found</p>
          </div>
        ) : filteredWallets.length === 0 ? (
          <div className="py-10 text-center text-muted">
            <Wallet size={32} className="mx-auto mb-2 opacity-30" />
            <p>
              {searchQuery
                ? `No branches match “${searchQuery}”`
                : 'No branches match this status'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {pageWallets.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => onBranchClick(wallet)}
                  className="super-admin-overview-card card group flex h-[118px] w-full flex-col gap-1.5 rounded-[12px] p-3 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(48,126,242,0.12)] text-[#307ef2]">
                        <Building2 size={13} strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[13px] font-semibold leading-tight text-fg">
                          {wallet.store.name.replace('Bing Chun - ', '')}
                        </p>
                        <p className="mt-0.5 mb-0 text-[11px] text-muted">
                          {wallet._count.transactions} transaction
                          {wallet._count.transactions !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'admin-status-badge admin-status-badge--md shrink-0',
                        wallet.store.isActive
                          ? 'admin-status-badge--green'
                          : 'admin-status-badge--neutral',
                      )}
                    >
                      {wallet.store.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <p
                    className={cn(
                      'm-0 mt-auto text-[15px] font-bold tabular-nums tracking-tight',
                      payableBalanceClass(wallet.balance),
                    )}
                  >
                    {fmt(wallet.balance)}
                  </p>

                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#307ef2]">
                    View details
                    <ChevronRight
                      size={12}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </button>
              ))}
            </div>
            <AdminTablePagination
              pageSize={BRANCH_WALLETS_PAGE_SIZE}
              showPageSizeSelect={false}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              safePage={safePage}
              totalPages={totalPages}
              pageList={buildPageList(safePage, totalPages)}
              onPageChange={setPage}
              itemLabel="branches"
              ariaLabel="Branch wallets pagination"
              className="mt-3"
            />
          </>
        )}
      </div>
    </div>
  );
}
