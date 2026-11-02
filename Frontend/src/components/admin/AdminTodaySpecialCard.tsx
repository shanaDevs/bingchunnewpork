'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';

export default function AdminTodaySpecialCard() {
  const [specialProductId, setSpecialProductId] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [specialEndsAt, setSpecialEndsAt] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const qc = useQueryClient();

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ['admin-products'],
    queryFn: () => adminFetch('/menu/products'),
  });

  const { data: specials = [] } = useQuery<any[]>({
    queryKey: ['admin-specials'],
    queryFn: () => adminFetch('/menu/specials'),
  });

  const createSpecialMutation = useMutation({
    mutationFn: () =>
      adminFetch('/menu/specials', {
        method: 'POST',
        body: JSON.stringify({
          productId: specialProductId,
          specialPrice: Number(specialPrice),
          endsAt: new Date(specialEndsAt).toISOString(),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-specials'] });
      toast.success("Today's special published");
      setSpecialProductId('');
      setSpecialPrice('');
      setSpecialEndsAt('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateSpecialMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/menu/specials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-specials'] });
      toast.success('Special deactivated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const lowerQuery = searchQuery.toLowerCase();
    return products.filter((p: any) => p.name.toLowerCase().includes(lowerQuery));
  }, [products, searchQuery]);

  const selectedProduct = products.find((p: any) => p.id === specialProductId);

  return (
    <div className="card p-5 border border-brand/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15">
              <Tag size={18} className="text-brand" />
            </div>
            <div>
              <h3 className="font-semibold text-fg">Today&apos;s Special</h3>
              <p className="text-xs text-muted">
                Show a discounted product with countdown on the customer menu page.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1 md:!w-auto" ref={dropdownRef}>
              <div className="input-icon-wrap input-icon-wrap--end">
                <ChevronDown size={16} className="input-icon text-muted" aria-hidden />
                <input
                  type="text"
                  placeholder={selectedProduct ? `${selectedProduct.name} (LKR ${selectedProduct.basePrice})` : "Search product…"}
                  value={isDropdownOpen ? searchQuery : (selectedProduct ? `${selectedProduct.name} (LKR ${selectedProduct.basePrice})` : '')}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setIsDropdownOpen(true);
                    setSearchQuery('');
                  }}
                  className="input-field w-full cursor-text"
                />
              </div>
              {isDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 max-h-60 overflow-auto rounded-lg border border-navy-border bg-navy shadow-xl">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-sm text-muted text-center">No products found.</div>
                  ) : (
                    filteredProducts.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-brand/10 focus:bg-brand/10 focus:outline-none ${
                          specialProductId === p.id ? 'bg-brand/5 text-brand' : 'text-fg'
                        }`}
                        onClick={() => {
                          setSpecialProductId(p.id);
                          setSearchQuery('');
                          setIsDropdownOpen(false);
                        }}
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted text-xs ml-1 whitespace-nowrap">(LKR {p.basePrice})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <input
              type="number"
              placeholder="Special price (LKR)"
              value={specialPrice}
              onChange={(e) => setSpecialPrice(e.target.value)}
              className="input-field w-full shrink-0 md:!w-44"
            />
            <input
              type="datetime-local"
              value={specialEndsAt}
              onChange={(e) => setSpecialEndsAt(e.target.value)}
              className="input-field w-full shrink-0 md:!w-56"
            />
            <button
              type="button"
              disabled={!specialProductId || !specialPrice || !specialEndsAt || createSpecialMutation.isPending}
              onClick={() => createSpecialMutation.mutate()}
              className="btn-primary shrink-0 px-4 py-2 text-sm whitespace-nowrap disabled:opacity-50"
            >
              Publish Special
            </button>
          </div>
        </div>

        <div className="hidden shrink-0 self-center lg:block">
          <Image
            src="/promos/menu-hero-cup-transparent.png"
            alt=""
            width={72}
            height={96}
            className="h-20 w-auto object-contain"
            aria-hidden
          />
        </div>
      </div>

      {specials.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-navy-border pt-4">
          {specials.slice(0, 5).map((s: any) => (
            <li key={s.id} className="flex items-center justify-between gap-3 text-sm border-t border-navy-border pt-2 first:border-t-0 first:pt-0">
              <span className="text-fg">
                {s.product?.name} · LKR {s.specialPrice}
                {!s.isActive && <span className="text-red-400 ml-2">(inactive)</span>}
              </span>
              {s.isActive && (
                <button
                  type="button"
                  onClick={() => deactivateSpecialMutation.mutate(s.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Deactivate
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
