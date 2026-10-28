'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Search, Store, X } from 'lucide-react';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import type { DeliveryWalletBranch } from '@/lib/deliveryPayoutTypes';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import { formatMoney } from '@/lib/receipt';

type Props = {
  branches: DeliveryWalletBranch[];
  grossDeliveryFee: number;
  platformFeePercent?: number;
  gatewayFeePercent?: number;
};

const PAGE_SIZE = ADMIN_TABLE_PAGE_SIZE;

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function DeliveryFeesByBranchBreakdown({
  branches,
  grossDeliveryFee,
  platformFeePercent,
  gatewayFeePercent,
}: Props) {
  const portalReady = useIsClient();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const filteredBranches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((row) => row.storeName.toLowerCase().includes(q));
  }, [branches, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedBranches = filteredBranches.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const rangeStart = filteredBranches.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filteredBranches.length);

  const branchCount = branches.length;
  const empty = branchCount === 0;

  const close = () => setOpen(false);
  const openBreakdown = () => {
    setSearchQuery('');
    setPage(1);
    setOpen(true);
  };

  return (
    <>
      {empty ? (
        <div className="mt-4 rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-4">
          <p className="text-sm font-semibold text-white">Delivery fees by branch (0)</p>
          <p className="mt-1 text-sm text-muted">No delivery fees in this period.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={openBreakdown}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-navy-border/80 bg-input-bg/25 px-4 py-3.5 text-left transition hover:border-brand/40 hover:bg-navy-light/30"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <Store size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">
              Delivery fees by branch ({branchCount})
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {branchCount} {branchCount === 1 ? 'branch' : 'branches'} included in this payout
              period. Total gross delivery fees: {formatMoney(grossDeliveryFee)}.
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </button>
      )}

      {portalReady &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="branch-fees-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[10020] bg-black/60"
                  onClick={close}
                  aria-hidden
                />
                <motion.div
                  key="branch-fees-panel"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="fixed left-1/2 top-1/2 z-[10021] flex max-h-[min(90vh,720px)] w-[min(1080px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
                  role="dialog"
                  aria-modal
                  aria-labelledby="delivery-fees-by-branch-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between border-b border-navy-border px-5 py-4 sm:px-6">
                    <div className="min-w-0 pr-3">
                      <h2
                        id="delivery-fees-by-branch-title"
                        className="text-lg font-bold text-white"
                      >
                        Delivery fees by branch
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        {branchCount} {branchCount === 1 ? 'branch' : 'branches'} included in this
                        payout period.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={close}
                      className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-white"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="shrink-0 px-5 pt-4 sm:px-6">
                    <div className="input-icon-wrap w-full">
                      <Search size={14} className="input-icon" aria-hidden />
                      <input
                        className="search-bar text-sm"
                        placeholder="Search branches..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setPage(1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        aria-label="Search branches"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    {filteredBranches.length === 0 ? (
                      <div className="px-1 py-16 text-center text-sm text-muted">
                        {searchQuery.trim()
                          ? `No branches match "${searchQuery}"`
                          : 'No delivery fees in this period.'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-navy-border">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-muted">
                              <th className="px-4 py-3 font-medium sm:px-5">Branch</th>
                              <th className="px-4 py-3 font-medium">Active orders</th>
                              <th className="px-4 py-3 font-medium">Late cancels</th>
                              <th className="px-4 py-3 font-medium">Gross</th>
                              <th className="px-4 py-3 font-medium whitespace-nowrap">
                                Platform fee
                                {platformFeePercent != null ? ` (${platformFeePercent}%)` : ''}
                              </th>
                              <th className="px-4 py-3 font-medium whitespace-nowrap">
                                Gateway fee
                                {gatewayFeePercent != null ? ` (${gatewayFeePercent}%)` : ''}
                              </th>
                              <th className="px-4 py-3 font-medium">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedBranches.map((row) => (
                              <tr
                                key={row.storeId}
                                className="border-b border-navy-border/60 last:border-0"
                              >
                                <td className="px-4 py-3 font-medium text-white sm:px-5">
                                  {row.storeName}
                                </td>
                                <td className="px-4 py-3 text-muted">
                                  {formatMoney(row.fromActiveOrders)}
                                  <span className="ml-1 text-xs">({row.orderCount})</span>
                                </td>
                                <td className="px-4 py-3 text-muted">
                                  {formatMoney(row.fromLateCancels)}
                                  <span className="ml-1 text-xs">({row.lateCancelCount})</span>
                                </td>
                                <td className="px-4 py-3 text-white">
                                  {formatMoney(row.grossDeliveryFee)}
                                </td>
                                <td className="px-4 py-3 text-muted">
                                  {formatMoney(row.platformFee)}
                                </td>
                                <td className="px-4 py-3 text-muted">
                                  {formatMoney(row.gatewayFee)}
                                </td>
                                <td className="px-4 py-3 font-medium text-white">
                                  {formatMoney(row.netForDelivery)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 border-t border-navy-border px-5 py-3 sm:px-6">
                    <AdminTablePagination
                      pageSize={PAGE_SIZE}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      totalItems={filteredBranches.length}
                      safePage={safePage}
                      totalPages={totalPages}
                      pageList={buildPageList(safePage, totalPages)}
                      onPageChange={setPage}
                      itemLabel="branches"
                      ariaLabel="Branch table pagination"
                      showPageSizeSelect={false}
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={close}
                        className="rounded-[var(--radius-btn)] border border-navy-border px-4 py-2.5 text-sm font-semibold text-muted hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
