'use client';

import { getApiBaseUrl } from '@/lib/apiBase';
import { isBranchAdmin, isBranchScoped, isCashier, isDeliveryAdmin, type AdminSession } from '@/lib/adminAuth';
import { adminApiFetch } from '@/lib/adminApi';
import { hasMenuReadAccess, hasMenuUpdateAccess, type AdminPermission } from '@/lib/adminPermissions';
import { displayRideId, formatBranchName } from '@/lib/deliveryDisplay';
import {
  playBranchNewOrderSound,
  primeBranchOrderAudio,
  startBranchNewOrderAlertLoop,
  startBranchStockAlertLoop,
  startVehicleFailureAlertLoop,
  stopBranchNewOrderAlertLoop,
  stopBranchStockAlertLoop,
  stopVehicleFailureAlertLoop,
} from '@/lib/uiSounds';
import { dispatchAdminNewOrder } from '@/lib/adminOrderSync';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  Package,
  ShoppingBag,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import type { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { adminAuthHeaders } from '@/lib/adminSession';
import { createAdminSocket, fetchAdminSocketToken } from '@/lib/adminSocket';
import { openMainAdminPage } from '@/lib/mainAdminUrl';

export interface AdminNotificationPayload {
  id?: string;
  type: string;
  title: string;
  message: string;
  orderId?: string | null;
  productId?: string | null;
  orderNumber?: string;
  orderMode?: string;
  customerName?: string;
  itemCount?: number;
  total?: number;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  queuePosition?: number | null;
  pickupTime?: string | null;
  scheduledPickupAt?: string | null;
  storeName?: string;
  storeId?: string;
  productName?: string;
  imageUrl?: string | null;
  items?: Array<{ productName: string; quantity: number; imageUrl?: string | null }>;
  read?: boolean;
  createdAt?: string;
}

export interface NewOrderAlert {
  key: string;
  orderId?: string | null;
  orderNumber: string;
  orderMode?: string;
  customerName: string;
  itemCount: number;
  total: number;
  title: string;
  message: string;
  notificationId?: string;
  items: Array<{ productName: string; quantity: number; imageUrl?: string | null }>;
  queuePosition?: number | null;
}

export interface NewProductAlert {
  key: string;
  productId: string;
  productName: string;
  imageUrl?: string | null;
  title: string;
  message: string;
  notificationId?: string;
  storeId?: string;
}

export interface StockAlert {
  key: string;
  kind: 'low' | 'out';
  productId: string;
  productName: string;
  imageUrl?: string | null;
  storeId: string;
  storeName: string;
  onlineAvailableQty: number;
  onHandQty?: number;
}

type StockAlertPayload = {
  storeId: string;
  productId: string;
  productName: string;
  imageUrl?: string | null;
  storeName: string;
  onlineAvailableQty?: number;
  weeklyRemainingQty?: number;
  onHandQty?: number;
};

type StockSocketQtyPayload = {
  storeId: string;
  productId: string;
  weeklyRemainingQty?: number;
  weeklyBaseQty?: number;
  onHandQty?: number;
  onlineAvailableQty?: number;
  batchCount?: number;
  isAvailable?: boolean;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
  stockPercent?: number;
};

type AdminStockQueryData = {
  store: { id: string };
  items: Array<{
    productId: string;
    weeklyRemainingQty?: number;
    weeklyBaseQty?: number;
    onHandQty?: number;
    onlineAvailableQty?: number;
    batchCount?: number;
    isAvailable?: boolean;
    isLowStock?: boolean;
    isOutOfStock?: boolean;
    stockPercent?: number;
    isNewProduct?: boolean;
    isComingSoon?: boolean;
  }>;
};

function resolveSocketOnHand(payload: StockSocketQtyPayload): number | undefined {
  const raw = payload.onHandQty ?? payload.weeklyRemainingQty;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/** Apply live stock qty/status into the branch admin stock table cache. */
function patchAdminStockQueryCache(
  qc: ReturnType<typeof useQueryClient>,
  payload: StockSocketQtyPayload,
) {
  const onHand = resolveSocketOnHand(payload);

  qc.setQueriesData<AdminStockQueryData>({ queryKey: ['admin-stock'] }, (old) => {
    if (!old || old.store.id !== payload.storeId) return old;
    return {
      ...old,
      items: old.items.map((item) => {
        if (item.productId !== payload.productId) return item;
        return {
          ...item,
          ...(payload.weeklyBaseQty != null ? { weeklyBaseQty: payload.weeklyBaseQty } : {}),
          ...(onHand != null
            ? { weeklyRemainingQty: onHand, onHandQty: onHand }
            : {}),
          ...(payload.onlineAvailableQty != null
            ? { onlineAvailableQty: payload.onlineAvailableQty }
            : {}),
          ...(payload.batchCount != null ? { batchCount: payload.batchCount } : {}),
          ...(payload.isAvailable != null ? { isAvailable: payload.isAvailable } : {}),
          ...(payload.isLowStock != null ? { isLowStock: payload.isLowStock } : {}),
          ...(payload.isOutOfStock != null ? { isOutOfStock: payload.isOutOfStock } : {}),
          ...(payload.stockPercent != null ? { stockPercent: payload.stockPercent } : {}),
          ...(onHand != null || payload.isOutOfStock === true || payload.isLowStock === true
            ? { isNewProduct: false, isComingSoon: false }
            : {}),
        };
      }),
    };
  });
}

export type OrderFocusTarget = {
  orderNumber: string;
  orderId?: string | null;
  orderMode?: string;
};

type BellHandlers = {
  onNotification: (payload: AdminNotificationPayload) => void;
  onReload: () => void;
};

type OrderFocusHandler = (order: OrderFocusTarget) => void;

export type VehicleFailureAlert = {
  key: string;
  jobId: string;
  rideCode?: string | null;
  storeName?: string | null;
};

type VehicleFailureEvent = {
  jobId: string;
  driverId: string;
  orderId: string;
  lat: number;
  lng: number;
  storeId?: string;
  rideCode?: string | null;
  storeName?: string | null;
};

type AdminNotificationContextValue = {
  registerBell: (handlers: BellHandlers) => () => void;
  registerOrderFocusHandler: (handler: OrderFocusHandler) => () => void;
  vehicleFailureCount: number;
};

const AdminNotificationContext = createContext<AdminNotificationContextValue | null>(null);

const MAX_VISIBLE_TOASTS = 5;

function adminFetch(endpoint: string, options?: RequestInit) {
  return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...adminAuthHeaders({ 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return data;
  });
}

function orderAlertKey(payload: { orderId?: string | null; orderNumber?: string }): string | null {
  if (payload.orderId) return payload.orderId;
  if (payload.orderNumber) return payload.orderNumber;
  return null;
}

function parseOrderNumberFromMessage(message: string): string | undefined {
  const match = message.match(/placed order ([^\s·]+)/);
  return match?.[1]?.trim();
}

function parseOrderModeFromTitle(title: string): string | undefined {
  if (/delivery/i.test(title)) return 'DELIVERY';
  if (/takeaway|pickup/i.test(title)) return 'TAKEAWAY';
  return undefined;
}

function parseNewOrderMessage(message: string): {
  customerName?: string;
  itemCount?: number;
  total?: number;
} {
  const match = message.match(/^(.+?) placed order .+? · (\d+) item\(s\) · LKR ([\d,]+)/);
  if (!match) return {};
  return {
    customerName: match[1].trim(),
    itemCount: Number(match[2]),
    total: Number(match[3].replace(/,/g, '')),
  };
}

function apiNotificationToOrderPayload(notification: {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId?: string | null;
  read?: boolean;
  createdAt: string;
}): AdminNotificationPayload {
  const orderNumber = parseOrderNumberFromMessage(notification.message);
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    orderId: notification.orderId,
    orderNumber,
    orderMode: parseOrderModeFromTitle(notification.title),
    read: notification.read,
    createdAt: notification.createdAt,
  };
}

function toNewOrderAlert(payload: AdminNotificationPayload): NewOrderAlert | null {
  const key = orderAlertKey(payload);
  const orderNumber =
    payload.orderNumber?.trim() || parseOrderNumberFromMessage(payload.message || '');
  if (!key || !orderNumber) return null;

  const parsed = parseNewOrderMessage(payload.message || '');
  const customerName = payload.customerName?.trim() || parsed.customerName || 'Customer';
  const itemCount = payload.itemCount ?? parsed.itemCount ?? 0;
  const total = payload.total ?? parsed.total ?? 0;

  return {
    key,
    orderId: payload.orderId,
    orderNumber,
    orderMode: payload.orderMode ?? parseOrderModeFromTitle(payload.title || ''),
    customerName,
    itemCount,
    total,
    title: payload.title || `New order ${orderNumber}`,
    message: payload.message || '',
    notificationId: payload.id,
    items: payload.items ?? [],
    queuePosition: payload.queuePosition ?? null,
  };
}

function toNewProductAlert(payload: AdminNotificationPayload): NewProductAlert | null {
  const productId = payload.productId?.trim();
  if (!productId || payload.type !== 'NEW_PRODUCT') return null;

  const quoted = payload.message?.match(/"([^"]+)"/);
  const productName = payload.productName?.trim() || quoted?.[1] || 'New product';

  return {
    key: productId,
    productId,
    productName,
    imageUrl: payload.imageUrl ?? null,
    title: payload.title || 'New product added',
    message: payload.message || '',
    notificationId: payload.id,
    storeId: payload.storeId,
  };
}

