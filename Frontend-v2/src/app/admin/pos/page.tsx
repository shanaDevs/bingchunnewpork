'use client';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Trash2, ShoppingCart, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import CounterPaymentForm, { counterPaymentValid } from '@/components/admin/CounterPaymentForm';
import { formatMoney } from '@/lib/receipt';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import type { Category, Product } from '@/types';

interface PosCartItem {
  cartId: string;
  productId: string;
  name: string;
  basePrice: number;
  imageUrl?: string;
  quantity: number;
}

function splitProductName(name: string): { lead: string; rest: string } {
  const idx = name.indexOf(' ');
  if (idx === -1) return { lead: '', rest: name };
  return { lead: name.slice(0, idx), rest: name.slice(idx + 1) };
}

function ProductImage({
  name,
  imageUrl,
  className = '',
  contain = false,
}: {
  name: string;
  imageUrl?: string;
  className?: string;
  contain?: boolean;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`${contain ? 'object-contain' : 'object-cover'} ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-navy-light text-3xl ${className}`}>
      🧋
    </div>
  );
}

function PosProductCard({
  product,
  disabled,
  onAdd,
}: {
  product: Product;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { lead, rest } = splitProductName(product.name);
  const tagLabel = (product.tag || 'Classic').toUpperCase();
  const categoryLabel = (product.category?.name || 'Drink').toUpperCase();

  return (
    <article className="bg-navy-card border border-navy-border rounded-2xl overflow-hidden flex flex-col hover:border-brand/40 transition-colors [box-shadow:var(--shadow-product)]">
      <div
        className="relative px-3 pt-3 pb-1"
        style={{ background: 'var(--product-media-bg)' }}
      >
        <span className="absolute top-5 left-5 w-10 h-10 rounded-full bg-brand/10" aria-hidden />
        <span className="absolute bottom-6 right-4 w-7 h-7 rounded-full bg-brand/8" aria-hidden />

        <div className="relative flex items-center justify-between gap-1.5 z-10">
          <span className="px-2 py-0.5 rounded-full bg-brand text-white text-[9px] font-bold tracking-wide">
            {tagLabel}
          </span>
          <span className="px-2 py-0.5 rounded-full border border-brand/40 text-brand text-[9px] font-bold tracking-wide bg-navy-card/60">
            {categoryLabel}
          </span>
        </div>

        <div className="relative z-10 flex items-center justify-center h-24 mt-1.5">
          <ProductImage
            name={product.name}
            imageUrl={product.imageUrl}
            contain
            className="max-h-[88px] max-w-full drop-shadow-md"
          />
        </div>
      </div>

      <div className="px-3 pb-3 pt-2 flex flex-col gap-1 flex-1">
        <h3 className="text-sm leading-snug">
          {lead ? (
            <>
              <span className="text-muted font-medium">{lead} </span>
              <span className="text-fg font-bold">{rest}</span>
            </>
          ) : (
            <span className="text-fg font-bold">{rest}</span>
          )}
        </h3>
        {product.description && (
          <p className="text-muted text-xs leading-snug line-clamp-1">
            {product.description}
          </p>
        )}

        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="mt-1 w-full py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
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

interface PlaceOrderResult {
  order: { id: string; orderNumber: string; total: number };
  paymentUrl?: string;
}

export default function AdminPosPage() {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [storeId, setStoreId] = useState('');
  const [posCart, setPosCart] = useState<PosCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [placing, setPlacing] = useState(false);
  const [successOrder, setSuccessOrder] = useState<{ orderNumber: string; total: number } | null>(null);

  useEffect(() => {
    setAdmin(getAdminSession());
  }, []);

  const { data: stores = [] } = useQuery({
    queryKey: ['pos-stores'],
    queryFn: () => adminFetch<{ id: string; name: string }[]>('/stores'),
    enabled: Boolean(admin && isSuperAdmin(admin)),
  });

  useEffect(() => {
    if (admin && !isSuperAdmin(admin) && admin.storeId) {
      setStoreId(admin.storeId);
    }
  }, [admin]);

  useEffect(() => {
    if (isSuperAdmin(admin) && stores.length > 0 && !storeId) {
      setStoreId(stores[0].id);
    }
  }, [admin, stores, storeId]);

  const effectiveStoreId = isSuperAdmin(admin) ? storeId : admin?.storeId ?? '';

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ['pos-categories'],
    queryFn: () => adminFetch('/menu/categories'),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['pos-products', effectiveStoreId],
    queryFn: () => {
      const params = new URLSearchParams({ available: 'true' });
      if (effectiveStoreId) params.set('storeId', effectiveStoreId);
      return adminFetch(`/menu/products?${params.toString()}`);
    },
    enabled: Boolean(effectiveStoreId),
  });

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.categoryId === selectedCategory);
  }, [products, selectedCategory]);

  const total = useMemo(
    () => posCart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0),
    [posCart],
  );

  const canCheckout =
    posCart.length > 0 &&
    Boolean(effectiveStoreId) &&
    !placing &&
    counterPaymentValid(paymentMethod, cashReceived, total, { requireCashAmount: false });

  function addToCart(product: Product) {
    setPosCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          cartId: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          basePrice: product.basePrice,
          imageUrl: product.imageUrl,
          quantity: 1,
        },
      ];
    });
  }

  function updateQty(cartId: string, qty: number) {
    if (qty <= 0) {
      setPosCart((prev) => prev.filter((item) => item.cartId !== cartId));
      return;
    }
    setPosCart((prev) =>
      prev.map((item) => (item.cartId === cartId ? { ...item, quantity: qty } : item)),
    );
  }

  function removeItem(cartId: string) {
    setPosCart((prev) => prev.filter((item) => item.cartId !== cartId));
  }

  function clearCart() {
    setPosCart([]);
    setCashReceived('');
    setPaymentMethod('CASH');
  }

  async function placeOrder() {
    if (!effectiveStoreId) {
      toast.error('Select a branch before placing an order');
      return;
    }
    if (posCart.length === 0) return;
    if (!counterPaymentValid(paymentMethod, cashReceived, total, { requireCashAmount: false })) {
      toast.error('Cash received is less than the total bill');
      return;
    }

    setPlacing(true);
    try {
      const result = await adminFetch<PlaceOrderResult>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          orderMode: 'TAKEAWAY',
          storeId: effectiveStoreId,
          paymentMethod: paymentMethod === 'CASH' ? 'CASH_AT_COUNTER' : 'CARD',
          channel: 'POS',
          platform: 0,
          items: posCart.map((item) => ({
            productId: item.productId,
            size: 'REGULAR',
            sugarLevel: 'HUNDRED',
            iceLevel: 'NORMAL_ICE',
            toppingIds: [],
            quantity: item.quantity,
          })),
        }),
      });

      setSuccessOrder({
        orderNumber: result.order.orderNumber,
        total: result.order.total,
      });
      clearCart();

      if (result.paymentUrl) {
        toast.success('Order created — redirecting to card payment');
        window.open(result.paymentUrl, '_blank');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  }

  const loading = categoriesLoading || productsLoading;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-fg">In-Store POS</h1>
          <p className="text-muted text-sm">Takeaway counter orders</p>
        </div>
        {isSuperAdmin(admin) && stores.length > 0 && (
          <select
            className="input-field max-w-xs text-sm"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!effectiveStoreId && (
        <div className="card p-4 mb-4 border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm">
          No branch selected. Assign a store to this admin account or pick a branch to use POS.
        </div>
      )}

      <div className="flex-1 grid lg:grid-cols-[1fr_380px] gap-4 min-h-0">
        {/* Left: Product grid */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 border-b border-navy-border flex gap-2 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-brand text-white'
                    : 'bg-navy-card text-muted hover:text-fg'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-muted text-sm text-center py-12">Loading menu…</p>
            ) : filteredProducts.length === 0 ? (
              <p className="text-muted text-sm text-center py-12">No products available</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((product) => (
                  <PosProductCard
                    key={product.id}
                    product={product}
                    disabled={!effectiveStoreId}
                    onAdd={() => addToCart(product)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart + checkout */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-navy-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-brand" />
              <h2 className="font-semibold text-fg">Cart</h2>
              <span className="text-muted text-xs">({posCart.length} items)</span>
            </div>
            {posCart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-muted hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {posCart.length === 0 ? (
              <p className="text-muted text-sm text-center py-10">Cart is empty</p>
            ) : (
              posCart.map((item) => (
                <div
                  key={item.cartId}
                  className="rounded-lg border border-navy-border bg-navy-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <ProductImage
                      name={item.name}
                      imageUrl={item.imageUrl}
                      className="w-10 h-10 rounded-lg shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-fg text-sm font-medium truncate">{item.name}</p>
                      <p className="text-muted text-xs mt-0.5">
                        {formatMoney(item.basePrice)} × {item.quantity}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.cartId)}
                      className="p-1 rounded text-muted hover:text-red-400 transition-colors shrink-0"
                      aria-label="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.cartId, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-navy-border flex items-center justify-center text-fg hover:bg-navy-light transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-fg text-sm font-medium w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.cartId, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-navy-border flex items-center justify-center text-fg hover:bg-navy-light transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-fg text-sm font-semibold">
                      {formatMoney(item.basePrice * item.quantity)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-navy-border space-y-4 shrink-0">
            <div className="flex justify-between items-center">
              <span className="text-muted text-sm">Total Bill</span>
              <span className="text-fg text-lg font-bold">{formatMoney(total)}</span>
            </div>

            <CounterPaymentForm
              amountDue={total}
              paymentMethod={paymentMethod}
              cashReceived={cashReceived}
              onPaymentMethodChange={setPaymentMethod}
              onCashReceivedChange={setCashReceived}
            />

            <button
              type="button"
              onClick={placeOrder}
              disabled={!canCheckout}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
            >
              {placing ? 'Placing Order…' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>

      {successOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="card max-w-sm w-full p-6 text-center">
            <CheckCircle2 size={40} className="text-green-400 mx-auto mb-3" />
            <h3 className="text-fg text-lg font-bold mb-1">Order Placed</h3>
            <p className="text-muted text-sm mb-1">Order #{successOrder.orderNumber}</p>
            <p className="text-brand font-semibold mb-5">{formatMoney(successOrder.total)}</p>
            <button
              type="button"
              onClick={() => setSuccessOrder(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              New Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
