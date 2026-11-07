'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, CheckCircle2, Circle, Heart } from 'lucide-react';
import AddToCupIcon from '@/components/cart/AddToCupIcon';
import { useCartStore, calcUnitPrice } from '@/store/cartStore';
import type { Product, Topping } from '@/types';
import ProductRadialImage from '@/components/menu/ProductRadialImage';
import toast from 'react-hot-toast';
import { isProductInStock, isProductComingSoon, isProductLowStock, getProductOrderableQty, getRemainingOrderQty } from '@/lib/productAvailability';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import { useWishlistIds, useWishlistToggle } from '@/hooks/useWishlist';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';

interface Props {
  product: Product;
  fulfillmentStore?: { id: string; name: string; distanceKm?: number } | null;
  onClose: () => void;
}

export default function ProductDrawer({ product, fulfillmentStore, onClose }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<Topping[]>([]);
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const branchOrdering = useBranchOrderingHours();
  const { data: wishlistIds = [] } = useWishlistIds();
  const { toggle: toggleWishlist } = useWishlistToggle();
  const isWishlisted = wishlistIds.includes(product.id);
  const orderingClosed = branchOrdering.hasBranch && !branchOrdering.isOpen;

  const orderableQty = getProductOrderableQty(product);
  const remainingQty = getRemainingOrderQty(product, cartItems);
  const maxPickerQty = remainingQty === Number.MAX_SAFE_INTEGER ? 99 : remainingQty;

  useEffect(() => {
    if (maxPickerQty <= 0) {
      setQuantity(1);
      return;
    }
    setQuantity((q) => Math.min(Math.max(1, q), maxPickerQty));
  }, [maxPickerQty, product.id]);

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

  const inStock = isProductInStock(product);
  const comingSoon = isProductComingSoon(product);
  const lowStock = isProductLowStock(product);

  useEffect(() => {
    document.documentElement.setAttribute('data-product-sheet-open', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.removeAttribute('data-product-sheet-open');
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function addToCart() {
    if (orderingClosed) {
      toast.error('Online ordering is closed. Save this item to your wishlist instead.');
      return;
    }
    if (!inStock) {
      toast.error(comingSoon ? 'This item is coming soon at your branch.' : 'This item is out of stock at your branch.');
      return;
    }
    const cartState = useCartStore.getState();
    if (!hasCompletedOrderSetup(cartState)) {
      onClose();
      openOrderModal();
      return;
    }
    const result = addItem({
      product,
      size: 'REGULAR',
      toppings: selectedToppings,
      quantity,
      unitPrice,
      fulfillmentStore: fulfillmentStore
        ? {
            id: fulfillmentStore.id,
            name: fulfillmentStore.name,
            distanceKm: fulfillmentStore.distanceKm,
          }
        : undefined,
    });
    if (!result.ok) {
      if (result.reason === 'ordering_closed') {
        toast.error('Online ordering is closed. Save this item to your wishlist instead.');
        return;
      }
      toast.error(
        orderableQty === Number.MAX_SAFE_INTEGER
          ? 'Unable to add this item to your cup.'
          : 'Not enough stock at your branch for that quantity.',
      );
      return;
    }
    if (result.clamped) {
      toast.error('Quantity adjusted to match stock at your branch.');
    }
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="product-sheet-backdrop fixed inset-0 z-[1000] flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="product-sheet w-full max-w-lg flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-cart-title"
      >
        <div className="product-sheet__handle-wrap" aria-hidden>
          <span className="product-sheet__handle" />
        </div>

        <div className="product-sheet__scroll flex-1 overflow-y-auto px-5 pt-2 pb-4">
          <div className="flex items-start gap-3.5">
            <ProductRadialImage
              imageUrl={product.imageUrl}
              alt={product.name}
              className="product-sheet__thumb shrink-0"
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="add-to-cart-title" className="text-lg font-bold text-fg leading-snug">
                {product.name}
              </h2>
              <p className="text-brand font-semibold text-sm mt-1.5">
                From LKR {product.basePrice.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-navy-light transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="product-sheet__breakdown mt-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Base price</span>
              <span className="text-fg">LKR {product.basePrice.toLocaleString()}</span>
            </div>
            {toppingsExtra > 0 && (
              <div className="flex justify-between text-sm mt-1.5">
                <span className="text-muted">Toppings</span>
                <span className="text-fg">LKR {toppingsExtra.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-navy-border mt-3 pt-3 flex flex-col gap-2.5">
              <div className="min-w-0">
                <span className="font-bold text-fg block">Total</span>
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="product-sheet__qty flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="product-sheet__qty-btn"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-base font-bold text-fg w-7 text-center tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxPickerQty, q + 1))}
                    disabled={quantity >= maxPickerQty}
                    className="product-sheet__qty-btn disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Increase quantity"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <span className="font-bold text-brand text-base sm:text-lg tabular-nums whitespace-nowrap shrink-0 text-right">
                  LKR {totalPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {orderingClosed && (
            <OnlineOrderingClosedBanner
              className="mt-4"
              message={branchOrdering.closedMessage}
            />
          )}

          {availableToppings.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-bold text-fg mb-2">Toppings</p>
              <div className="space-y-2">
                {availableToppings.map((topping) => {
                  const checked = selectedToppings.some((t) => t.id === topping.id);
                  return (
                    <button
                      key={topping.id}
                      type="button"
                      onClick={() => toggleTopping(topping)}
                      className={`product-sheet__topping w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                        checked ? 'product-sheet__topping--checked' : ''
                      }`}
                    >
                      {checked ? (
                        <CheckCircle2 size={22} className="text-brand shrink-0 mt-0.5" />
                      ) : (
                        <Circle size={22} className="text-muted shrink-0 mt-0.5" />
                      )}
                      <span className={`text-sm flex-1 ${checked ? 'font-semibold text-fg' : 'text-fg'}`}>
                        {topping.name}
                      </span>
                      <span className={`text-xs font-semibold shrink-0 ${checked ? 'text-brand' : 'text-muted'}`}>
                        + LKR {topping.extraPrice}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="product-sheet__bar shrink-0 px-5 py-3 space-y-2">
          {inStock && lowStock && (
            <p className="text-xs font-semibold text-amber-500 text-center">Low stock at your branch</p>
          )}
          {orderingClosed ? (
            <button
              type="button"
              onClick={() => {
                toggleWishlist(product.id, isWishlisted);
                toast.success(isWishlisted ? 'Removed from wishlist' : 'Saved to wishlist');
              }}
              className="btn-primary w-full py-3.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Heart size={16} fill={isWishlisted ? 'currentColor' : 'none'} />
              {isWishlisted ? 'Saved to wishlist' : 'Save to wishlist'}
            </button>
          ) : (
          <motion.button
            whileTap={inStock ? { scale: 0.98 } : undefined}
            type="button"
            onClick={addToCart}
            disabled={!inStock || maxPickerQty <= 0}
            className="btn-primary w-full py-3.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {inStock && maxPickerQty > 0 ? (
              <>
                <AddToCupIcon inverted className="add-to-cup-icon--btn" />
                Add · LKR {totalPrice.toLocaleString()}
              </>
            ) : (
              'Out of Stock'
            )}
          </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
