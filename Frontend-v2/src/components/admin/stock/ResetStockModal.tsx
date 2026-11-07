'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RefreshCw, X, Lock, CheckCircle2, Wand2, Minus, Plus, CircleDot, Calendar } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  formatDateWithWeekday,
  getColomboDayOfWeek,
  getNextScheduledResetDate,
  getWeeklyResetDayLabel,
  todayDateString,
  WEEKLY_RESET_DAY_LABELS,
} from '@/lib/datetime';
import {
  previewResetBatchNumber,
  submitStockReset,
  type StockItem,
} from '@/lib/stockApi';

interface ResetStockModalProps {
  storeId: string;
  products: StockItem[];
  onClose: () => void;
  onSuccess: () => void;
}

type AppSettings = {
  weeklyResetDay?: number | null;
};

function fetchAppSettings(): Promise<AppSettings> {
    return fetch(`${getApiBaseUrl()}/settings/app`, {
    headers: {
      'Content-Type': 'application/json',
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return (data.data ?? data) as AppSettings;
  });
}

async function saveWeeklyResetDay(day: number): Promise<void> {
    const res = await fetch(`${getApiBaseUrl()}/settings/app`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ weeklyResetDay: day }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to save reset day');
}

type ResetRow = {
  productId: string;
  name: string;
  imageUrl?: string | null;
  remainingQty: number;
  weeklyTargetQty: number;
  qty: string;
};

function canAddResetQty(remainingQty: number, weeklyTargetQty: number): boolean {
  return weeklyTargetQty > 0 && remainingQty < weeklyTargetQty;
}

function defaultResetQty(remainingQty: number, weeklyTargetQty: number): number {
  if (!canAddResetQty(remainingQty, weeklyTargetQty)) return 0;
  return weeklyTargetQty - remainingQty;
}

function buildResetRows(products: StockItem[]): ResetRow[] {
  return products.map((product) => {
    const remainingQty = product.onHandQty;
    const weeklyTargetQty = product.weeklyTargetQty;
    const qty = defaultResetQty(remainingQty, weeklyTargetQty);
    return {
      productId: product.productId,
      name: product.name,
      imageUrl: product.imageUrl,
      remainingQty,
      weeklyTargetQty,
      qty: String(qty),
    };
  });
}

export default function ResetStockModal({
  storeId,
  products,
  onClose,
  onSuccess,
}: ResetStockModalProps) {
  const qc = useQueryClient();
  const [pickDayMode, setPickDayMode] = useState(false);
  const [lockedResetDate, setLockedResetDate] = useState<string | null>(null);
  const [nextResetDay, setNextResetDay] = useState(() => getColomboDayOfWeek());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<ResetRow[]>(() => buildResetRows(products));

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-reset-modal'],
    queryFn: fetchAppSettings,
  });

  const weeklyResetDay =
    typeof appSettings?.weeklyResetDay === 'number' ? appSettings.weeklyResetDay : null;

  const resetDate = lockedResetDate ?? todayDateString();

  useEffect(() => {
    if (lockedResetDate == null && appSettings !== undefined) {
      setLockedResetDate(getNextScheduledResetDate(weeklyResetDay));
      setNextResetDay(weeklyResetDay ?? getColomboDayOfWeek());
    }
  }, [appSettings, weeklyResetDay, lockedResetDate]);

  useEffect(() => {
    setRows(buildResetRows(products));
  }, [products]);

  const previewQuery = useQuery({
    queryKey: ['reset-batch-preview', storeId, resetDate],
    queryFn: () => previewResetBatchNumber(storeId, resetDate),
    enabled: Boolean(storeId && resetDate),
  });

  const parsedRows = useMemo(
    () =>
      rows.map((row) => {
        const eligible = canAddResetQty(row.remainingQty, row.weeklyTargetQty);
        const parsedQty = row.qty.trim() === '' ? 0 : Number(row.qty);
        return {
          ...row,
          eligible,
          parsedQty: eligible ? parsedQty : 0,
        };
      }),
    [rows],
  );

  const totalQty = parsedRows.reduce(
    (sum, row) => sum + (Number.isNaN(row.parsedQty) ? 0 : row.parsedQty),
    0,
  );
  const activeCount = parsedRows.filter(
    (row) => row.eligible && !Number.isNaN(row.parsedQty) && row.parsedQty > 0,
  ).length;
  const eligibleCount = parsedRows.filter((row) => row.eligible).length;

  const resetMutation = useMutation({
    mutationFn: async () => {
      const items = parsedRows
        .filter((row) => row.eligible && !Number.isNaN(row.parsedQty) && row.parsedQty > 0)
        .map((row) => ({ productId: row.productId, qty: row.parsedQty }));

      if (items.length === 0) {
        throw new Error('No products need a reset. Add qty only when remaining stock is below the weekly reset amount.');
      }

      if (parsedRows.some((row) => row.eligible && (Number.isNaN(row.parsedQty) || row.parsedQty < 0))) {
        throw new Error('All quantities must be valid non-negative numbers');
      }

      const result = await submitStockReset({
        storeId,
        resetDate,
        note: note.trim() || undefined,
        items,
      });

      if (nextResetDay !== weeklyResetDay) {
        await saveWeeklyResetDay(nextResetDay);
      }

      return result;
    },
    onSuccess: (result) => {
      toast.success(`Reset batch ${result.batchNumber} created for ${result.results.length} product(s)`);
      void qc.invalidateQueries({ queryKey: ['app-settings-reset-modal'] });
      void qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      onSuccess();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateQty(productId: string, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.productId !== productId) return row;
        if (!canAddResetQty(row.remainingQty, row.weeklyTargetQty)) {
          return { ...row, qty: '0' };
        }
        return { ...row, qty: value };
      }),
    );
  }

  function fillAllWithTarget() {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        qty: String(defaultResetQty(row.remainingQty, row.weeklyTargetQty)),
      })),
    );
  }

  function useScheduledResetDay() {
    setPickDayMode(false);
    setNextResetDay(weeklyResetDay ?? getColomboDayOfWeek());
  }

  function enablePickResetDay() {
    setPickDayMode(true);
    setNextResetDay(weeklyResetDay ?? getColomboDayOfWeek());
  }

  const resetDateSubtitle =
    weeklyResetDay != null
      ? `This reset · ${getWeeklyResetDayLabel(weeklyResetDay)}`
      : 'Current weekly reset';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col font-sans">
        <div className="border-b border-gray-200 px-6 py-5 flex items-start justify-between relative">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <RefreshCw size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Reset weekly stock</h3>
              <p className="text-sm text-gray-500 mt-1">
                Top up products that are below their weekly target. Existing stock will remain available.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pickDayMode ? (
              <>
                <select
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  value={nextResetDay}
                  onChange={(e) => setNextResetDay(parseInt(e.target.value, 10))}
                  aria-label="Next reset day"
                >
                  {WEEKLY_RESET_DAY_LABELS.map((label, day) => (
                    <option key={label} value={day}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={useScheduledResetDay}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={enablePickResetDay}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Calendar size={14} />
                Change day
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 border-b border-gray-200 grid gap-6 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Reset date</label>
            <div className="relative">
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-gray-50 outline-none"
                readOnly
                value={formatDateWithWeekday(`${resetDate}T12:00:00`)}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{resetDateSubtitle}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Batch number</label>
            <div className="relative">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-50 font-mono outline-none pr-10"
                readOnly
                value={previewQuery.data ? `${previewQuery.data} (provisional)` : 'Generating…'}
              />
              <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Note (optional)</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g. Weekly reset or branch restock"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium">
              <CircleDot size={16} className="text-blue-600" />
              {eligibleCount} products eligible
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-600 text-sm font-medium">
              <CheckCircle2 size={16} className="text-gray-400" />
              {parsedRows.length - eligibleCount} already at target
            </div>
          </div>
          
          <div className="ml-2 text-sm text-gray-900 font-medium">
            <span className="font-bold">{totalQty.toLocaleString()}</span> units will be added
          </div>

          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
            disabled={eligibleCount === 0}
            onClick={fillAllWithTarget}
          >
            <Wand2 size={16} />
            Fill deficits
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 pb-2">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-500 border-t border-b border-gray-200">
                <th className="py-3 pr-4 font-medium w-[40%]">Product</th>
                <th className="py-3 pr-4 font-medium text-center">Remaining</th>
                <th className="py-3 pr-4 font-medium text-center">Weekly target</th>
                <th className="py-3 pr-4 font-medium text-center">Qty to add</th>
                <th className="py-3 font-medium text-center">After reset</th>
              </tr>
            </thead>
            <tbody>
              {parsedRows.map((row) => {
                const afterReset = row.remainingQty + (Number.isNaN(row.parsedQty) ? 0 : row.parsedQty);
                const targetMet = afterReset >= row.weeklyTargetQty && row.weeklyTargetQty > 0;

                return (
                  <tr
                    key={row.productId}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          name={row.name}
                          imageUrl={row.imageUrl}
                          contain
                          className="h-10 w-10 rounded-lg bg-gray-50 border border-gray-100"
                        />
                        <span className="font-medium text-gray-900">{row.name}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-600 tabular-nums">{row.remainingQty.toLocaleString()}</td>
                    <td className="py-4 pr-4 text-center text-gray-600 tabular-nums">{row.weeklyTargetQty > 0 ? row.weeklyTargetQty.toLocaleString() : '-'}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center justify-center">
                        {row.eligible ? (
                          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
                            <button 
                              className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 border-r border-gray-300 transition-colors"
                              onClick={() => {
                                const current = Number(row.qty) || 0;
                                if (current > 0) updateQty(row.productId, String(current - 1));
                              }}
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min={0}
                              className="w-14 text-center text-gray-900 text-sm py-1.5 outline-none font-medium tabular-nums"
                              value={row.qty}
                              onChange={(e) => updateQty(row.productId, e.target.value)}
                            />
                            <button 
                              className="px-2 py-1.5 text-blue-500 hover:bg-blue-50 border-l border-gray-300 transition-colors"
                              onClick={() => {
                                const current = Number(row.qty) || 0;
                                updateQty(row.productId, String(current + 1));
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="text-gray-400">—</div>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-end pr-4">
                        {row.weeklyTargetQty > 0 ? (
                          targetMet ? (
                            row.eligible ? (
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-medium whitespace-nowrap">
                                <CheckCircle2 size={12} className="text-green-600" />
                                Target met
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-500 text-xs font-medium whitespace-nowrap">
                                <CheckCircle2 size={12} className="text-gray-400" />
                                Already above target
                              </div>
                            )
                          ) : (
                            <div className="w-[100px]"></div>
                          )
                        ) : (
                           <div className="w-[100px]"></div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-white rounded-b-2xl">
          <div className="text-sm text-gray-600">
            {activeCount} products • <span className="text-blue-600 font-medium">{totalQty.toLocaleString()}</span> units total
          </div>
          <div className="flex gap-3">
            <button 
              type="button" 
              className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" 
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              disabled={resetMutation.isPending || activeCount === 0}
              onClick={() => resetMutation.mutate()}
            >
              <CheckCircle2 size={16} />
              {resetMutation.isPending ? 'Resetting…' : `Reset ${activeCount} products`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
