import { api } from '@/lib/api';
import { clearGuestCartStorage, setCartStorageUser } from '@/lib/cartPersistStorage';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { useCartStore, type LocalCartItem } from '@/store/cartStore';
import type { Product, Topping } from '@/types';

let cartStorageReady = false;
const cartStorageReadyListeners = new Set<() => void>();

export function isCartStorageReady(): boolean {
  return cartStorageReady;
}

export function onCartStorageReady(listener: () => void): () => void {
  if (cartStorageReady) {
    listener();
    return () => {};
  }
  cartStorageReadyListeners.add(listener);
  return () => cartStorageReadyListeners.delete(listener);
}

function markCartStorageReady() {
  if (cartStorageReady) return;
  cartStorageReady = true;
  cartStorageReadyListeners.forEach((listener) => listener());
  cartStorageReadyListeners.clear();
}

type CartSnapshot = Pick<
  ReturnType<typeof useCartStore.getState>,
  'items' | 'orderMode' | 'deliveryInfo' | 'takeawayInfo' | 'scheduledAt'
>;

interface ServerCartItem {
  id: string;
  productId: string;
  product: { id: string; name: string; imageUrl?: string; basePrice: number };
  size: 'REGULAR' | 'LARGE';
  quantity: number;
  unitPrice: number;
  toppings: { topping: Topping }[];
}

function captureCartSnapshot(): CartSnapshot {
  const { items, orderMode, deliveryInfo, takeawayInfo, scheduledAt } = useCartStore.getState();
  return {
    items: [...items],
    orderMode,
    deliveryInfo: deliveryInfo ? { ...deliveryInfo } : null,
    takeawayInfo: takeawayInfo ? { ...takeawayInfo } : null,
    scheduledAt,
  };
}

function orderSetupFromSnapshot(snapshot: CartSnapshot) {
  return {
    orderMode: snapshot.orderMode,
    deliveryInfo: snapshot.deliveryInfo,
    takeawayInfo: snapshot.takeawayInfo,
    scheduledAt: snapshot.scheduledAt,
  };
}

function readGuestOrderSetup(): ReturnType<typeof orderSetupFromSnapshot> | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('bc-cart-guest');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { state?: CartSnapshot };
    const state = parsed.state;
    if (!state || !hasCompletedOrderSetup(state)) return null;
    return orderSetupFromSnapshot(state);
  } catch {
    return null;
  }
}

async function waitForCartPersistHydration() {
  const persistApi = useCartStore.persist;
  if (!persistApi || persistApi.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    persistApi.onFinishHydration(() => resolve());
  });
}

function restoreOrderSetupIfMissing(before: CartSnapshot, userId: string | null) {
  const current = useCartStore.getState();
  if (hasCompletedOrderSetup(current)) return;

  if (hasCompletedOrderSetup(before)) {
    useCartStore.setState(orderSetupFromSnapshot(before));
    return;
  }

  if (userId) {
    const guestSetup = readGuestOrderSetup();
    if (guestSetup) {
      useCartStore.setState(guestSetup);
    }
  }
}

function mapServerCartItem(item: ServerCartItem): LocalCartItem {
  const toppings = item.toppings.map((row) => row.topping);
  const branchKey = 'primary';
  const id = `${item.productId}-${item.size}-${toppings.map((t) => t.id).join(',')}-${branchKey}`;
  const product: Product = {
    id: item.product.id,
    categoryId: '',
    name: item.product.name,
    slug: '',
    basePrice: item.product.basePrice,
    imageUrl: item.product.imageUrl,
    isAvailable: true,
    category: { id: '', name: '', slug: '' },
    toppings: [],
  };
  return {
    id,
    product,
    size: item.size,
    toppings,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  };
}

async function fetchServerCartIntoStore() {
  try {
    const data = await api.get<{ items?: ServerCartItem[] }>('/cart', true);
    const items = (data.items ?? []).map(mapServerCartItem);
    if (items.length === 0) return;
    useCartStore.setState({ items });
  } catch {
    /* guest or offline — keep local cart */
  }
}

export interface CartLoginOptions {
  /** Keep the cart currently in checkout instead of loading a saved account cart. */
  keepCurrentCart?: boolean;
}

export async function clearServerCart() {
  try {
    await api.delete('/cart', true);
  } catch {
    /* ignore */
  }
}

export async function handleCartOnLogin(userId: string, options?: CartLoginOptions) {
  const guestSnapshot = captureCartSnapshot();

  setCartStorageUser(userId);

  if (options?.keepCurrentCart) {
    useCartStore.setState(guestSnapshot);
    clearGuestCartStorage();
    await clearServerCart();
    return;
  }

  await useCartStore.persist.rehydrate();
  restoreOrderSetupIfMissing(guestSnapshot, userId);

  const state = useCartStore.getState();
  if (state.items.length === 0 && guestSnapshot.items.length > 0) {
    useCartStore.setState(guestSnapshot);
  } else if (state.items.length === 0) {
    await fetchServerCartIntoStore();
  }

  clearGuestCartStorage();
}

export function handleCartOnLogout() {
  setCartStorageUser(null);
  useCartStore.setState({
    items: [],
    orderMode: null,
    deliveryInfo: null,
    takeawayInfo: null,
    scheduledAt: null,
    reservationUuid: null,
    reservationExpiresAt: null,
  });
  clearGuestCartStorage();
}

export async function syncCartStorageWithAuth(userId: string | null) {
  await waitForCartPersistHydration();
  const snapshotBefore = captureCartSnapshot();

  setCartStorageUser(userId);
  await useCartStore.persist.rehydrate();
  restoreOrderSetupIfMissing(snapshotBefore, userId);

  markCartStorageReady();
}
