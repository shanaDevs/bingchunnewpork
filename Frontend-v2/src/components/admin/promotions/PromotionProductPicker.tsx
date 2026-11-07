'use client';

import { adminApiFetch as adminFetch } from '@/lib/adminApi';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import type { Product } from '@/types';
import type { SelectedPromoProduct } from '@/lib/promotionTypes';

export function productToSelected(p: Product): SelectedPromoProduct {
  return {
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    basePrice: p.basePrice,
    categoryName: p.category?.name,
  };
}

interface PromotionProductPickerProps {
  label: string;
  hint?: string;
  selected: SelectedPromoProduct[];
  onChange: (next: SelectedPromoProduct[]) => void;
  multiple?: boolean;
  placeholder?: string;
}

export default function PromotionProductPicker({
  label,
  hint,
  selected,
  onChange,
  multiple = false,
  placeholder = 'Search products by name…',
}: PromotionProductPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['promo-product-picker'],
    queryFn: () => adminFetch('/menu/products'),
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedIds = new Set(selected.map((p) => p.id));
    let list = products.filter((p) => !selectedIds.has(p.id));
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category?.name?.toLowerCase().includes(q) ||
          p.tag?.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 8);
  }, [products, query, selected]);

  function addProduct(product: Product) {
    const item = productToSelected(product);
    if (multiple) {
      onChange([...selected, item]);
    } else {
      onChange([item]);
    }
    setQuery('');
    setOpen(false);
  }

  function removeProduct(id: string) {
    onChange(selected.filter((p) => p.id !== id));
  }

  return (
    <div className="promo-product-picker" ref={wrapRef}>
      <label className="promo-create-panel__field">
        {label}
        {hint && <span className="text-sm text-muted font-normal">{hint}</span>}
      </label>

      {selected.length > 0 && (
        <ul className="promo-product-picker__selected" aria-label="Selected products">
          {selected.map((item) => (
            <li key={item.id} className="promo-product-picker__chip">
              <div className="promo-product-picker__chip-thumb">
                <ProductImage name={item.name} imageUrl={item.imageUrl} className="w-full h-full" />
              </div>
              <div className="promo-product-picker__chip-body">
                <span className="promo-product-picker__chip-name">{item.name}</span>
                {item.categoryName && (
                  <span className="promo-product-picker__chip-meta">{item.categoryName}</span>
                )}
                {item.basePrice != null && (
                  <span className="promo-product-picker__chip-price">LKR {item.basePrice.toLocaleString()}</span>
                )}
              </div>
              <button
                type="button"
                className="promo-product-picker__chip-remove"
                onClick={() => removeProduct(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(multiple || selected.length === 0) && (
        <div className="promo-product-picker__search-wrap">
          <Search size={15} className="promo-product-picker__search-icon" aria-hidden />
          <input
            className="input-field promo-product-picker__search"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          />
          {open && (
            <div className="promo-product-picker__dropdown" role="listbox">
              {isLoading && <p className="promo-product-picker__empty">Loading products…</p>}
              {!isLoading && suggestions.length === 0 && (
                <p className="promo-product-picker__empty">
                  {query.trim() ? 'No matching products' : 'Type to search the menu'}
                </p>
              )}
              {suggestions.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="promo-product-picker__option"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addProduct(product)}
                >
                  <div className="promo-product-picker__option-thumb">
                    <ProductImage name={product.name} imageUrl={product.imageUrl} className="w-full h-full" />
                  </div>
                  <div className="promo-product-picker__option-body">
                    <span className="promo-product-picker__option-name">{product.name}</span>
                    <span className="promo-product-picker__option-meta">
                      {product.category?.name}
                      {product.tag ? ` · ${product.tag}` : ''}
                    </span>
                  </div>
                  <span className="promo-product-picker__option-price">
                    LKR {product.basePrice.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PromotionCategoryPickerProps {
  label: string;
  value: string;
  categoryId?: string;
  onChange: (name: string, categoryId?: string) => void;
}

export function PromotionCategoryPicker({ label, value, categoryId, onChange }: PromotionCategoryPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['promo-categories'],
    queryFn: () => adminFetch('/menu/categories'),
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories.slice(0, 8);
    return categories.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [categories, query]);

  const selectedCat = categories.find((c) => c.id === categoryId || c.name === value);

  return (
    <div className="promo-product-picker">
      <label className="promo-create-panel__field">{label}</label>
      {selectedCat && (
        <div className="promo-product-picker__selected">
          <span className="promo-product-picker__category-chip">{selectedCat.name}</span>
        </div>
      )}
      <div className="promo-product-picker__search-wrap">
        <Search size={15} className="promo-product-picker__search-icon" aria-hidden />
        <input
          className="input-field promo-product-picker__search"
          placeholder="Search categories…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        {open && suggestions.length > 0 && (
          <div className="promo-product-picker__dropdown">
            {suggestions.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="promo-product-picker__option promo-product-picker__option--category"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(cat.name, cat.id);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span className="promo-product-picker__option-name">{cat.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
