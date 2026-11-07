'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ProductImage from '@/components/ui/ProductImage';
import { calcUnitPrice } from '@/store/cartStore';
import {
  draftToUpdatePayload,
  orderItemsToDraft,
  orderTotalLabel,
  previewOrderBalanceDue,
  previewOrderTotalAfterEdit,
  type DraftOrderItem,
  type OrderEditMode,
} from '@/lib/orderEdit';
import { formatMoney } from '@/lib/receipt';
import type { Category, Order, Product, Topping } from '@/types';

type Props = {
  open: boolean;
  order: Order | null;
  mode: OrderEditMode;
  onClose: () => void;
  onSaved: (order: Order) => void;
};

function newClientId() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitProductName(name: string): { lead: string; rest: string } {
  const idx = name.indexOf(' ');
  if (idx === -1) return { lead: '', rest: name };
  return { lead: name.slice(0, idx), rest: name.slice(idx + 1) };
}

function sameToppingIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

function formatNewItemOptionLine(toppingNames: string[]): string {
  const base = 'Regular · 100% Sugar · Regular Ice';
  if (toppingNames.length === 0) return base;
  return `${base} · + ${toppingNames.join(', ')}`;
}

function getToppingNames(productId: string, toppingIds: string[], products: Product[]): string[] {
  const product = products.find((p) => p.id === productId);
  if (!product) return [];
  return toppingIds
    .map((id) => product.toppings?.find((pt) => pt.topping.id === id)?.topping.name)
    .filter((name): name is string => Boolean(name));
}

