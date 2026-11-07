'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import ProductImage from '@/components/ui/ProductImage';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';

export type TopSellingProduct = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  quantity: number;
  revenue: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  products: TopSellingProduct[];
  periodLabel: string;
  variant?: 'top' | 'least';
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

export default function TopSellingProductsModal({
  open,
  onClose,
  products,
  periodLabel,
  variant = 'top',
}: Props) {
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

  const isLeast = variant === 'least';
  const title = isLeast ? 'Least 20 Selling Products' : 'Top 20 Selling Products';
  const subtitle = isLeast
    ? 'Lowest quantity sold across all branches'
    : 'Ranked by quantity sold across all branches';

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
            aria-label={title}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="card flex max-h-[min(88vh,760px)] w-full max-w-4xl flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-fg">{title}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {subtitle} · {periodLabel}
                </p>
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
              {products.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No product sales in this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-border/70 text-xs uppercase tracking-wide text-muted">
                        <th className="pb-3 pr-3 font-semibold">#</th>
                        <th className="pb-3 pr-3 font-semibold">Product</th>
                        <th className="pb-3 pr-3 font-semibold text-right">Unit Price</th>
                        <th className="pb-3 pr-3 font-semibold text-right">Qty Sold</th>
                        <th className="pb-3 font-semibold text-right">Revenue (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-border/50">
                      {products.slice(0, 20).map((product, index) => (
                        <tr key={product.productId}>
                          <td className="py-3 pr-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-navy-border/70 bg-navy-light/30">
                                <ProductImage
                                  name={product.productName}
                                  imageUrl={product.imageUrl}
                                  className="h-full w-full"
                                  contain
                                />
                              </div>
                              <span className="font-medium text-fg">{product.productName}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right text-muted">
                            <Amount>
                              {formatMoneyAmount(
                                product.basePrice ||
                                  product.revenue / Math.max(product.quantity, 1),
                              )}
                            </Amount>
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <Amount>{product.quantity}</Amount>
                          </td>
                          <td className="py-3 text-right font-semibold text-fg">
                            <Amount>{formatMoneyAmount(product.revenue)}</Amount>
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
