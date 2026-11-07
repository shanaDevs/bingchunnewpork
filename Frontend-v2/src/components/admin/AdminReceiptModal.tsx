'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import OrderReceipt from '@/components/order/OrderReceipt';
import type { Order } from '@/types';

type Props = {
  orderKey: string | null;
  onClose: () => void;
};

async function fetchAdminOrder(orderKey: string): Promise<Order> {
  const res = await fetch(
    `${getApiBaseUrl()}/orders/${encodeURIComponent(orderKey)}`,
    { headers: adminAuthHeaders(), credentials: 'include' },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Order not found');
  return json.data as Order;
}

export default function AdminReceiptModal({ orderKey, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!orderKey) {
      setOrder(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAdminOrder(orderKey)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setOrder(null);
          setError(e instanceof Error ? e.message : 'Failed to load receipt');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderKey]);

  useEffect(() => {
    if (!orderKey) return;
    document.body.classList.add('admin-receipt-modal-open');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.classList.remove('admin-receipt-modal-open');
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [orderKey, onClose]);

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {orderKey && (
        <motion.div
          key="admin-receipt-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-receipt-modal-backdrop fixed inset-0 z-[1200] flex items-center justify-center p-4 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            key="admin-receipt-panel"
            role="dialog"
            aria-modal
            aria-label="Order receipt"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="admin-receipt-modal-panel card w-full max-w-md overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="no-print flex items-center justify-between gap-3 border-b border-navy-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg truncate">Receipt</p>
                <p className="text-xs text-muted truncate">#{orderKey}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                  aria-label="Close receipt"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="admin-receipt-modal__body max-h-[min(78vh,720px)] overflow-y-auto p-4">
              {loading && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
                  <Loader2 size={28} className="animate-spin text-brand" />
                  <p className="text-sm">Loading receipt…</p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {order && !loading && (
                <div className="admin-receipt-modal__receipt mx-auto max-w-[22rem]">
                  <OrderReceipt order={order} adminView />
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