function ProductAddPicker({
  product,
  onClose,
  onConfirm,
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (toppings: Topping[], quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<Topping[]>([]);

  const availableToppings = useMemo(
    () => (product.toppings ?? []).map((pt) => pt.topping).filter((t) => t.isAvailable),
    [product.toppings],
  );

  const toppingsExtra = selectedToppings.reduce((sum, t) => sum + t.extraPrice, 0);
  const unitPrice = calcUnitPrice(product, 'REGULAR', selectedToppings);
  const totalPrice = unitPrice * quantity;

  function toggleTopping(topping: Topping) {
    setSelectedToppings((prev) =>
      prev.some((t) => t.id === topping.id)
        ? prev.filter((t) => t.id !== topping.id)
        : [...prev, topping],
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-10 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col overflow-hidden rounded-t-2xl border border-navy-border bg-navy-card shadow-2xl"
        role="dialog"
        aria-modal
        aria-label={`Customize ${product.name}`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-navy-border px-4 py-3">
          <ProductImage
            name={product.name}
            imageUrl={product.imageUrl}
            contain
            className="h-14 w-14 shrink-0 rounded-xl bg-navy-light/40 p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-fg">{product.name}</p>
            <p className="mt-0.5 text-xs text-muted">From {formatMoney(product.basePrice)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-navy-light hover:text-fg"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Base price</span>
              <span className="text-fg">{formatMoney(product.basePrice)}</span>
            </div>
            {toppingsExtra > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Toppings</span>
                <span className="text-fg">{formatMoney(toppingsExtra)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-navy-border pt-2 font-bold">
              <span className="text-fg">Total</span>
              <span className="text-brand">{formatMoney(totalPrice)}</span>
            </div>
          </div>

          {availableToppings.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Toppings</p>
              <div className="space-y-2">
                {availableToppings.map((topping) => {
                  const checked = selectedToppings.some((t) => t.id === topping.id);
                  return (
                    <button
                      key={topping.id}
                      type="button"
                      onClick={() => toggleTopping(topping)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        checked
                          ? 'border-brand/50 bg-brand-subtle'
                          : 'border-navy-border bg-navy-light/20 hover:border-brand/30'
                      }`}
                    >
                      {checked ? (
                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" />
                      ) : (
                        <Circle size={20} className="mt-0.5 shrink-0 text-muted" />
                      )}
                      <span className={`flex-1 text-sm ${checked ? 'font-semibold text-fg' : 'text-fg'}`}>
                        {topping.name}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold ${checked ? 'text-brand' : 'text-muted'}`}>
                        + {formatMoney(topping.extraPrice)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-navy-border px-4 py-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-navy-border bg-navy-light/25 p-0.5">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="rounded-md p-1.5 text-muted hover:text-fg disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              disabled={quantity >= 20}
              className="rounded-md p-1.5 text-muted hover:text-fg disabled:opacity-40"
              aria-label="Increase quantity"
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onConfirm(selectedToppings, quantity)}
            className="btn-primary flex-1 py-2.5 text-sm font-semibold"
          >
            Add · {formatMoney(totalPrice)}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function OrderEditProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const { lead, rest } = splitProductName(product.name);
  const tagLabel = (product.tag || 'Classic').toUpperCase();
  const categoryLabel = (product.category?.name || 'Drink').toUpperCase();

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card transition-colors hover:border-brand/40 [box-shadow:var(--shadow-product)]">
      <div className="relative px-3 pt-3 pb-2" style={{ background: 'var(--product-media-bg)' }}>
        <span className="absolute left-5 top-5 h-10 w-10 rounded-full bg-brand/10" aria-hidden />
        <span className="absolute bottom-6 right-4 h-7 w-7 rounded-full bg-brand/8" aria-hidden />

        <div className="relative z-10 flex items-center justify-between gap-1.5">
          <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
            {tagLabel}
          </span>
          <span className="rounded-full border border-brand/40 bg-navy-card/60 px-2 py-0.5 text-[9px] font-bold tracking-wide text-brand">
            {categoryLabel}
          </span>
        </div>

        <div className="relative z-10 mt-2 flex h-24 items-center justify-center">
          <ProductImage
            name={product.name}
            imageUrl={product.imageUrl}
            contain
            className="max-h-[88px] max-w-full drop-shadow-md"
          />
          <button
            type="button"
            onClick={onAdd}
            className="absolute bottom-0 right-0 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-2 ring-navy-card transition-transform hover:scale-105 active:scale-95"
            aria-label={`Add ${product.name}`}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2">
        <h3 className="text-sm leading-snug">
          {lead ? (
            <>
              <span className="font-medium text-muted">{lead} </span>
              <span className="font-bold text-fg">{rest}</span>
            </>
          ) : (
            <span className="font-bold text-fg">{rest}</span>
          )}
        </h3>
        {product.description && (
          <p className="line-clamp-2 text-xs leading-snug text-muted">{product.description}</p>
        )}

        <button
          type="button"
          onClick={onAdd}
          className="mt-auto w-full rounded-xl px-2.5 py-2 text-sm font-bold tabular-nums transition-opacity hover:opacity-90"
          style={{
            background: 'var(--product-price-bg)',
            color: 'var(--product-price-text)',
          }}
        >
          {formatMoney(product.basePrice)}
        </button>
      </div>
    </article>
  );
}

export default function AdminOrderEditModal({ open, order, mode, onClose, onSaved }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [draft, setDraft] = useState<DraftOrderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (open && order) {
      setDraft(orderItemsToDraft(order.items));
      setSelectedCategory('all');
      setProductSearch('');
      setPickerProduct(null);
    }
  }, [open, order]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, saving, onClose]);

  const storeId = order?.store?.id ?? '';

  const adminFetch = async (endpoint: string) => {
        const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      headers: adminAuthHeaders(),
      credentials: 'include',
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Request failed');
    return json.data;
  };

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['order-edit-categories'],
    queryFn: () => adminFetch('/menu/categories'),
    enabled: open && Boolean(order),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['order-edit-products', storeId],
    queryFn: () => {
      const params = new URLSearchParams({ available: 'true', storeId });
      return adminFetch(`/menu/products?${params}`);
    },
    enabled: open && Boolean(storeId),
  });

  const filteredProducts = useMemo(() => {
    let list =
      selectedCategory === 'all'
        ? products
        : products.filter((p) => p.categoryId === selectedCategory);

    const query = productSearch.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.category?.name?.toLowerCase().includes(query),
      );
    }

    return list;
  }, [products, selectedCategory, productSearch]);

  const draftSubtotal = useMemo(
    () => draft.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [draft],
  );

  const addOnly = mode === 'add_only';
  const originalSubtotal = order?.subtotal ?? 0;
  const previewTotal = order ? previewOrderTotalAfterEdit(order, draftSubtotal, mode) : 0;
  const prepaidAmount = order?.prepaidAmount ?? 0;
  const balanceDuePreview = order ? previewOrderBalanceDue(order, draftSubtotal, mode) : 0;
  const draftEdited = draftSubtotal !== originalSubtotal;

  function updateQty(index: number, delta: number) {
    setDraft((prev) => {
      const item = prev[index];
      if (!item) return prev;

      if (delta < 0 && item.kind === 'new' && item.quantity <= 1) {
        return prev.filter((_, i) => i !== index);
      }

      return prev.map((entry, i) => {
        if (i !== index) return entry;
        const minQty =
          addOnly && entry.kind === 'existing' ? entry.originalQuantity : 1;
        const quantity = Math.max(minQty, Math.min(20, entry.quantity + delta));
        return { ...entry, quantity };
      });
    });
  }

  function removeItem(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function addProduct(product: Product, toppings: Topping[], quantity = 1) {
    const toppingIds = toppings.map((t) => t.id);
    const unitPrice = calcUnitPrice(product, 'REGULAR', toppings);

    setDraft((prev) => {
      const existingNew = prev.find(
        (item) =>
          item.kind === 'new' &&
          item.productId === product.id &&
          item.size === 'REGULAR' &&
          item.sugarLevel === 'HUNDRED' &&
          item.iceLevel === 'REGULAR' &&
          sameToppingIds(item.toppingIds, toppingIds),
      );
      if (existingNew && existingNew.kind === 'new') {
        return prev.map((item) =>
          item === existingNew
            ? { ...item, quantity: Math.min(20, item.quantity + quantity) }
            : item,
        );
      }
      return [
        ...prev,
        {
          kind: 'new' as const,
          clientId: newClientId(),
          productId: product.id,
          productName: product.name,
          size: 'REGULAR' as const,
          sugarLevel: 'HUNDRED' as const,
          iceLevel: 'REGULAR' as const,
          toppingIds,
          unitPrice,
          quantity,
        },
      ];
    });
    setPickerProduct(null);
    toast.success(`Added ${product.name}`, { duration: 1500 });
  }

  function handleAddProductClick(product: Product) {
    const hasToppings = (product.toppings ?? []).some((pt) => pt.topping.isAvailable);
    if (hasToppings) {
      setPickerProduct(product);
      return;
    }
    addProduct(product, [], 1);
  }

  async function handleSave() {
    if (!order || saving) return;
    if (draft.length === 0) {
      toast.error('Order must have at least one item');
      return;
    }

    setSaving(true);
    try {
            const res = await fetch(
        `${getApiBaseUrl()}/orders/${encodeURIComponent(order.id)}/items`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: draftToUpdatePayload(draft) }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to update order');

      toast.success('Order updated');
      onSaved(json.data as Order);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update order');
    } finally {
      setSaving(false);
    }
  }

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {open && order && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1300] bg-black/55 backdrop-blur-sm"
            onClick={saving ? undefined : onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={addOnly ? 'Add items to order' : 'Edit order'}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="fixed left-1/2 top-1/2 z-[1301] h-[min(92vh,760px)] w-[min(96vw,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
          >
            <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-lg font-bold text-fg">
                  {addOnly ? 'Add items' : 'Edit order'}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">{order.orderNumber}</p>
                {addOnly && (
                  <p className="mt-1 text-xs text-muted">
                    Paid online — you can add items only. Collect any balance at pickup.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg p-2 text-muted hover:bg-navy-light hover:text-fg disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Current items ({draft.length})
                  </p>
                </div>
                {draft.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-navy-border px-4 py-6 text-center text-sm text-muted">
                    Add at least one item to save
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {draft.map((item, index) => {
                      const canRemove = !addOnly || item.kind === 'new';
                      return (
                        <li
                          key={item.kind === 'existing' ? item.orderItemId : item.clientId}
                          className={`rounded-xl border px-3 py-2.5 ${
                            item.kind === 'new'
                              ? 'border-brand/40 bg-brand-subtle/30'
                              : 'border-navy-border bg-navy-light/25'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-fg">{item.productName}</p>
                                {item.kind === 'new' && (
                                  <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                                    New
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted">
                                {item.kind === 'existing'
                                  ? item.optionLine
                                  : formatNewItemOptionLine(
                                      getToppingNames(item.productId, item.toppingIds, products),
                                    )}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              <p className="text-xs font-semibold text-brand tabular-nums">
                                {formatMoney(item.unitPrice * item.quantity)}
                              </p>
                              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-navy-border bg-navy-card p-0.5">
                                <button
                                  type="button"
                                  onClick={() => updateQty(index, -1)}
                                  disabled={
                                    item.kind !== 'new' &&
                                    item.quantity <=
                                      (addOnly && item.kind === 'existing'
                                        ? item.originalQuantity
                                        : 1)
                                  }
                                  className="rounded-md p-1.5 text-muted hover:text-fg disabled:opacity-40"
                                  aria-label={
                                    item.kind === 'new' && item.quantity <= 1
                                      ? 'Remove added item'
                                      : 'Decrease quantity'
                                  }
                                >
                                  <Minus size={14} />
                                </button>
                                <span className="w-6 text-center text-sm font-semibold tabular-nums">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQty(index, 1)}
                                  disabled={item.quantity >= 20}
                                  className="rounded-md p-1.5 text-muted hover:text-fg disabled:opacity-40"
                                  aria-label="Increase quantity"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() => removeItem(index)}
                                  className="flex items-center gap-1 rounded-lg border border-red-400/70 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/25"
                                  aria-label={item.kind === 'new' ? 'Remove added item' : 'Remove item'}
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-navy-border bg-navy-light/20">
                <div className="space-y-3 border-b border-navy-border px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Add product</p>
                  <div className={`input-icon-wrap${productSearch ? ' input-icon-wrap--end' : ''}`}>
                    <Search size={16} className="input-icon" aria-hidden />
                    <input
                      type="search"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search drinks…"
                      className="search-bar w-full"
                      aria-label="Search products"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onClick={() => setProductSearch('')}
                        className="input-action p-1 text-muted hover:text-fg"
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        selectedCategory === 'all'
                          ? 'bg-brand text-white'
                          : 'bg-navy-card text-muted hover:text-fg'
                      }`}
                    >
                      All
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                          selectedCategory === cat.id
                            ? 'bg-brand text-white'
                            : 'bg-navy-card text-muted hover:text-fg'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3">
                  {productsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                      <Loader2 size={16} className="animate-spin" />
                      Loading menu…
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted">
                      {productSearch.trim()
                        ? `No drinks match “${productSearch.trim()}”`
                        : 'No products in this category'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {filteredProducts.map((product) => (
                        <OrderEditProductCard
                          key={product.id}
                          product={product}
                          onAdd={() => handleAddProductClick(product)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="shrink-0 border-t border-navy-border px-5 py-4">
              <div className="mb-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">
                    {order ? orderTotalLabel(order, draftEdited) : 'Total'}
                  </span>
                  <p className="text-lg font-bold text-brand">{formatMoney(previewTotal)}</p>
                </div>
                {addOnly && prepaidAmount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Paid online</span>
                    <span className="text-muted tabular-nums">{formatMoney(prepaidAmount)}</span>
                  </div>
                )}
                {addOnly && balanceDuePreview > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-fg">Balance due at counter</span>
                    <span className="text-fg tabular-nums">{formatMoney(balanceDuePreview)}</span>
                  </div>
                )}
                {!addOnly && draftSubtotal !== originalSubtotal && (
                  <p className="text-xs text-muted text-right">was {formatMoney(order.total)}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="btn-outline flex-1 py-2.5 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || draft.length === 0}
                  className="btn-primary flex flex-1 items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                  Save changes
                </button>
              </div>
            </div>

            <AnimatePresence>
              {pickerProduct && (
                <ProductAddPicker
                  key={pickerProduct.id}
                  product={pickerProduct}
                  onClose={() => setPickerProduct(null)}
                  onConfirm={(toppings, quantity) => addProduct(pickerProduct, toppings, quantity)}
                />
              )}
            </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
