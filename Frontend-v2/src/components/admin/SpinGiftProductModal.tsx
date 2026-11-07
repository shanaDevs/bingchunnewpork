'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Gift, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import ProductImage from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';

export type SpinGiftProductOption = {
  id: string;
  name: string;
  basePrice: number;
  imageUrl?: string | null;
  category?: { name: string } | null;
};

type Props = {
  open: boolean;
  title?: string;
  products: SpinGiftProductOption[];
  selectedId?: string | null;
  onClose: () => void;
  onSelect: (product: SpinGiftProductOption) => void;
};

export default function SpinGiftProductModal({
  open,
  title = 'Select gift product',
  products,
  selectedId,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category?.name?.toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden border-navy-border bg-navy-card p-0 text-white sm:rounded-2xl">
        <div className="border-b border-navy-border px-5 py-4">
          <DialogTitle className="text-base font-semibold text-white">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted">
            Search the menu and pick the free item for this wheel segment.
          </DialogDescription>
        </div>

        <div className="border-b border-navy-border px-5 py-3">
          <label className="relative block">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              autoFocus
              className="input-field w-full pl-9"
              placeholder="Search products by name or category…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="max-h-[min(60vh,28rem)] overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              {query.trim() ? 'No matching products' : 'No products available'}
            </p>
          ) : (
            <ul className="space-y-1" role="listbox" aria-label="Gift products">
              {filtered.map((product) => {
                const active = product.id === selectedId;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'bg-brand/15 ring-1 ring-brand/40'
                          : 'hover:bg-navy-light/60',
                      )}
                      onClick={() => onSelect(product)}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-navy-border bg-navy-light">
                        {product.imageUrl ? (
                          <ProductImage
                            name={product.name}
                            imageUrl={product.imageUrl}
                            className="h-full w-full"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Gift size={16} className="text-brand" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{product.name}</p>
                        <p className="truncate text-xs text-muted">
                          {product.category?.name ? `${product.category.name} · ` : ''}
                          LKR {product.basePrice.toLocaleString()}
                        </p>
                      </div>
                      {active ? (
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                          <Check size={14} strokeWidth={2.5} aria-hidden />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
