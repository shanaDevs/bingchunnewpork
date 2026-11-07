'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { formatMoneyAmount } from '@/lib/receipt';

export type TopCustomer = {
  rank: number;
  name: string;
  phone?: string;
  email?: string;
  orders: number;
  totalSpend: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  customers: TopCustomer[];
  periodLabel: string;
};

function Amount({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`font-bold tabular-nums ${className}`.trim()}>{children}</span>;
}

export default function TopCustomersModal({ open, onClose, customers, periodLabel }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Top customers"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="card flex max-h-[min(88vh,760px)] w-full max-w-4xl flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-fg">Top 20 Customers</h2>
                <p className="mt-0.5 text-xs text-muted">Ranked by total spend · {periodLabel}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {customers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No customer data in this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-border/70 text-xs uppercase tracking-wide text-muted">
                        <th className="pb-3 pr-3 font-semibold">#</th>
                        <th className="pb-3 pr-3 font-semibold">Customer</th>
                        <th className="pb-3 pr-3 font-semibold">Phone</th>
                        <th className="pb-3 pr-3 font-semibold">Email</th>
                        <th className="pb-3 pr-3 font-semibold text-right">Orders</th>
                        <th className="pb-3 pr-3 font-semibold text-right">Avg Order (LKR)</th>
                        <th className="pb-3 font-semibold text-right">Total Spent (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-border/50">
                      {customers.map((customer) => (
                        <tr key={`${customer.rank}-${customer.phone ?? customer.name}`}>
                          <td className="py-3 pr-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                              {customer.rank}
                            </span>
                          </td>
                          <td className="py-3 pr-3 font-medium text-fg">{customer.name}</td>
                          <td className="py-3 pr-3 text-muted">{customer.phone ?? '—'}</td>
                          <td className="max-w-[180px] truncate py-3 pr-3 text-muted" title={customer.email}>
                            {customer.email ?? '—'}
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <Amount>{customer.orders}</Amount>
                          </td>
                          <td className="py-3 pr-3 text-right text-muted">
                            <Amount>
                              {formatMoneyAmount(
                                Math.round(customer.totalSpend / Math.max(customer.orders, 1)),
                              )}
                            </Amount>
                          </td>
                          <td className="py-3 text-right font-semibold text-fg">
                            <Amount>{formatMoneyAmount(customer.totalSpend)}</Amount>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
