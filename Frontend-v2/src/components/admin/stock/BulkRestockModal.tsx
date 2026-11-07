'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  Wand2,
  X,
} from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import {
  isNewProductItem,
  submitBulkRestock,
  type StockItem,
} from '@/lib/stockApi';

interface BulkRestockModalProps {
  storeId: string;
  products: StockItem[];
  categories: { id: string; name: string; slug: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

type BulkRow = {
  productId: string;
  name: string;
  imageUrl?: string | null;
  categorySlug: string;
  categoryName: string;
  selected: boolean;
  weeklyTargetQty: string;
  qty: string;
};

function buildRows(products: StockItem[]): BulkRow[] {
  return products.filter(isNewProductItem).map((product) => ({
    productId: product.productId,
    name: product.name,
    imageUrl: product.imageUrl,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    selected: false,
    weeklyTargetQty: '',
    qty: '',
  }));
}

function parsePositiveInt(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export default function BulkRestockModal({
  storeId,
  products,
  categories,
  onClose,
  onSuccess,
}: BulkRestockModalProps) {
  const [rows, setRows] = useState<BulkRow[]>(() => buildRows(products));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [bulkTarget, setBulkTarget] = useState('');
  const [note, setNote] = useState('');

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== 'all' && row.categorySlug !== category) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || row.categoryName.toLowerCase().includes(q);
    });
  }, [rows, search, category]);

  const selectedRows = useMemo(() => rows.filter((row) => row.selected), [rows]);
  const filteredSelectedCount = filteredRows.filter((row) => row.selected).length;
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => row.selected);

  const submitItems = useMemo(() => {
    return selectedRows
      .map((row) => {
        const weeklyTargetQty = parsePositiveInt(row.weeklyTargetQty);
        const qty = parsePositiveInt(row.qty);
        if (weeklyTargetQty == null || qty == null) return null;
        return { productId: row.productId, weeklyTargetQty, qty };
      })
      .filter((item): item is { productId: string; weeklyTargetQty: number; qty: number } => !!item);
  }, [selectedRows]);

  const totalQty = submitItems.reduce((sum, item) => sum + item.qty, 0);
  const incompleteSelected = selectedRows.filter((row) => {
    return parsePositiveInt(row.weeklyTargetQty) == null || parsePositiveInt(row.qty) == null;
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (selectedRows.length === 0) {
        throw new Error('Select at least one product to restock');
      }
      if (incompleteSelected.length > 0) {
        throw new Error('Set a weekly target and receive qty for every selected product');
      }
      return submitBulkRestock({
        storeId,
        note: note.trim() || undefined,
        items: submitItems,
      });
    },
    onSuccess: (result) => {
      toast.success(
        `Bulk restock ${result.batchNumber} created for ${result.results.length} product(s)`,
      );
      onSuccess();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleSelectAllFiltered() {
    const next = !allFilteredSelected;
    const ids = new Set(filteredRows.map((row) => row.productId));
    setRows((current) =>
      current.map((row) => (ids.has(row.productId) ? { ...row, selected: next } : row)),
    );
  }

  function toggleRow(productId: string) {
    setRows((current) =>
      current.map((row) =>
        row.productId === productId ? { ...row, selected: !row.selected } : row,
      ),
    );
  }

  function updateTarget(productId: string, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.productId !== productId) return row;
        const target = parsePositiveInt(value);
        const shouldFillQty = row.qty.trim() === '' || row.qty === row.weeklyTargetQty;
        return {
          ...row,
          weeklyTargetQty: value,
          qty: shouldFillQty && target != null ? String(target) : row.qty,
        };
      }),
    );
  }

  function updateQty(productId: string, value: string) {
    setRows((current) =>
      current.map((row) => (row.productId === productId ? { ...row, qty: value } : row)),
    );
  }

  function applyTargetToSelected() {
    const target = parsePositiveInt(bulkTarget);
    if (target == null) {
      toast.error('Enter a positive weekly target to apply');
      return;
    }
    setRows((current) =>
      current.map((row) => {
        if (!row.selected) return row;
        const shouldFillQty = row.qty.trim() === '' || row.qty === row.weeklyTargetQty;
        return {
          ...row,
          weeklyTargetQty: String(target),
          qty: shouldFillQty ? String(target) : row.qty,
        };
      }),
    );
  }

  function setQtyEqualTarget() {
    setRows((current) =>
      current.map((row) => {
        if (!row.selected) return row;
        const target = parsePositiveInt(row.weeklyTargetQty);
        return target != null ? { ...row, qty: String(target) } : row;
      }),
    );
  }

  if (rows.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 font-sans">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Bulk Restock</h3>
              <p className="text-sm text-gray-500 mt-2">
                No new products need first stock. Sync catalog products first, or use Reset Stock /
                Receive for products that already have stock history.
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X size={20} />
            </button>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col font-sans">
        <div className="border-b border-gray-200 px-6 py-5 flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <PackagePlus size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Bulk Restock</h3>
              <p className="text-sm text-gray-500 mt-1">
                Set weekly targets and receive first stock for new products.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 bg-white"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            placeholder="Target"
            inputMode="numeric"
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value)}
            aria-label="Weekly target for selected"
          />
          <button
            type="button"
            onClick={applyTargetToSelected}
            disabled={selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
          >
            <Wand2 size={16} />
            Set target for selected
          </button>
          <button
            type="button"
            onClick={setQtyEqualTarget}
            disabled={selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Qty = target
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700">
            {selectedRows.length} selected
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-600">
            <CheckCircle2 size={16} className="text-gray-400" />
            {submitItems.length} ready to submit
          </div>
          <div className="font-medium text-gray-900">
            <span className="font-bold">{totalQty.toLocaleString()}</span> units will be added
          </div>
          <input
            className="ml-auto w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-2">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-t border-gray-200 text-left text-gray-500">
                <th className="py-3 pr-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all filtered products"
                  />
                </th>
                <th className="py-3 pr-4 font-medium w-[40%]">
                  Product
                  {filteredSelectedCount > 0 ? (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      ({filteredSelectedCount} in view)
                    </span>
                  ) : null}
                </th>
                <th className="py-3 pr-4 font-medium text-center">Weekly target</th>
                <th className="py-3 font-medium text-center">Receive qty</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-gray-500">
                    No products match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.productId} className="border-b border-gray-100 last:border-0">
                    <td className="py-4 pr-3">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggleRow(row.productId)}
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          name={row.name}
                          imageUrl={row.imageUrl}
                          contain
                          className="h-10 w-10 rounded-lg border border-gray-100 bg-gray-50"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{row.name}</div>
                          <div className="text-xs text-gray-500">{row.categoryName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center justify-center">
                        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
                          <button
                            type="button"
                            className="border-r border-gray-300 px-2 py-1.5 text-gray-500 hover:bg-gray-50"
                            onClick={() => {
                              const current = Number(row.weeklyTargetQty) || 0;
                              if (current > 1) updateTarget(row.productId, String(current - 1));
                              else updateTarget(row.productId, '');
                            }}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            className="w-16 py-1.5 text-center text-sm font-medium tabular-nums text-gray-900 outline-none"
                            value={row.weeklyTargetQty}
                            onChange={(e) => updateTarget(row.productId, e.target.value)}
                            disabled={!row.selected}
                          />
                          <button
                            type="button"
                            className="border-l border-gray-300 px-2 py-1.5 text-indigo-500 hover:bg-indigo-50"
                            onClick={() => {
                              const current = Number(row.weeklyTargetQty) || 0;
                              updateTarget(row.productId, String(current + 1));
                            }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-center">
                        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
                          <button
                            type="button"
                            className="border-r border-gray-300 px-2 py-1.5 text-gray-500 hover:bg-gray-50"
                            onClick={() => {
                              const current = Number(row.qty) || 0;
                              if (current > 1) updateQty(row.productId, String(current - 1));
                              else updateQty(row.productId, '');
                            }}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            className="w-16 py-1.5 text-center text-sm font-medium tabular-nums text-gray-900 outline-none"
                            value={row.qty}
                            onChange={(e) => updateQty(row.productId, e.target.value)}
                            disabled={!row.selected}
                          />
                          <button
                            type="button"
                            className="border-l border-gray-300 px-2 py-1.5 text-indigo-500 hover:bg-indigo-50"
                            onClick={() => {
                              const current = Number(row.qty) || 0;
                              updateQty(row.productId, String(current + 1));
                            }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || submitItems.length === 0}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold !text-white hover:bg-indigo-700 disabled:opacity-50 [&_svg]:!text-white"
          >
            <PackagePlus size={16} />
            {mutation.isPending
              ? 'Restocking…'
              : `Restock ${submitItems.length} product${submitItems.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
