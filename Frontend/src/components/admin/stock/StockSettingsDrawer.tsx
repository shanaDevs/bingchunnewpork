'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  Info,
  ShoppingCart,
  SlidersHorizontal,
  Target,
  X,
} from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import {
  adminStockFetch,
  DEFAULT_WEEKLY_TARGET_QTY,
  type StockItem,
  type StockSettingsResult,
} from '@/lib/stockApi';

interface StockSettingsDrawerProps {
  item: StockItem;
  storeId: string;
  setupBeforeReceive?: boolean;
  onClose: () => void;
  onSuccess: (saved: StockSettingsResult) => void;
}

function ThresholdInput({
  icon: Icon,
  iconClassName,
  label,
  value,
  onChange,
  helperText,
  min = 0,
  required = false,
}: {
  icon: typeof Target;
  iconClassName: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText: string;
  min?: number;
  required?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <label className="mb-1.5 block text-sm font-medium text-gray-900">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={min}
            required={required}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="shrink-0 text-sm text-gray-500">units</span>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">{helperText}</p>
      </div>
    </div>
  );
}

export default function StockSettingsDrawer({
  item,
  storeId,
  setupBeforeReceive = false,
  onClose,
  onSuccess,
}: StockSettingsDrawerProps) {
  const [weeklyTargetQty, setWeeklyTargetQty] = useState(
    item.weeklyTargetQty > 0 ? String(item.weeklyTargetQty) : String(DEFAULT_WEEKLY_TARGET_QTY),
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(String(item.lowStockThreshold));
  const [onlineOutOfStockThreshold, setOnlineOutOfStockThreshold] = useState(
    String(item.onlineOutOfStockThreshold),
  );

  const requiresPositiveTarget = setupBeforeReceive || item.weeklyTargetQty <= 0;
  const lowStockDisplay = lowStockThreshold.trim() === '' ? '—' : lowStockThreshold;
  const onlineBufferDisplay =
    onlineOutOfStockThreshold.trim() === '' ? '—' : onlineOutOfStockThreshold;

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const parsedWeeklyTarget = Number(weeklyTargetQty);
  const weeklyTargetValid = requiresPositiveTarget
    ? weeklyTargetQty.trim() !== '' && Number.isFinite(parsedWeeklyTarget) && parsedWeeklyTarget > 0
    : weeklyTargetQty.trim() !== '' && Number.isFinite(parsedWeeklyTarget) && parsedWeeklyTarget >= 0;

  const save = useMutation({
    mutationFn: () =>
      adminStockFetch<StockSettingsResult>(`/admin/stock/${item.productId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          storeId,
          weeklyTargetQty: Number(weeklyTargetQty),
          lowStockThreshold: lowStockThreshold.trim() === '' ? null : Number(lowStockThreshold),
          onlineOutOfStockThreshold:
            onlineOutOfStockThreshold.trim() === '' ? null : Number(onlineOutOfStockThreshold),
        }),
      }),
    onSuccess: (saved) => {
      toast.success('Stock settings saved');
      onSuccess(saved);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white font-sans shadow-2xl">
        <div className="shrink-0 flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <SlidersHorizontal size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Stock settings</h3>
              <p className="mt-1 text-sm text-gray-500">
                Configure stock alerts and online availability
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1 text-gray-400 hover:text-gray-600"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {requiresPositiveTarget && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Set a weekly target before receiving stock for this product.
            </div>
          )}

          <div className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <ProductImage
              name={item.name}
              imageUrl={item.imageUrl}
              contain
              className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 bg-white"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{item.name}</p>
              <p className="text-xs text-gray-500">Branch-specific settings</p>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="mb-4 text-sm font-semibold text-gray-900">Planning &amp; alerts</h4>
            <div className="space-y-5">
              <ThresholdInput
                icon={Target}
                iconClassName="bg-blue-50 text-blue-600"
                label="Weekly target"
                value={weeklyTargetQty}
                onChange={setWeeklyTargetQty}
                helperText="Expected quantity needed for one week."
                min={requiresPositiveTarget ? 1 : 0}
                required
              />
              <ThresholdInput
                icon={AlertTriangle}
                iconClassName="bg-amber-50 text-amber-600"
                label="Low-stock threshold"
                value={lowStockThreshold}
                onChange={setLowStockThreshold}
                helperText="Show a low-stock alert when on-hand stock reaches this quantity."
                min={1}
              />
              <ThresholdInput
                icon={ShoppingCart}
                iconClassName="bg-red-50 text-red-500"
                label="Online out-of-stock buffer"
                value={onlineOutOfStockThreshold}
                onChange={setOnlineOutOfStockThreshold}
                helperText="Reserve these units for counter sales and stop online ordering early."
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">How this works</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <span>On hand</span>
                <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-medium tabular-nums">
                  {lowStockDisplay}
                </span>
                <span className="text-gray-400">→</span>
                <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Low-stock alert
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>On hand</span>
                <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-medium tabular-nums">
                  {onlineBufferDisplay}
                </span>
                <span className="text-gray-400">→</span>
                <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  Online unavailable
                </span>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500">
              <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
              Counter sales can continue until physical stock reaches 0.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium !text-white hover:bg-blue-700 disabled:opacity-60 [&_svg]:!text-white"
            disabled={save.isPending || !weeklyTargetValid}
            onClick={() => {
              if (!weeklyTargetValid) {
                toast.error(
                  requiresPositiveTarget
                    ? 'Enter a weekly target greater than 0'
                    : 'Weekly target is required',
                );
                return;
              }
              save.mutate();
            }}
          >
            <Check size={16} />
            {save.isPending
              ? 'Saving…'
              : setupBeforeReceive
                ? 'Save & continue'
                : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
