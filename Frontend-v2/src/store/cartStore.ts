import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Product, Topping } from '@/types';
import { notifyCartItemAdded, triggerLoyaltyPointsFloat } from '@/lib/cartCelebration';
import { cartPersistStorage, persistClearedCartItems } from '@/lib/cartPersistStorage';
import {
  getCartProductQty,
  getMaxLineQty,
  getProductOrderableQty,
} from '@/lib/productAvailability';
import { getBranchOrderingOpenFromCart } from '@/hooks/useBranchOrderingHours';
import type { IceLevel, SugarLevel } from '@/lib/drinkOptions';

export type ProductSize = 'REGULAR' | 'LARGE';
export type OrderMode = 'DELIVERY' | 'TAKEAWAY';

export interface LocalCartItem {
  id: string;
  product: Product;
  size: ProductSize;
  toppings: Topping[];
  quantity: number;
  unitPrice: number;
  fulfillmentStore?: { id: string; name: string; distanceKm?: number };
  iceLevel?: IceLevel | null;
  sugarLevel?: SugarLevel | null;
}

export interface AddItemResult {
  ok: boolean;
  clamped: boolean;
  maxQty: number;
  reason?: 'ordering_closed' | 'stock';
}

export interface DeliveryInfo {
  storeId: string;
  storeName: string;
  zoneId: string;
  fee: number;
  minOrder: number;
  estimatedMinutes: number;
  address: string;
  lat?: number;
  lng?: number;
  openTime: string;
  closeTime: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
  branchClosedAt?: string | null;
}

export interface TakeawayInfo {
  storeId: string;
  storeName: string;
  openTime: string;
  closeTime: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
  branchClosedAt?: string | null;
}

import type { SchedulePickerMode } from '@/lib/orderSchedule';

interface CartState {
  items: LocalCartItem[];
  orderMode: OrderMode | null;
  deliveryInfo: DeliveryInfo | null;
  takeawayInfo: TakeawayInfo | null;
  scheduledAt: string | null;
  scheduleMode: SchedulePickerMode | null;
  reservationUuid: string | null;
  reservationExpiresAt: string | null;

  setOrderMode: (mode: OrderMode) => void;
  setDeliveryInfo: (info: DeliveryInfo) => void;
  setTakeawayInfo: (info: TakeawayInfo) => void;
  setScheduledAt: (iso: string | null) => void;
  setScheduleMode: (mode: SchedulePickerMode | null) => void;
  setReservation: (reservationUuid: string | null, reservationExpiresAt?: string | null) => void;
  clearReservation: () => void;
  addItem: (item: Omit<LocalCartItem, 'id'>, options?: { quiet?: boolean }) => AddItemResult;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, qty: number) => AddItemResult;
  clearCart: () => void;
  clearMode: () => void;
  completeOrder: () => void;

  subtotal: () => number;
  itemCount: () => number;
  getActiveStoreId: () => string | null;
  getActiveStoreName: () => string | null;
  getFulfillmentStoreId: () => string | null;
}

type ActiveStoreSlice = Pick<CartState, 'orderMode' | 'deliveryInfo' | 'takeawayInfo'>;

/** Zustand selector — reads primitive store fields so branch switches trigger re-renders. */
export function selectActiveStoreId(s: ActiveStoreSlice): string | null {
  if (s.orderMode === 'DELIVERY') return s.deliveryInfo?.storeId ?? null;
  if (s.orderMode === 'TAKEAWAY') return s.takeawayInfo?.storeId ?? null;
  return s.deliveryInfo?.storeId ?? s.takeawayInfo?.storeId ?? null;
}

export function selectActiveStoreName(s: ActiveStoreSlice): string | null {
  if (s.orderMode === 'DELIVERY') return s.deliveryInfo?.storeName ?? null;
  if (s.orderMode === 'TAKEAWAY') return s.takeawayInfo?.storeName ?? null;
  return s.deliveryInfo?.storeName ?? s.takeawayInfo?.storeName ?? null;
}

