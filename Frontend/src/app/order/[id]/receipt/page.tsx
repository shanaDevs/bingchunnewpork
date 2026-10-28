'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Order } from '@/types';
import OrderReceipt from '@/components/order/OrderReceipt';
import { receiptWasOpenedFromApp } from '@/lib/orderLinks';

const RECEIPT_BACK_FALLBACK = '/account/orders';

export default function OrderReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ['order', id, 'receipt'],
    queryFn: () => api.get<Order>(`/orders/${id}`, true),
  });

  function handleBack() {
    if (receiptWasOpenedFromApp()) {
      router.back();
      return;
    }
    router.push(RECEIPT_BACK_FALLBACK);
  }

  function handlePrint() {
    window.print();
  }

  async function handleShare() {
    if (!order) return;
    const url = window.location.href;
    const text = `Bing Chun receipt — Order #${order.orderNumber} — ${order.total.toLocaleString()} LKR`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bing Chun Receipt', text, url });
        return;
      } catch {
        /* user cancelled */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success('Receipt link copied!');
    } catch {
      toast.error('Could not copy link');
    }
  }

  return (
    <div className="receipt-page">
      <div className="receipt-toolbar no-print">
        <button
          type="button"
          onClick={handleBack}
          className="btn-outline p-2.5 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-fg truncate">Receipt</h1>
          <p className="text-muted text-xs truncate">
            {order ? `#${order.orderNumber}` : isLoading ? 'Loading…' : ''}
          </p>
        </div>
        {order && (
          <>
            <button type="button" onClick={handleShare} className="btn-outline p-2.5 shrink-0" aria-label="Share receipt">
              <Share2 size={18} />
            </button>
            <button type="button" onClick={handlePrint} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2 shrink-0">
              <Printer size={16} /> Print
            </button>
          </>
        )}
      </div>

      {isLoading && (
        <div className="receipt-page__loading">
          <div className="text-4xl mb-3 animate-bounce">🧾</div>
          <p className="text-muted text-sm">Loading receipt…</p>
        </div>
      )}

      {(isError || (!isLoading && !order)) && (
        <div className="receipt-page__loading text-center">
          <p className="text-fg font-semibold mb-2">Receipt not found</p>
          <button
            type="button"
            onClick={() => router.push(RECEIPT_BACK_FALLBACK)}
            className="btn-primary px-5 py-2.5 text-sm inline-flex"
          >
            My Orders
          </button>
        </div>
      )}

      {order && (
        <div className="receipt-page__canvas">
          <OrderReceipt order={order} />
        </div>
      )}
    </div>
  );
}
