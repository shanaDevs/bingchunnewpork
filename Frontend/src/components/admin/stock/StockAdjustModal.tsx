'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  adminStockFetch,
  canActivateWithQty,
  LOW_STOCK_THRESHOLD,
  suggestedActivationQty,
  type StockItem,
} from '@/lib/stockApi';

interface StockAdjustModalProps {
  item: StockItem;
  storeId: string;
  purpose?: 'default' | 'activate';
  onClose: () => void;
  onSuccess: (result: { weeklyRemainingQty: number; weeklyBaseQty?: number }) => void;
}

export default function StockAdjustModal({
  item,
  storeId,
  purpose = 'default',
  onClose,
  onSuccess,
}: StockAdjustModalProps) {
  const isActivation = purpose === 'activate';
  type AdjustMode = 'add' | 'set';
  const [mode, setMode] = useState<AdjustMode>(isActivation ? 'set' : 'add');
  const [addQty, setAddQty] = useState('');
  const [setQty, setSetQty] = useState(
    String(isActivation ? suggestedActivationQty(item) : item.weeklyRemainingQty),
  );
  const [note, setNote] = useState('');

  const addAmount = addQty.trim() === '' ? 0 : Number(addQty);
  const setAmount = setQty.trim() === '' ? item.weeklyRemainingQty : Number(setQty);
  const delta = mode === 'add' ? addAmount : setAmount - item.weeklyRemainingQty;
  const previewTotal = Math.max(0, item.weeklyRemainingQty + delta);
  const activationQtyValid = !isActivation || canActivateWithQty(previewTotal);

  const topUp = useMutation({
    mutationFn: async () => {
      if (Number.isNaN(addAmount) || Number.isNaN(setAmount)) {
        throw new Error('Enter a valid quantity');
      }
      if (delta === 0) {
        throw new Error(mode === 'add' ? 'Enter an amount to add or remove' : 'New total matches current stock');
      }
      if (previewTotal < 0) {
        throw new Error('Stock cannot go below zero');
      }
      if (isActivation && !canActivateWithQty(previewTotal)) {
        throw new Error(`Stock must be above ${LOW_STOCK_THRESHOLD} to mark this product active`);
      }

      const result = await adminStockFetch<{ weeklyRemainingQty: number; weeklyBaseQty?: number }>(
        `/admin/stock/${item.productId}/topup`,
        {
          method: 'POST',
          body: JSON.stringify({
            storeId,
            delta,
            note: note.trim() || undefined,
          }),
        },
      );

      if (isActivation && canActivateWithQty(result.weeklyRemainingQty)) {
        await adminStockFetch(`/admin/stock/${item.productId}`, {
          method: 'PATCH',
          body: JSON.stringify({ isAvailable: true, storeId }),
        });
      }

      return result;
    },
    onSuccess: (result) => {
      toast.success(isActivation ? 'Stock updated and product activated' : 'Stock updated');
      onSuccess(result);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-fg mb-1">
          {isActivation ? 'Restock to activate' : 'Adjust Stock'}
        </h3>
        <p className="text-sm text-muted mb-4">{item.name}</p>
        <div className="space-y-4">
          {isActivation && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              This product is out of stock ({item.weeklyRemainingQty} remaining). Update stock to more than{' '}
              {LOW_STOCK_THRESHOLD} units before it can be marked active.
            </div>
          )}

          <div className="rounded-lg border border-navy-border bg-navy-light/40 px-3 py-2 text-sm">
            <span className="text-muted">Current remaining: </span>
            <span className="font-semibold tabular-nums text-fg">{item.weeklyRemainingQty}</span>
            <span className="text-muted"> · Base allocation: {item.weeklyBaseQty}</span>
          </div>

          {!isActivation && (
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'add'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-navy-border text-muted hover:text-fg'
                }`}
                onClick={() => setMode('add')}
              >
                Add to stock
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'set'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-navy-border text-muted hover:text-fg'
                }`}
                onClick={() => setMode('set')}
              >
                Set total
              </button>
            </div>
          )}

          {mode === 'add' && !isActivation ? (
            <div>
              <label className="text-xs text-muted uppercase tracking-wide">Add quantity</label>
              <input
                type="number"
                className="input-field mt-1"
                placeholder="e.g. 50 to restock, -5 to reduce"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">Adds to the current count. Use a negative number to reduce stock.</p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted uppercase tracking-wide">Set remaining qty</label>
              <input
                type="number"
                min={0}
                className="input-field mt-1"
                value={setQty}
                onChange={(e) => setSetQty(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">
                {isActivation
                  ? `Enter a quantity above ${LOW_STOCK_THRESHOLD} to activate this product.`
                  : 'Sets the exact remaining quantity for this branch.'}
              </p>
            </div>
          )}

          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              activationQtyValid
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : 'border-amber-500/20 bg-amber-500/5'
            }`}
          >
            <span className="text-muted">New total: </span>
            <span
              className={`font-semibold tabular-nums ${activationQtyValid ? 'text-emerald-500' : 'text-amber-500'}`}
            >
              {previewTotal}
            </span>
            {isActivation && !activationQtyValid && (
              <p className="text-xs text-amber-400 mt-1">
                Must be above {LOW_STOCK_THRESHOLD} to activate.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-muted uppercase tracking-wide">Note (optional)</label>
            <input
              className="input-field mt-1"
              placeholder="Emergency restock, spoilage, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" className="px-4 py-2 text-sm text-muted hover:text-fg" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary py-2 px-5"
            disabled={topUp.isPending || (isActivation && !activationQtyValid)}
            onClick={() => topUp.mutate()}
          >
            {isActivation ? 'Update stock & activate' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