export function calcUnitPrice(product: Product, size: ProductSize, toppings: Topping[]): number {
  let price = product.basePrice;
  if (size === 'LARGE') price += 100;
  price += toppings.reduce((s, t) => s + t.extraPrice, 0);
  return price;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      orderMode: null,
      deliveryInfo: null,
      takeawayInfo: null,
      scheduledAt: null,
      scheduleMode: null,
      reservationUuid: null,
      reservationExpiresAt: null,

      setOrderMode: (mode) => set({ orderMode: mode }),
      setDeliveryInfo: (info) => set({ deliveryInfo: info, takeawayInfo: null }),
      setTakeawayInfo: (info) => set({ takeawayInfo: info, deliveryInfo: null }),
      setScheduledAt: (iso) => set({ scheduledAt: iso }),
      setScheduleMode: (mode) => set({ scheduleMode: mode }),
      setReservation: (reservationUuid, reservationExpiresAt = null) =>
        set({ reservationUuid, reservationExpiresAt: reservationExpiresAt ?? null }),
      clearReservation: () => set({ reservationUuid: null, reservationExpiresAt: null }),

      addItem: (item, options) => {
        const state = get();
        if (!getBranchOrderingOpenFromCart()) {
          return { ok: false, clamped: false, maxQty: 0, reason: 'ordering_closed' };
        }
        const orderableQty = getProductOrderableQty(item.product);
        const branchKey = item.fulfillmentStore?.id ?? 'primary';
        const id = `${item.product.id}-${item.size}-${item.toppings.map((t) => t.id).join(',')}-${branchKey}`;
        const existing = state.items.find((i) => i.id === id);
        const otherLinesQty = getCartProductQty(state.items, item.product.id, id);
        const maxTotalForProduct = orderableQty === Number.MAX_SAFE_INTEGER
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, orderableQty - otherLinesQty);

        if (maxTotalForProduct <= 0) {
          return { ok: false, clamped: true, maxQty: orderableQty, reason: 'stock' };
        }

        const requestedQty = existing ? existing.quantity + item.quantity : item.quantity;
        const newQty = Math.min(requestedQty, maxTotalForProduct);
        const clamped = newQty < requestedQty;

        if (newQty <= 0) {
          return { ok: false, clamped: true, maxQty: orderableQty, reason: 'stock' };
        }

        const countBefore = state.itemCount();
        const subtotalBefore = state.subtotal();

        set((prev) => {
          if (existing) {
            return {
              items: prev.items.map((i) =>
                i.id === id ? { ...i, quantity: newQty } : i,
              ),
              reservationUuid: null,
              reservationExpiresAt: null,
            };
          }
          return {
            items: [...prev.items, { ...item, id, quantity: newQty }],
            reservationUuid: null,
            reservationExpiresAt: null,
          };
        });

        const countAfter = get().itemCount();
        const subtotalAfter = get().subtotal();
        if (!options?.quiet) {
          notifyCartItemAdded(
            item.product.name,
            countBefore,
            countAfter,
            subtotalBefore,
            subtotalAfter,
          );
        }

        return { ok: true, clamped, maxQty: orderableQty };
      },

      removeItem: (id) => {
        const subtotalBefore = get().subtotal();
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
          reservationUuid: null,
          reservationExpiresAt: null,
        }));
        triggerLoyaltyPointsFloat('remove', subtotalBefore, get().subtotal());
      },

      updateQuantity: (id, qty) => {
        const state = get();
        if (!getBranchOrderingOpenFromCart()) {
          return { ok: false, clamped: false, maxQty: 0, reason: 'ordering_closed' };
        }
        const line = state.items.find((i) => i.id === id);
        if (!line) return { ok: false, clamped: false, maxQty: 0 };

        const orderableQty = getProductOrderableQty(line.product);
        const maxLineQty = getMaxLineQty(line.product, state.items, id);

        if (qty <= 0) {
          const subtotalBefore = state.subtotal();
          set((prev) => ({
            items: prev.items.filter((i) => i.id !== id),
            reservationUuid: null,
            reservationExpiresAt: null,
          }));
          triggerLoyaltyPointsFloat('remove', subtotalBefore, get().subtotal());
          return { ok: true, clamped: false, maxQty: orderableQty };
        }

        const newQty = maxLineQty === Number.MAX_SAFE_INTEGER ? qty : Math.min(qty, maxLineQty);
        const clamped = newQty < qty;

        if (newQty <= 0) {
          return { ok: false, clamped: true, maxQty: orderableQty };
        }

        const countBefore = state.itemCount();
        const subtotalBefore = state.subtotal();

        set((prev) => ({
          items: prev.items.map((i) => (i.id === id ? { ...i, quantity: newQty } : i)),
          reservationUuid: null,
          reservationExpiresAt: null,
        }));

        const countAfter = get().itemCount();
        const subtotalAfter = get().subtotal();
        if (countAfter > countBefore) {
          notifyCartItemAdded(
            line.product.name,
            countBefore,
            countAfter,
            subtotalBefore,
            subtotalAfter,
          );
        } else if (countAfter < countBefore) {
          triggerLoyaltyPointsFloat('remove', subtotalBefore, subtotalAfter);
        }

        return { ok: true, clamped, maxQty: orderableQty };
      },

      clearCart: () => set({ items: [], reservationUuid: null, reservationExpiresAt: null }),
      clearMode: () =>
        set({ orderMode: null, deliveryInfo: null, takeawayInfo: null, scheduledAt: null, scheduleMode: null }),
      completeOrder: () => {
        const { orderMode, deliveryInfo, takeawayInfo, scheduledAt } = get();
        set({ items: [], reservationUuid: null, reservationExpiresAt: null });
        persistClearedCartItems({
          orderMode,
          deliveryInfo,
          takeawayInfo,
          scheduledAt,
          reservationUuid: null,
          reservationExpiresAt: null,
        });
      },

      subtotal: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      getActiveStoreId: () => selectActiveStoreId(get()),

      getActiveStoreName: () => selectActiveStoreName(get()),

      getFulfillmentStoreId: () => {
        const { orderMode, deliveryInfo, takeawayInfo, items } = get();
        const fulfillmentIds = [
          ...new Set(
            items.map((i) => i.fulfillmentStore?.id).filter((id): id is string => Boolean(id)),
          ),
        ];
        if (fulfillmentIds.length === 1) return fulfillmentIds[0];
        if (orderMode === 'DELIVERY') return deliveryInfo?.storeId ?? null;
        if (orderMode === 'TAKEAWAY') return takeawayInfo?.storeId ?? null;
        return deliveryInfo?.storeId ?? takeawayInfo?.storeId ?? null;
      },
    }),
    {
      name: 'bc-cart',
      storage: createJSONStorage(() => cartPersistStorage),
      partialize: (state) => ({
        items: state.items,
        orderMode: state.orderMode,
        deliveryInfo: state.deliveryInfo,
        takeawayInfo: state.takeawayInfo,
        scheduledAt: state.scheduledAt,
        scheduleMode: state.scheduleMode,
        reservationUuid: state.reservationUuid,
        reservationExpiresAt: state.reservationExpiresAt,
      }),
    }
  )
);