function toStockAlert(payload: StockAlertPayload, kind: 'low' | 'out'): StockAlert | null {
  if (!payload.productId || !payload.storeId) return null;
  return {
    key: `${payload.productId}-${kind}`,
    kind,
    productId: payload.productId,
    productName: payload.productName,
    imageUrl: payload.imageUrl ?? null,
    storeId: payload.storeId,
    storeName: payload.storeName,
    onlineAvailableQty: payload.onlineAvailableQty ?? 0,
    onHandQty: payload.onHandQty ?? payload.weeklyRemainingQty,
  };
}

function orderModeBadgeLabel(orderMode?: string): string {
  if (orderMode === 'DELIVERY') return 'New delivery order';
  return 'New pickup order';
}

function formatOrderTotal(total: number): string {
  return `LKR ${total.toLocaleString()}`;
}

export function useAdminNotificationContext(): AdminNotificationContextValue {
  const ctx = useContext(AdminNotificationContext);
  if (!ctx) {
    throw new Error('useAdminNotificationContext must be used within AdminNotificationProvider');
  }
  return ctx;
}

const MAX_TOAST_THUMBNAILS = 3;

function BranchNewOrderToast({
  alert,
  onFocus,
  onDismiss,
}: {
  alert: NewOrderAlert;
  onFocus: () => void;
  onDismiss: () => void;
}) {
  const modeLabel = orderModeBadgeLabel(alert.orderMode);
  const visibleItems = alert.items.slice(0, MAX_TOAST_THUMBNAILS);
  const hiddenCount = Math.max(0, alert.items.length - MAX_TOAST_THUMBNAILS);
  const totalQty =
    alert.items.length > 0
      ? alert.items.reduce((sum, item) => sum + item.quantity, 0)
      : alert.itemCount;
  const itemsLabel = `${totalQty} item${totalQty === 1 ? '' : 's'}`;

  return (
    <div className="branch-order-toast" role="status">
      <div className="branch-order-toast__top">
        <div className="branch-order-toast__title-row">
          <h3 className="branch-order-toast__title">New order received!</h3>
          <span className="branch-order-toast__type-badge">
            <ShoppingBag size={12} strokeWidth={2.5} aria-hidden />
            {modeLabel}
          </span>
        </div>

        <div className="branch-order-toast__top-actions">
          {alert.queuePosition != null && alert.orderMode !== 'DELIVERY' && (
            <div className="branch-order-toast__token-wrap">
              <span className="branch-order-toast__token-label">Token number</span>
              <span className="pickup-token-badge branch-order-toast__token" title="Pickup queue token">
                {alert.queuePosition}
              </span>
            </div>
          )}
          <button
            type="button"
            className="branch-order-toast__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss notification"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="branch-order-toast__main">
        <div className="branch-order-toast__order-card">
          {visibleItems.length > 0 && (
            <div className="admin-order-items-compact__thumbs" aria-hidden>
              {visibleItems.map((item, index) => (
                <ProductImage
                  key={`${item.productName}-${index}`}
                  name={item.productName}
                  imageUrl={item.imageUrl}
                  contain
                  className="admin-order-items-compact__thumb"
                />
              ))}
              {hiddenCount > 0 && (
                <span className="admin-order-items-compact__more">+{hiddenCount}</span>
              )}
            </div>
          )}
          <div className="branch-order-toast__order-meta min-w-0">
            <p className="branch-order-toast__customer">{alert.customerName}</p>
            <p className="branch-order-toast__meta">
              <span className="branch-order-toast__meta-items">
                <Package size={13} strokeWidth={2} aria-hidden />
                {itemsLabel}
              </span>
              <span className="branch-order-toast__meta-divider" aria-hidden />
              <span className="branch-order-toast__meta-price">{formatOrderTotal(alert.total)}</span>
            </p>
          </div>
        </div>

        <div className="branch-order-toast__mascot-wrap" aria-hidden>
          <span className="branch-order-toast__mascot-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mascot-hero.avif"
            alt=""
            className="branch-order-toast__mascot"
          />
        </div>
      </div>

      <div className="branch-order-toast__footer">
        <button
          type="button"
          className="branch-order-toast__action"
          onClick={onFocus}
          aria-label={`View order for ${alert.customerName}`}
        >
          <ShoppingBag size={16} strokeWidth={2.25} aria-hidden />
          View Order
          <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BranchNewProductToast({
  alert,
  onFocus,
  onDismiss,
}: {
  alert: NewProductAlert;
  onFocus: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="branch-order-toast branch-product-toast" role="status">
      <div className="branch-order-toast__top">
        <div className="branch-order-toast__title-row">
          <h3 className="branch-order-toast__title">New product added!</h3>
          <span className="branch-order-toast__type-badge branch-product-toast__type-badge">
            <Sparkles size={12} strokeWidth={2.5} aria-hidden />
            Branch Stock
          </span>
        </div>

        <div className="branch-order-toast__top-actions">
          <button
            type="button"
            className="branch-order-toast__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss notification"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="branch-order-toast__main">
        <div className="branch-order-toast__order-card">
          <ProductImage
            name={alert.productName}
            imageUrl={alert.imageUrl}
            contain
            className="admin-order-items-compact__thumb branch-product-toast__thumb"
          />
          <div className="branch-order-toast__order-meta min-w-0">
            <p className="branch-order-toast__customer">{alert.productName}</p>
            <p className="branch-order-toast__meta branch-product-toast__meta">
              Set weekly base qty in Branch Stock to make this item available to customers.
            </p>
          </div>
        </div>

        <div className="branch-order-toast__mascot-wrap" aria-hidden>
          <span className="branch-order-toast__mascot-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mascot-hero.avif"
            alt=""
            className="branch-order-toast__mascot"
          />
        </div>
      </div>

      <div className="branch-order-toast__footer">
        <button
          type="button"
          className="branch-order-toast__action"
          onClick={onFocus}
          aria-label={`Open Branch Stock for ${alert.productName}`}
        >
          <Package size={16} strokeWidth={2.25} aria-hidden />
          View Branch Stock
          <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BranchStockAlertToast({
  alert,
  onFocus,
  onDismiss,
  restockBusy,
}: {
  alert: StockAlert;
  onFocus: () => void;
  onDismiss: () => void;
  restockBusy: boolean;
}) {
  const isOut = alert.kind === 'out';
  const storeLabel = alert.storeName.replace('Bing Chun - ', '');

  return (
    <div
      className={`branch-order-toast branch-stock-toast ${isOut ? 'branch-stock-toast--out' : 'branch-stock-toast--low'}`}
      role="alert"
    >
      <div className="branch-order-toast__top">
        <div className="branch-order-toast__title-row">
          <h3 className="branch-order-toast__title">
            {isOut ? 'Out of stock!' : 'Low stock warning'}
          </h3>
          <span
            className={`branch-order-toast__type-badge branch-stock-toast__type-badge ${
              isOut ? 'branch-stock-toast__type-badge--out' : 'branch-stock-toast__type-badge--low'
            }`}
          >
            {isOut ? (
              <XCircle size={12} strokeWidth={2.5} aria-hidden />
            ) : (
              <AlertTriangle size={12} strokeWidth={2.5} aria-hidden />
            )}
            {isOut ? 'Out of Stock' : 'Low Stock'}
          </span>
        </div>

        <div className="branch-order-toast__top-actions">
          <button
            type="button"
            className="branch-order-toast__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss stock alert"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="branch-order-toast__main">
        <div className="branch-order-toast__order-card">
          <ProductImage
            name={alert.productName}
            imageUrl={alert.imageUrl}
            contain
            className="admin-order-items-compact__thumb branch-product-toast__thumb"
          />
          <div className="branch-order-toast__order-meta min-w-0">
            <p className="branch-order-toast__customer">{alert.productName}</p>
            <p className="branch-order-toast__meta branch-product-toast__meta">
              {isOut
                ? (alert.onHandQty ?? 0) > 0
                  ? `No units left for online orders at ${storeLabel} (${alert.onHandQty} on hand). Restock to reopen online sales.`
                  : `No longer available online at ${storeLabel}. Restock now to avoid missed orders.`
                : `Only ${alert.onlineAvailableQty ?? 0} available online (${alert.onHandQty ?? '—'} on hand) at ${storeLabel}. Consider restocking soon.`}
            </p>
          </div>
        </div>

        <div className="branch-order-toast__mascot-wrap" aria-hidden>
          <span className="branch-order-toast__mascot-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mascot-hero.avif" alt="" className="branch-order-toast__mascot" />
        </div>
      </div>

      <div className="branch-order-toast__footer">
        <button
          type="button"
          className={`branch-order-toast__action ${isOut ? 'branch-stock-toast__action--out' : 'branch-stock-toast__action--low'}`}
          onClick={onFocus}
          disabled={restockBusy}
          aria-label={`Restock ${alert.productName} to weekly target`}
        >
          {restockBusy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Package size={16} strokeWidth={2.25} aria-hidden />
          )}
          {restockBusy ? 'Restocking…' : 'Restock to Order Level'}
          {!restockBusy && <ChevronRight size={16} strokeWidth={2.25} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function VehicleFailureToast({
  alert,
  onFocus,
  onDismiss,
}: {
  alert: VehicleFailureAlert;
  onFocus: () => void;
  onDismiss: () => void;
}) {
  const rideLabel = displayRideId(alert.rideCode?.trim() || null, alert.jobId);
  const branch = alert.storeName ? formatBranchName(alert.storeName) : null;

  return (
    <div className="branch-order-toast branch-stock-toast branch-stock-toast--out" role="alert">
      <div className="branch-order-toast__top">
        <div className="branch-order-toast__title-row">
          <h3 className="branch-order-toast__title">Bike failure</h3>
          <span className="branch-order-toast__type-badge branch-stock-toast__type-badge branch-stock-toast__type-badge--out">
            <AlertTriangle size={12} strokeWidth={2.5} aria-hidden />
            Vehicle failure
          </span>
        </div>
        <div className="branch-order-toast__top-actions">
          <button
            type="button"
            className="branch-order-toast__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss bike failure alert"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="branch-order-toast__main">
        <div className="branch-order-toast__order-card">
          <div className="branch-order-toast__order-meta min-w-0">
            <p className="branch-order-toast__customer">A rider is stranded and needs a backup rider.</p>
            <p className="branch-order-toast__meta branch-product-toast__meta">
              Ride {rideLabel}
              {branch ? ` · ${branch}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="branch-order-toast__footer">
        <button
          type="button"
          className="branch-order-toast__action branch-stock-toast__action--out"
          onClick={onFocus}
          aria-label={`View failures for ride ${rideLabel}`}
        >
          <AlertTriangle size={16} strokeWidth={2.25} aria-hidden />
          View failures
          <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BranchAdminToastStack({
  orderToasts,
  productToasts,
  stockToasts,
  failureToasts,
  orderOverflowCount,
  productOverflowCount,
  stockOverflowCount,
  onFocusOrder,
  onDismissOrder,
  onFocusProduct,
  onDismissProduct,
  onFocusStock,
  onDismissStock,
  onFocusFailure,
  onDismissFailure,
  onShowMore,
  restockingStockKey,
}: {
  orderToasts: NewOrderAlert[];
  productToasts: NewProductAlert[];
  stockToasts: StockAlert[];
  failureToasts: VehicleFailureAlert[];
  orderOverflowCount: number;
  productOverflowCount: number;
  stockOverflowCount: number;
  onFocusOrder: (alert: NewOrderAlert) => void;
  onDismissOrder: (alert: NewOrderAlert) => void;
  onFocusProduct: (alert: NewProductAlert) => void;
  onDismissProduct: (alert: NewProductAlert) => void;
  onFocusStock: (alert: StockAlert) => void;
  onDismissStock: (alert: StockAlert) => void;
  onFocusFailure: (alert: VehicleFailureAlert) => void;
  onDismissFailure: (alert: VehicleFailureAlert) => void;
  onShowMore: () => void;
  restockingStockKey: string | null;
}) {
  if (
    orderToasts.length === 0 &&
    productToasts.length === 0 &&
    stockToasts.length === 0 &&
    failureToasts.length === 0
  ) {
    return null;
  }

  const overflowCount = orderOverflowCount + productOverflowCount + stockOverflowCount;

  return createPortal(
    <div className="branch-order-toast-stack" aria-live="polite" aria-label="Branch admin alerts">
      {stockToasts.map((alert) => (
        <BranchStockAlertToast
          key={`stock-${alert.key}`}
          alert={alert}
          onFocus={() => onFocusStock(alert)}
          onDismiss={() => onDismissStock(alert)}
          restockBusy={restockingStockKey === alert.key}
        />
      ))}
      {productToasts.map((alert) => (
        <BranchNewProductToast
          key={`product-${alert.key}`}
          alert={alert}
          onFocus={() => onFocusProduct(alert)}
          onDismiss={() => onDismissProduct(alert)}
        />
      ))}
      {failureToasts.map((alert) => (
        <VehicleFailureToast
          key={`failure-${alert.key}`}
          alert={alert}
          onFocus={() => onFocusFailure(alert)}
          onDismiss={() => onDismissFailure(alert)}
        />
      ))}
      {orderToasts.map((alert) => (
        <BranchNewOrderToast
          key={`order-${alert.key}`}
          alert={alert}
          onFocus={() => onFocusOrder(alert)}
          onDismiss={() => onDismissOrder(alert)}
        />
      ))}
      {overflowCount > 0 && (
        <button type="button" className="branch-order-toast__overflow" onClick={onShowMore}>
          +{overflowCount} more in notifications
        </button>
      )}
    </div>,
    document.body,
  );
}

function AdminNotificationProviderInner({
  adminUser,
  children,
}: {
  adminUser: AdminSession | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const bellHandlersRef = useRef(new Set<BellHandlers>());
  const orderFocusHandlerRef = useRef<OrderFocusHandler | null>(null);
  const seenOrderKeysRef = useRef(new Set<string>());
  const seenProductKeysRef = useRef(new Set<string>());
  const seenStockKeysRef = useRef(new Set<string>());
  const seenNotificationIdsRef = useRef(new Set<string>());

  const adminUserId = adminUser?.id;
  const adminStoreId = adminUser?.storeId ?? null;

  const [orderToasts, setOrderToasts] = useState<NewOrderAlert[]>([]);
  const [productToasts, setProductToasts] = useState<NewProductAlert[]>([]);
  const [stockToasts, setStockToasts] = useState<StockAlert[]>([]);
  const [restockingStockKey, setRestockingStockKey] = useState<string | null>(null);
  const [failureToasts, setFailureToasts] = useState<VehicleFailureAlert[]>([]);
  const deliveryAdminRef = useRef(isDeliveryAdmin(adminUser));
  deliveryAdminRef.current = isDeliveryAdmin(adminUser);

  const enableOrderAlerts = !!adminUser && isBranchScoped(adminUser) && !!adminUser.storeId;
  const enableProductAlerts = !!adminUser && isBranchAdmin(adminUser) && !!adminUser.storeId;
  const enableStockAlerts = !!adminUser && (isBranchScoped(adminUser) || adminUser.role === 'SYSTEM_ADMIN');

  const { data: permissionRows = [] } = useQuery<AdminPermission[]>({
    queryKey: ['admin-me-permissions', adminUser?.id, 'stock-alerts'],
    queryFn: () => adminApiFetch<AdminPermission[]>('/admin/me/permissions'),
    enabled: Boolean(adminUser && isCashier(adminUser) && adminUser.storeId),
    staleTime: 60_000,
  });

  const permissionsMap = useMemo(
    () =>
      Object.fromEntries(permissionRows.map((row) => [row.menu, row])) as Record<string, AdminPermission>,
    [permissionRows],
  );

  const cashierCanViewStockAlerts =
    !!adminUser && isCashier(adminUser) && hasMenuReadAccess(permissionsMap, 'STOCK');

  const enableStockToastAlerts =
    !!adminUser &&
    !!adminUser.storeId &&
    (isBranchAdmin(adminUser) || cashierCanViewStockAlerts);

  const canRestockFromStockAlert = useMemo(() => {
    if (!adminUser || !adminUser.storeId) return false;
    if (isBranchAdmin(adminUser)) return true;
    if (isCashier(adminUser)) return hasMenuUpdateAccess(permissionsMap, 'STOCK');
    return false;
  }, [adminUser, permissionsMap]);

  const showBranchToasts = enableOrderAlerts || enableProductAlerts || enableStockToastAlerts;

  const notifyBell = useCallback((payload: AdminNotificationPayload) => {
    bellHandlersRef.current.forEach((h) => h.onNotification(payload));
  }, []);

  const reloadBell = useCallback(() => {
    bellHandlersRef.current.forEach((h) => h.onReload());
  }, []);

  const registerBell = useCallback((handlers: BellHandlers) => {
    bellHandlersRef.current.add(handlers);
    return () => {
      bellHandlersRef.current.delete(handlers);
    };
  }, []);

  const registerOrderFocusHandler = useCallback((handler: OrderFocusHandler) => {
    orderFocusHandlerRef.current = handler;
    return () => {
      if (orderFocusHandlerRef.current === handler) {
        orderFocusHandlerRef.current = null;
      }
    };
  }, []);

  const markNotificationRead = useCallback(
    async (notificationId?: string) => {
      if (!notificationId) return;
      try {
        await adminFetch(`/admin/notifications/${notificationId}/read`, { method: 'PATCH' });
        reloadBell();
      } catch {
        /* optional */
      }
    },
    [reloadBell],
  );

  const removeOrderToast = useCallback((key: string) => {
    setOrderToasts((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (next.length === 0) stopBranchNewOrderAlertLoop();
      return next;
    });
  }, []);

  const removeProductToast = useCallback((key: string) => {
    setProductToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const removeStockToast = useCallback((key: string) => {
    setStockToasts((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (next.length === 0) stopBranchStockAlertLoop();
      return next;
    });
  }, []);

  const removeFailureToast = useCallback((key: string) => {
    setFailureToasts((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (next.length === 0) stopVehicleFailureAlertLoop();
      return next;
    });
  }, []);

  const focusOrder = useCallback(
    (alert: NewOrderAlert) => {
      removeOrderToast(alert.key);
      void markNotificationRead(alert.notificationId);

      const target: OrderFocusTarget = {
        orderNumber: alert.orderNumber,
        orderId: alert.orderId,
        orderMode: alert.orderMode,
      };

      if (pathname === '/admin/orders' && orderFocusHandlerRef.current) {
        orderFocusHandlerRef.current(target);
        return;
      }

      const tab = alert.orderMode === 'DELIVERY' ? 'delivery' : 'pickup';
      const params = new URLSearchParams({
        id: alert.orderNumber,
        tab,
      });
      openMainAdminPage(`/admin/orders?${params.toString()}`);
    },
    [markNotificationRead, pathname, removeOrderToast],
  );

  const focusProduct = useCallback(
    (alert: NewProductAlert) => {
      removeProductToast(alert.key);
      void markNotificationRead(alert.notificationId);
      openMainAdminPage(`/admin/stock?highlight=${encodeURIComponent(alert.productId)}`);
    },
    [markNotificationRead, removeProductToast],
  );

  const restockStockAlert = useCallback(
    async (alert: StockAlert) => {
      if (restockingStockKey) return;
      if (!canRestockFromStockAlert) {
        toast.error('You do not have permission to restock branch stock');
        return;
      }

      setRestockingStockKey(alert.key);
      try {
        const result = await adminApiFetch<{
          receivedQty?: number;
        }>(`/admin/stock/${encodeURIComponent(alert.productId)}/restock-to-target`, {
          method: 'POST',
          body: JSON.stringify({ storeId: alert.storeId }),
        });
        removeStockToast(alert.key);
        const units = result.receivedQty ?? 0;
        toast.success(
          `Restocked ${alert.productName} to weekly target${units > 0 ? ` (${units} units)` : ''}`,
        );
        void qc.invalidateQueries({ queryKey: ['admin-stock'] });
        void qc.invalidateQueries({ queryKey: ['admin-stock-batches'] });
        void qc.invalidateQueries({ queryKey: ['admin-stock-report'] });
        void qc.invalidateQueries({ queryKey: ['admin-stock-audit'] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Restock failed');
      } finally {
        setRestockingStockKey(null);
      }
    },
    [canRestockFromStockAlert, qc, removeStockToast, restockingStockKey],
  );

  const dismissOrderToast = useCallback(
    async (alert: NewOrderAlert) => {
      await markNotificationRead(alert.notificationId);
      removeOrderToast(alert.key);
    },
    [markNotificationRead, removeOrderToast],
  );

  const dismissProductToast = useCallback(
    async (alert: NewProductAlert) => {
      await markNotificationRead(alert.notificationId);
      removeProductToast(alert.key);
    },
    [markNotificationRead, removeProductToast],
  );

  const dismissStockToast = useCallback((alert: StockAlert) => {
    removeStockToast(alert.key);
  }, [removeStockToast]);

  const focusFailure = useCallback(
    (alert: VehicleFailureAlert) => {
      removeFailureToast(alert.key);
      router.push('/?tab=failures');
    },
    [removeFailureToast, router],
  );

  const dismissFailureToast = useCallback(
    (alert: VehicleFailureAlert) => {
      removeFailureToast(alert.key);
    },
    [removeFailureToast],
  );

  const showMoreInBell = useCallback(() => {
    const bell = document.querySelector<HTMLButtonElement>('[aria-label="Notifications"]');
    bell?.click();
  }, []);

  const enqueueNewOrder = useCallback(
    (payload: AdminNotificationPayload) => {
      if (!enableOrderAlerts) return;

      const alert = toNewOrderAlert(payload);
      if (!alert) return;

      if (payload.id) {
        if (seenNotificationIdsRef.current.has(payload.id)) return;
        seenNotificationIdsRef.current.add(payload.id);
        window.setTimeout(() => seenNotificationIdsRef.current.delete(payload.id!), 5 * 60_000);
      }

      if (seenOrderKeysRef.current.has(alert.key)) return;
      seenOrderKeysRef.current.add(alert.key);
      window.setTimeout(() => seenOrderKeysRef.current.delete(alert.key), 60_000);

      dispatchAdminNewOrder(payload);

      setOrderToasts((prev) => {
        if (prev.some((item) => item.key === alert.key)) return prev;
        startBranchNewOrderAlertLoop();
        return [alert, ...prev];
      });

      playBranchNewOrderSound();
    },
    [enableOrderAlerts],
  );

  const enqueueNewProduct = useCallback(
    (payload: AdminNotificationPayload) => {
      if (!enableProductAlerts) return;
      if (payload.storeId && adminUser?.storeId && payload.storeId !== adminUser.storeId) return;

      const alert = toNewProductAlert(payload);
      if (!alert) return;

      if (seenProductKeysRef.current.has(alert.key)) return;
      seenProductKeysRef.current.add(alert.key);
      window.setTimeout(() => seenProductKeysRef.current.delete(alert.key), 60_000);

      setProductToasts((prev) => {
        if (prev.some((item) => item.key === alert.key)) return prev;
        return [alert, ...prev];
      });

      playBranchNewOrderSound();
    },
    [adminUser?.storeId, enableProductAlerts],
  );

  const enqueueStockAlert = useCallback(
    (payload: StockAlertPayload, kind: 'low' | 'out') => {
      if (!enableStockToastAlerts) return;
      if (adminUser?.storeId && payload.storeId !== adminUser.storeId) return;

      const alert = toStockAlert(payload, kind);
      if (!alert) return;

      if (seenStockKeysRef.current.has(alert.key)) return;
      seenStockKeysRef.current.add(alert.key);
      window.setTimeout(() => seenStockKeysRef.current.delete(alert.key), 60_000);

      setStockToasts((prev) => {
        const withoutDuplicate = prev.filter((item) => item.key !== alert.key);
        const next =
          kind === 'out'
            ? withoutDuplicate.filter(
                (item) => !(item.productId === alert.productId && item.kind === 'low'),
              )
            : withoutDuplicate;
        const result = [alert, ...next].slice(0, 20);
        if (result.length > 0) startBranchStockAlertLoop();
        return result;
      });
    },
    [adminUser?.storeId, enableStockToastAlerts],
  );

  useEffect(() => {
    if (stockToasts.length > 0) {
      startBranchStockAlertLoop();
    } else {
      stopBranchStockAlertLoop();
    }
  }, [stockToasts.length]);

  const enqueueVehicleFailure = useCallback((payload: VehicleFailureEvent) => {
    if (!payload.jobId) return;
    const alert: VehicleFailureAlert = {
      key: payload.jobId,
      jobId: payload.jobId,
      rideCode: payload.rideCode,
      storeName: payload.storeName,
    };
    setFailureToasts((prev) => {
      if (prev.some((item) => item.key === alert.key)) return prev;
      startVehicleFailureAlertLoop();
      return [alert, ...prev];
    });
  }, []);

  const handleNewOrderPayload = useCallback(
    (payload: AdminNotificationPayload) => {
      notifyBell(payload);
      reloadBell();
      if (payload.type === 'NEW_ORDER' || payload.orderNumber || payload.orderId) {
        enqueueNewOrder({ ...payload, type: payload.type || 'NEW_ORDER' });
      }
    },
    [enqueueNewOrder, notifyBell, reloadBell],
  );

  const handleNewProductPayload = useCallback(
    (payload: AdminNotificationPayload) => {
      notifyBell(payload);
      reloadBell();
      if (payload.type === 'NEW_PRODUCT' || payload.productId) {
        enqueueNewProduct({ ...payload, type: 'NEW_PRODUCT' });
      }
    },
    [enqueueNewProduct, notifyBell, reloadBell],
  );

  const handleNewOrderPayloadRef = useRef(handleNewOrderPayload);
  const handleNewProductPayloadRef = useRef(handleNewProductPayload);
  const notifyBellRef = useRef(notifyBell);
  const reloadBellRef = useRef(reloadBell);
  const enqueueStockAlertRef = useRef(enqueueStockAlert);
  const enqueueVehicleFailureRef = useRef(enqueueVehicleFailure);

  handleNewOrderPayloadRef.current = handleNewOrderPayload;
  handleNewProductPayloadRef.current = handleNewProductPayload;
  notifyBellRef.current = notifyBell;
  reloadBellRef.current = reloadBell;
  enqueueStockAlertRef.current = enqueueStockAlert;
  enqueueVehicleFailureRef.current = enqueueVehicleFailure;

  const syncUnreadOrderAlerts = useCallback(
    async (recentOnlyMs?: number) => {
      if (!enableOrderAlerts || !adminUserId) return;
      try {
        const res = await adminFetch('/admin/notifications?unread=true&limit=20');
        const notifications = (res.data?.notifications || []) as Array<{
          id: string;
          type: string;
          title: string;
          message: string;
          orderId?: string | null;
          read?: boolean;
          createdAt: string;
        }>;

        const cutoff = recentOnlyMs ? Date.now() - recentOnlyMs : 0;

        for (const notification of notifications) {
          if (notification.type !== 'NEW_ORDER') continue;
          if (cutoff && new Date(notification.createdAt).getTime() < cutoff) continue;
          handleNewOrderPayloadRef.current(apiNotificationToOrderPayload(notification));
        }
      } catch {
        /* optional fallback */
      }
    },
    [adminUserId, enableOrderAlerts],
  );

  useEffect(() => {
    if (!adminUserId) return;

    void syncUnreadOrderAlerts(30 * 60_000);
    const poll = window.setInterval(() => {
      void syncUnreadOrderAlerts(30_000);
    }, 15_000);

    return () => {
      window.clearInterval(poll);
    };
  }, [adminUserId, enableOrderAlerts, syncUnreadOrderAlerts]);

  useEffect(() => {
    if (!adminUserId) return;

    const prime = () => primeBranchOrderAudio();
    window.addEventListener('pointerdown', prime);
    window.addEventListener('keydown', prime);

    let socket: Socket | null = null;
    let cancelled = false;
    let authRetryTimer: number | null = null;
    let authFailCount = 0;

    const joinRooms = () => {
      socket?.emit('joinAdmin', {
        adminId: adminUserId,
        storeId: adminStoreId || undefined,
      });
    };

    void createAdminSocket({ autoConnect: false }).then((created) => {
      if (cancelled || !created) return;
      socket = created;

      socket.on('connect_error', () => {
        /* Socket.IO reconnect + refreshed handshake auth */
      });

      socket.on('socketError', (payload: { code?: string }) => {
        if (payload?.code !== 'UNAUTHORIZED') return;
        authFailCount += 1;
        if (authFailCount > 5) {
          socket?.disconnect();
          return;
        }
        const delayMs = Math.min(30_000, 1000 * 2 ** Math.min(authFailCount, 4));
        if (authRetryTimer != null) window.clearTimeout(authRetryTimer);
        authRetryTimer = window.setTimeout(() => {
          void fetchAdminSocketToken().then((token) => {
            if (!token || !socket) return;
            socket.auth = { token };
            socket.disconnect();
            socket.connect();
          });
        }, delayMs);
      });

      socket.on('connect', () => {
        authFailCount = 0;
        joinRooms();
        void syncUnreadOrderAlerts(30_000);
      });

      socket.on('adminNotification', (payload: AdminNotificationPayload) => {
        if (payload.type === 'NEW_ORDER') {
          handleNewOrderPayloadRef.current(payload);
        } else if (payload.type === 'NEW_PRODUCT') {
          handleNewProductPayloadRef.current(payload);
        } else {
          notifyBellRef.current(payload);
          reloadBellRef.current();
        }
      });

      socket.on('storeNewOrder', (payload: AdminNotificationPayload) => {
        handleNewOrderPayloadRef.current({ ...payload, type: 'NEW_ORDER' });
      });

      socket.on('storeNewProduct', (payload: AdminNotificationPayload) => {
        if (adminStoreId && payload.storeId && payload.storeId !== adminStoreId) return;
        handleNewProductPayloadRef.current({ ...payload, type: 'NEW_PRODUCT' });
      });

      socket.on('vehicleFailureReported', (payload: VehicleFailureEvent) => {
        qc.invalidateQueries({ queryKey: ['admin-delivery-failures'] });
        if (!deliveryAdminRef.current) {
          toast.error('🚨 Vehicle failure reported — a rider is stranded and needs backup. Check Delivery Failures.', {
            duration: 12000,
          });
          return;
        }
        enqueueVehicleFailureRef.current(payload);
      });

      if (enableStockAlerts) {
        socket.on('stock:updated', (payload: StockSocketQtyPayload & {
          weeklyRemainingQty: number;
          weeklyBaseQty: number;
          isAvailable: boolean;
          isLowStock: boolean;
          isOutOfStock: boolean;
          stockPercent: number;
        }) => {
          if (adminStoreId && payload.storeId !== adminStoreId) return;

          patchAdminStockQueryCache(qc, payload);

          const onHand = resolveSocketOnHand(payload);
          qc.setQueriesData<{ items: Array<{ productId: string; weeklyRemainingQty?: number; weeklyBaseQty?: number }> }>(
            { queryKey: ['branch-stock-allocations'] },
            (old) => {
              if (!old) return old;
              return {
                ...old,
                items: old.items.map((item) =>
                  item.productId === payload.productId
                    ? {
                        ...item,
                        weeklyRemainingQty: onHand ?? payload.weeklyRemainingQty,
                        weeklyBaseQty: payload.weeklyBaseQty,
                      }
                    : item,
                ),
              };
            },
          );

          // Reconcile with server so On Hand never stays stale after live status flips.
          void qc.invalidateQueries({ queryKey: ['admin-stock'] });
          void qc.invalidateQueries({ queryKey: ['admin-stock-batches'] });
        });

        socket.on('stock:low-warning', (payload: StockAlertPayload) => {
          if (adminStoreId && payload.storeId !== adminStoreId) return;

          patchAdminStockQueryCache(qc, {
            storeId: payload.storeId,
            productId: payload.productId,
            weeklyRemainingQty: payload.weeklyRemainingQty,
            onHandQty: payload.onHandQty,
            onlineAvailableQty: payload.onlineAvailableQty,
            isLowStock: true,
            isOutOfStock: false,
          });
          void qc.invalidateQueries({ queryKey: ['admin-stock'] });

          if (enableStockToastAlerts) {
            enqueueStockAlertRef.current(payload, 'low');
            return;
          }
          toast(
            `Low stock: ${payload.productName} at ${payload.storeName.replace('Bing Chun - ', '')} (${payload.onlineAvailableQty ?? payload.weeklyRemainingQty ?? 0} online)`,
            { icon: '⚠️', duration: 8000, style: { background: '#78350f', color: '#fef3c7' } },
          );
        });

        socket.on('stock:out-of-stock', (payload: StockAlertPayload) => {
          if (adminStoreId && payload.storeId !== adminStoreId) return;

          // Threshold alerts used to toast/status without updating On Hand in the table cache.
          patchAdminStockQueryCache(qc, {
            storeId: payload.storeId,
            productId: payload.productId,
            weeklyRemainingQty: payload.weeklyRemainingQty,
            onHandQty: payload.onHandQty,
            onlineAvailableQty: payload.onlineAvailableQty ?? 0,
            isAvailable: false,
            isLowStock: false,
            isOutOfStock: true,
          });
          void qc.invalidateQueries({ queryKey: ['admin-stock'] });

          if (enableStockToastAlerts) {
            enqueueStockAlertRef.current(payload, 'out');
            return;
          }
          toast.error(
            `${payload.productName} is now Out of Stock at ${payload.storeName.replace('Bing Chun - ', '')}`,
            { duration: 10000 },
          );
        });
      }

      socket.connect();
    });

    return () => {
      cancelled = true;
      if (authRetryTimer != null) window.clearTimeout(authRetryTimer);
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
      socket?.disconnect();
      stopBranchNewOrderAlertLoop();
      stopBranchStockAlertLoop();
      stopVehicleFailureAlertLoop();
    };
  }, [adminUserId, adminStoreId, enableStockAlerts, enableStockToastAlerts, qc, syncUnreadOrderAlerts]);

  const visibleOrderToasts = orderToasts.slice(0, MAX_VISIBLE_TOASTS);
  const visibleProductToasts = productToasts.slice(0, MAX_VISIBLE_TOASTS);
  const visibleStockToasts = stockToasts.slice(0, MAX_VISIBLE_TOASTS);
  const visibleFailureToasts = failureToasts.slice(0, MAX_VISIBLE_TOASTS);
  const orderOverflowCount = Math.max(0, orderToasts.length - MAX_VISIBLE_TOASTS);
  const productOverflowCount = Math.max(0, productToasts.length - MAX_VISIBLE_TOASTS);
  const stockOverflowCount = Math.max(0, stockToasts.length - MAX_VISIBLE_TOASTS);
  const showFailureToasts = failureToasts.length > 0;
  const showToastStack =
    showFailureToasts ||
    (showBranchToasts &&
      (orderToasts.length > 0 || productToasts.length > 0 || stockToasts.length > 0));

  return (
    <AdminNotificationContext.Provider
      value={{ registerBell, registerOrderFocusHandler, vehicleFailureCount: failureToasts.length }}
    >
      {children}
      {showToastStack && (
        <BranchAdminToastStack
          orderToasts={showBranchToasts ? visibleOrderToasts : []}
          productToasts={showBranchToasts ? visibleProductToasts : []}
          stockToasts={showBranchToasts ? visibleStockToasts : []}
          failureToasts={visibleFailureToasts}
          orderOverflowCount={showBranchToasts ? orderOverflowCount : 0}
          productOverflowCount={showBranchToasts ? productOverflowCount : 0}
          stockOverflowCount={showBranchToasts ? stockOverflowCount : 0}
          onFocusOrder={focusOrder}
          onDismissOrder={dismissOrderToast}
          onFocusProduct={focusProduct}
          onDismissProduct={dismissProductToast}
          onFocusStock={restockStockAlert}
          onDismissStock={dismissStockToast}
          onFocusFailure={focusFailure}
          onDismissFailure={dismissFailureToast}
          onShowMore={showMoreInBell}
          restockingStockKey={restockingStockKey}
        />
      )}
    </AdminNotificationContext.Provider>
  );
}

export function AdminNotificationProvider({
  adminUser,
  children,
}: {
  adminUser: AdminSession | null;
  children: ReactNode;
}) {
  const parent = useContext(AdminNotificationContext);
  if (parent) return <>{children}</>;
  return <AdminNotificationProviderInner adminUser={adminUser}>{children}</AdminNotificationProviderInner>;
}
