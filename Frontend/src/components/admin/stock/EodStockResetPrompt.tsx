'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, RefreshCw, X } from 'lucide-react';
import ResetStockModal from '@/components/admin/stock/ResetStockModal';
import { adminStockFetch, type StockResponse } from '@/lib/stockApi';

export type EodPromptVariant = 'reminder' | 'due';

interface EodStockResetPromptProps {
  variant: EodPromptVariant;
  storeId: string;
  onDismiss: () => void;
}

export default function EodStockResetPrompt({
  variant,
  storeId,
  onDismiss,
}: EodStockResetPromptProps) {
  const [showResetModal, setShowResetModal] = useState(false);
  const isDue = variant === 'due';

  const { data: stockData, isLoading, error } = useQuery({
    queryKey: ['admin-stock-eod-reset', storeId],
    queryFn: () =>
      adminStockFetch<StockResponse>(`/admin/stock?${new URLSearchParams({ storeId }).toString()}`),
    enabled: showResetModal && Boolean(storeId),
  });

  if (showResetModal) {
    if (isLoading) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-white px-8 py-10 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-gray-600">Loading stock data…</p>
          </div>
        </div>
      );
    }

    if (error || !stockData) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-sm text-red-600">
              {error instanceof Error ? error.message : 'Failed to load stock data'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setShowResetModal(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
                onClick={onDismiss}
              >
                Close branch anyway
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <ResetStockModal
        storeId={storeId}
        products={stockData.items}
        onClose={() => setShowResetModal(false)}
        onSuccess={onDismiss}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div className="flex gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${
                isDue ? 'bg-amber-500' : 'bg-blue-600'
              }`}
            >
              {isDue ? <AlertTriangle size={24} /> : <CalendarClock size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {isDue ? 'Weekly stock reset due today' : 'Stock reset is tomorrow'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {isDue
                  ? 'Complete your weekly stock reset before closing the branch.'
                  : 'Remember to do your weekly stock reset when you close tomorrow.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end">
          {isDue ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={onDismiss}
              >
                Skip and close
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                onClick={() => setShowResetModal(true)}
              >
                <RefreshCw size={16} />
                Reset stock now
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                onClick={() => setShowResetModal(true)}
              >
                Reset now anyway
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                onClick={onDismiss}
              >
                Got it
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
