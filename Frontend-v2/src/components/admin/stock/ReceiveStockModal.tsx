'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Calendar, Minus, Package, Plus, X } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import { formatDate, todayDateString } from '@/lib/datetime';
import {
  adminStockFetch,
  canActivateWithQty,
  isEmergencyRestock,
  maxResetReceiveQty,
  resolveReceiveBatchType,
  suggestedActivationQty,
  type StockItem,
} from '@/lib/stockApi';

interface ReceiveStockModalProps {
  item: StockItem;
  storeId: string;
  purpose?: 'default' | 'activate';
  onClose: () => void;
  onSuccess: (result: {
    weeklyRemainingQty: number;
    weeklyReceivedQty?: number;
    weeklyBaseQty?: number;
    batchNumber?: string;
  }) => void;
}

function batchStoreCode(batchNumber?: string): string | null {
  if (!batchNumber) return null;
  const parts = batchNumber.split('-');
  return parts.length >= 2 ? parts[1] : null;
}

export default function ReceiveStockModal({
  item,
  storeId,
  purpose = 'default',
  onClose,
  onSuccess,
}: ReceiveStockModalProps) {
  const isActivation = purpose === 'activate';
  const batchType = isActivation ? 'RESET' : resolveReceiveBatchType(item);
  const isEmergency = batchType === 'EMERGENCY';
  const [receivedQty, setReceivedQty] = useState(
    String(isActivation ? suggestedActivationQty(item) : ''),
  );
  const receivedDate = todayDateString();
  const [note, setNote] = useState('');

  const previewQuery = useQuery({
    queryKey: ['batch-preview', storeId, receivedDate, batchType],
    queryFn: () =>
      adminStockFetch<{ batchNumber: string }>(
        `/admin/stock/batch-preview?storeId=${storeId}&batchType=${batchType}&receivedAt=${encodeURIComponent(new Date(receivedDate).toISOString())}`,
      ),
    enabled: Boolean(storeId && receivedDate),
  });

  const qty = receivedQty.trim() === '' ? 0 : Number(receivedQty);
  const effectiveQty = Number.isNaN(qty) ? 0 : qty;
  const previewTotal = item.onHandQty + effectiveQty;
  const previewOnlineAvailable = Math.max(0, previewTotal - item.onlineOutOfStockThreshold);
  const resetReceiveCap = !isEmergency && !isActivation ? maxResetReceiveQty(item) : null;
  const resetQtyValid =
    resetReceiveCap == null || Number.isNaN(qty) || qty <= 0 || qty <= resetReceiveCap;
  const activationQtyValid = !isActivation || canActivateWithQty(previewTotal, item);
  const batchNumber = previewQuery.data?.batchNumber
    ? `${previewQuery.data.batchNumber} (provisional)`
    : 'Generating…';
  const skuLabel = useMemo(() => batchStoreCode(previewQuery.data?.batchNumber) ?? item.productId.slice(0, 6).toUpperCase(), [
    previewQuery.data?.batchNumber,
    item.productId,
  ]);

  const receive = useMutation({
    mutationFn: async () => {
      if (Number.isNaN(qty) || qty <= 0) {
        throw new Error('Enter a valid received quantity');
      }
      if (isActivation && !canActivateWithQty(previewTotal, item)) {
        throw new Error(
          `Stock must be above ${item.lowStockThreshold} to mark this product active`,
        );
      }
      if (resetReceiveCap != null && qty > resetReceiveCap) {
        throw new Error(
          resetReceiveCap > 0
            ? `Receive quantity cannot exceed the weekly target. Maximum: ${resetReceiveCap} units.`
            : 'On-hand quantity is already at the weekly target.',
        );
      }

      const receivedAt = new Date(receivedDate);
      receivedAt.setHours(12, 0, 0, 0);

      const result = await adminStockFetch<{
        batchNumber: string;
        onHand: number;
        weeklyBaseQty: number;
      }>(`/admin/stock/${item.productId}/batches`, {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          receivedQty: qty,
          receivedAt: receivedAt.toISOString(),
          note: note.trim() || undefined,
          batchType,
        }),
      });

      if (isActivation && canActivateWithQty(result.onHand, item)) {
        await adminStockFetch(`/admin/stock/${item.productId}`, {
          method: 'PATCH',
          body: JSON.stringify({ isAvailable: true, storeId }),
        });
      }

      return {
        weeklyRemainingQty: result.onHand,
        weeklyReceivedQty: result.weeklyBaseQty,
        weeklyBaseQty: result.weeklyBaseQty,
        batchNumber: result.batchNumber,
      };
    },
    onSuccess: (result) => {
      toast.success(
        isActivation
          ? `Batch ${result.batchNumber} received and product activated`
          : `Batch ${result.batchNumber} received`,
      );
      onSuccess(result);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function adjustQty(delta: number) {
    const current = receivedQty.trim() === '' ? 0 : Number(receivedQty);
    const next = Math.max(0, (Number.isNaN(current) ? 0 : current) + delta);
    setReceivedQty(next === 0 ? '' : String(next));
  }

  const submitLabel =
    isActivation && effectiveQty > 0
      ? `Receive & activate ${effectiveQty} units`
      : effectiveQty > 0
        ? `Receive ${effectiveQty} units`
        : isActivation
          ? 'Receive & activate'
          : 'Receive batch';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl font-sans">
        <div className="border-b border-gray-200 px-6 py-5 flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <Package size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {isActivation ? 'Receive stock to activate' : 'Receive Stock'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {isActivation
                  ? 'Receive a delivery batch and bring this product back online.'
                  : 'Record a new delivery batch and update available stock.'}
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
          {!isActivation && isEmergency && isEmergencyRestock(item) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {item.isOutOfStock
                ? `This product is out of stock online (available: ${item.onlineAvailableQty}).`
                : `This product is low stock online (available: ${item.onlineAvailableQty}).`}{' '}
              This restock will be recorded as an emergency batch.
            </div>
          )}
          {!isActivation && resetReceiveCap != null && resetReceiveCap > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Weekly target allows up to{' '}
              <span className="font-semibold tabular-nums text-gray-900">{resetReceiveCap}</span> more units
              in this receive.
            </div>
          )}
          {isActivation && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This product is out of stock online ({item.onHandQty} on hand). Receive stock above{' '}
              {item.lowStockThreshold} units before marking active.
            </div>
          )}

          <div className="flex items-center gap-3">
            <ProductImage
              name={item.name}
              imageUrl={item.imageUrl}
              contain
              className="h-14 w-14 rounded-xl border border-gray-200 bg-gray-50 p-1"
            />
            <div>
              <p className="font-semibold text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">SKU: {skuLabel}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
              {[
                { label: 'On hand', value: item.onHandQty },
                { label: 'Online available', value: item.onlineAvailableQty },
                { label: 'Weekly target', value: item.weeklyTargetQty },
                { label: 'Received this week', value: item.weeklyReceivedQty },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-3 text-center sm:text-left">
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900 mt-0.5">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 px-4 py-2.5 text-center text-sm text-gray-500">
              Catalog unit cost{' '}
              <span className="font-semibold text-gray-900">LKR {item.cost.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Batch number</label>
              <div className="relative">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50 font-mono outline-none pr-28"
                  readOnly
                  value={batchNumber}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500">
                  Auto-generated
                </span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Received date</label>
              <div className="relative">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50 outline-none pr-10"
                  readOnly
                  value={formatDate(`${receivedDate}T12:00:00`)}
                />
                <Calendar
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">Stock can only be received for today.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Received quantity</label>
              <div className="flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  className="px-3 text-gray-500 hover:bg-gray-50 border-r border-gray-300 transition-colors"
                  onClick={() => adjustQty(-1)}
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min={1}
                  className="flex-1 min-w-0 px-3 py-2.5 text-center text-lg font-bold tabular-nums text-gray-900 outline-none"
                  placeholder="0"
                  value={receivedQty}
                  onChange={(e) => setReceivedQty(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 text-teal-600 hover:bg-teal-50 border-l border-gray-300 transition-colors"
                  onClick={() => adjustQty(1)}
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Enter the quantity delivered in this batch.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Note (optional)</label>
              <textarea
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                placeholder="Delivery note, supplier, or reference"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div
            className={`rounded-xl border px-4 py-4 ${
              activationQtyValid
                ? 'border-teal-200 bg-teal-50/70'
                : 'border-amber-200 bg-amber-50/70'
            }`}
          >
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-600">
              <span>
                Current <strong className="tabular-nums text-gray-900">{item.onHandQty}</strong>
              </span>
              <span className="text-gray-400">+</span>
              <span>
                Receiving <strong className="tabular-nums text-gray-900">{effectiveQty}</strong>
              </span>
              <span className="text-gray-400">=</span>
              <span>
                New on-hand{' '}
                <strong
                  className={`text-2xl tabular-nums ${
                    activationQtyValid ? 'text-teal-600' : 'text-amber-600'
                  }`}
                >
                  {previewTotal}
                </strong>
              </span>
            </div>
            <p className="mt-2 text-center text-xs text-gray-500">
              Online available after receiving:{' '}
              <span className="font-semibold tabular-nums text-gray-700">{previewOnlineAvailable}</span>
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 bg-white rounded-b-2xl">
          <button
            type="button"
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            disabled={receive.isPending || (isActivation && !activationQtyValid) || !resetQtyValid}
            onClick={() => receive.mutate()}
          >
            <Package size={16} />
            {receive.isPending ? 'Receiving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
