'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Minus, Package, Plus, Power, X } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import { todayDateString } from '@/lib/datetime';
import { adminStockFetch, hasWeeklyTargetConfigured, type StockBatchRow, type StockItem } from '@/lib/stockApi';

interface ReactivateStockModalProps {
  item: StockItem;
  storeId: string;
  onClose: () => void;
  onSuccess: (newQty: number) => void;
}

export default function ReactivateStockModal({
  item,
  storeId,
  onClose,
  onSuccess,
}: ReactivateStockModalProps) {
  const [loading, setLoading] = useState(true);
  const [frozenQty, setFrozenQty] = useState(0);
  const [frozenBatchCount, setFrozenBatchCount] = useState(0);
  const [activeQty, setActiveQty] = useState(0);
  const [restoreQty, setRestoreQty] = useState('0');
  const [isZeroStockReactivation, setIsZeroStockReactivation] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setFrozenQty(0);
    setFrozenBatchCount(0);
    setActiveQty(0);
    setRestoreQty('0');
    setIsZeroStockReactivation(false);

    void (async () => {
      try {
        const data = await adminStockFetch<{ batches: StockBatchRow[] }>(
          `/admin/stock/${item.productId}/batches?storeId=${storeId}`,
        );
        if (cancelled) return;

        const frozenBatches = data.batches.filter((batch) => batch.status === 'FROZEN');
        const activeBatches = data.batches.filter(
          (batch) => batch.status === 'ACTIVE' && batch.remainingQty > 0,
        );
        const frozenTotalFromBatches = frozenBatches.reduce((sum, batch) => sum + batch.remainingQty, 0);
        const activeTotal = activeBatches.reduce((sum, batch) => sum + batch.remainingQty, 0);
        const frozenTotal = Math.max(frozenTotalFromBatches, item.frozenQty ?? 0);
        const batchCount = Math.max(frozenBatches.length, item.frozenBatchCount ?? 0);
        const zeroStock = frozenTotal === 0 && activeTotal === 0;
        const defaultQty = frozenTotal > 0 ? frozenTotal : activeTotal > 0 ? activeTotal : 0;

        setFrozenQty(frozenTotal);
        setFrozenBatchCount(batchCount);
        setActiveQty(activeTotal);
        setIsZeroStockReactivation(zeroStock);
        setRestoreQty(String(defaultQty));
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load frozen stock');
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item, storeId, onClose]);

  const maxQty: number | null = frozenQty > 0 ? frozenQty : activeQty > 0 ? activeQty : null;
  const qtyCap = maxQty ?? Infinity;
  const qty = restoreQty.trim() === '' ? 0 : Number(restoreQty);
  const effectiveQty = Number.isNaN(qty) ? 0 : qty;
  const qtyValid =
    maxQty === null ? effectiveQty >= 0 : effectiveQty >= 0 && effectiveQty <= maxQty;
  const inputEditable = maxQty === null || maxQty > 0;

  const stockSourceLabel = useMemo(() => {
    if (frozenQty > 0) {
      return `This product has ${frozenQty} units across ${frozenBatchCount} frozen batch${frozenBatchCount === 1 ? '' : 'es'}.`;
    }
    if (activeQty > 0) {
      return `This product currently has ${activeQty} units in active batches.`;
    }
    return 'No frozen stock was found. Enter how much stock to receive when reactivating, or set 0 to activate without stock.';
  }, [activeQty, frozenBatchCount, frozenQty]);

  const reactivate = useMutation({
    mutationFn: async () => {
      if (!qtyValid) {
        throw new Error(
          maxQty === null
            ? 'Enter a valid quantity (0 or more)'
            : `Enter a quantity between 0 and ${maxQty}`,
        );
      }

      if (isZeroStockReactivation && effectiveQty > 0) {
        if (!hasWeeklyTargetConfigured(item)) {
          throw new Error('Set a weekly target in Settings before receiving stock for this product.');
        }

        const receivedAt = new Date(todayDateString());
        receivedAt.setHours(12, 0, 0, 0);

        await adminStockFetch<{ onHand: number }>(`/admin/stock/${item.productId}/batches`, {
          method: 'POST',
          body: JSON.stringify({
            storeId,
            receivedQty: effectiveQty,
            receivedAt: receivedAt.toISOString(),
            batchType: 'RESET',
          }),
        });
      }

      return adminStockFetch<{
        restoredQty: number;
        stock: number;
        onHandQty: number;
      }>(`/admin/stock/${item.productId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isAvailable: true,
          storeId,
          ...(maxQty !== null ? { overrideQty: effectiveQty } : {}),
        }),
      });
    },
    onSuccess: (result) => {
      const restored = result.restoredQty ?? result.onHandQty ?? result.stock ?? effectiveQty;
      toast.success(`${item.name} activated with ${restored} units`);
      onSuccess(restored);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function adjustQty(delta: number) {
    const current = restoreQty.trim() === '' ? 0 : Number(restoreQty);
    const next = Math.max(0, Math.min(qtyCap, (Number.isNaN(current) ? 0 : current) + delta));
    setRestoreQty(String(next));
  }

  function handleRestoreQtyChange(value: string) {
    if (value.trim() === '') {
      setRestoreQty('');
      return;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    setRestoreQty(String(Math.max(0, Math.min(qtyCap, parsed))));
  }

  const submitLabel = reactivate.isPending
    ? 'Activating…'
    : isZeroStockReactivation
      ? effectiveQty === 0
        ? 'Activate with 0 stock'
        : `Receive & activate (${effectiveQty} units)`
      : effectiveQty === 0
        ? 'Activate with 0 stock'
        : 'Activate & Restore';

  const lowStockThreshold = item.lowStockThreshold ?? 25;
  const showLowStockHint =
    isZeroStockReactivation && effectiveQty > 0 && effectiveQty <= lowStockThreshold;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl font-sans">
        <div className="border-b border-gray-200 px-6 py-5 flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <Power size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Reactivate product</h3>
              <p className="text-sm text-gray-500 mt-1">
                Review frozen stock before making this product visible to customers again.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <ProductImage
              name={item.name}
              imageUrl={item.imageUrl}
              contain
              className="h-14 w-14 rounded-lg bg-white p-1"
            />
            <div>
              <p className="font-semibold text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">{item.category.name}</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              Loading frozen stock details…
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-sm text-gray-700">
                <div className="flex items-start gap-3">
                  <Package size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">{stockSourceLabel}</p>
                    {maxQty !== null && maxQty > 0 && (
                      <p className="mt-1 text-gray-600">
                        You can restore all {maxQty} units or edit the quantity before activating.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  {maxQty !== null && maxQty > 0 ? 'Stock to restore' : 'Stock on hand after activation'}
                </label>
                <div className="flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    className="px-3 text-gray-500 hover:bg-gray-50 border-r border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => adjustQty(-1)}
                    aria-label="Decrease quantity"
                    disabled={!inputEditable || effectiveQty <= 0}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={maxQty ?? undefined}
                    readOnly={!inputEditable}
                    className="flex-1 min-w-0 px-3 py-2.5 text-center text-lg font-bold tabular-nums text-gray-900 outline-none"
                    value={restoreQty}
                    onChange={(e) => handleRestoreQtyChange(e.target.value)}
                  />
                  <button
                    type="button"
                    className="px-3 text-emerald-600 hover:bg-emerald-50 border-l border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => adjustQty(1)}
                    aria-label="Increase quantity"
                    disabled={!inputEditable || (maxQty !== null && effectiveQty >= maxQty)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {maxQty !== null && maxQty > 0 && effectiveQty < maxQty && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Reducing below {maxQty} will permanently write off the difference.
                  </p>
                )}
                {showLowStockHint && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Stock at or below {lowStockThreshold} units may remain limited for online orders until
                    more is received.
                  </p>
                )}
                {!qtyValid && maxQty !== null && maxQty > 0 && (
                  <p className="mt-1.5 text-xs text-red-600">
                    Enter a quantity between 0 and {maxQty}.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button type="button" className="btn-secondary px-4 py-2" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2"
            disabled={loading || reactivate.isPending || !qtyValid}
            onClick={() => reactivate.mutate()}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
