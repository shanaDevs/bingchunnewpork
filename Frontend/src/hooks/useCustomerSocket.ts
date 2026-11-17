'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSocket } from '@/lib/socketClient';
import { patchOrderInQueryCache } from '@/lib/orderCache';
import { useAuthStore } from '@/store/authStore';
import type { Order, OrderStatus } from '@/types';

export interface CustomerNotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId?: string;
  orderNumber?: string;
  status?: OrderStatus;
  note?: string | null;
  read: boolean;
  createdAt: string;
}

const STATUS_TOAST: Partial<Record<OrderStatus, string>> = {
  RECEIVED: '📥',
  PREPARING: '👨‍🍳',
  READY: '✅',
  OUT_FOR_DELIVERY: '📦',
  DELIVERED: '🎉',
  CANCELLED: '❌',
};

type QueueUpdatePayload = {
  queuePosition?: number;
  scheduledPickupAt?: string;
};

/** Delivery run state from the Delivery Service — distinct from `OrderStatus` (see ADR 0005). */
export type DeliveryStatePayload = {
  orderId?: string;
  orderNumber?: string;
  state: string;
  updatedAt?: string;
};

export type EtaUpdatePayload = {
  orderId?: string;
  orderNumber?: string;
  estimatedMinutes?: number;
  etaAt?: string;
};

/** Code the customer reads out to the rider before the order can be marked delivered. */
export type DeliveryCodePayload = {
  orderId?: string;
  orderNumber?: string;
  code: string;
};

type OrderStatusEvent = {
  orderId?: string;
  orderNumber?: string;
  status: OrderStatus;
  note?: string;
};

function eventMatchesOrder(
  ids: string[],
  data: { orderId?: string; orderNumber?: string },
): boolean {
  if (data.orderId && ids.includes(data.orderId)) return true;
  if (data.orderNumber && ids.includes(data.orderNumber)) return true;
  if (!data.orderId && !data.orderNumber) return true;
  return false;
}

function deliveryStateToOrderStatus(state: string): OrderStatus | null {
  const normalized = state.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'DELIVERED') return 'DELIVERED';
  if (normalized === 'FAILED' || normalized === 'DELIVERY_FAILED') return null;
  return null;
}

function pickPrimaryTrackOrderId(ids: string[]): string {
  if (ids.length <= 1) return ids[0] ?? '';
  // Same order is tracked under internal id and order number — join one room only.
  return [...ids].sort((a, b) => b.length - a.length)[0] ?? ids[0];
}

/** Subscribe to one or more order rooms (track page) without duplicating user-level events */
export function useOrderTrackSocket(
  orderIdentifiers: string | Array<string | undefined> | undefined,
  onStatus: (data: OrderStatusEvent) => void,
  onQueueUpdate?: (data: QueueUpdatePayload) => void,
  onPickupSoon?: (data: { title?: string; message?: string }) => void,
  onDeliveryState?: (data: DeliveryStatePayload) => void,
  onEtaUpdate?: (data: EtaUpdatePayload) => void,
  onDeliveryCode?: (data: DeliveryCodePayload) => void,
  trackToken?: string,
): boolean {
  const queryClient = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);
  const idsKey = Array.isArray(orderIdentifiers)
    ? orderIdentifiers.filter(Boolean).join('|')
    : orderIdentifiers || '';

  useEffect(() => {
    const ids = (
      Array.isArray(orderIdentifiers) ? orderIdentifiers : [orderIdentifiers]
    ).filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (!ids.length) return;

    const socket = getSocket();
    const trackOrderId = pickPrimaryTrackOrderId(ids);
    const joinRooms = () => {
      if (trackOrderId) {
        socket.emit('trackOrder', trackToken ? { identifier: trackOrderId, trackToken } : trackOrderId);
      }
    };
    joinRooms();

    const onConnect = () => {
      setSocketConnected(true);
      joinRooms();
      for (const orderId of ids) {
        void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    };
    const onDisconnect = () => setSocketConnected(false);

    if (socket.connected) setSocketConnected(true);

    const applyStatusEvent = (data: OrderStatusEvent) => {
      if (!eventMatchesOrder(ids, data)) return;
      onStatus(data);
      patchOrderInQueryCache(queryClient, ids, {
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        status: data.status,
      });
      for (const orderId of ids) {
        void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    };

    const statusHandler = (data: OrderStatusEvent) => {
      applyStatusEvent(data);
    };

    const statusUpdateHandler = (data: OrderStatusEvent) => {
      applyStatusEvent(data);
    };

    const queueHandler = (data: QueueUpdatePayload) => {
      onQueueUpdate?.(data);
      patchOrderInQueryCache(queryClient, ids, {
        queuePosition: data.queuePosition ?? null,
        scheduledPickupAt: data.scheduledPickupAt ?? null,
      });
    };

    const pickupHandler = (data: { title?: string; message?: string }) => {
      onPickupSoon?.(data);
    };

    const deliveryStateHandler = (data: DeliveryStatePayload) => {
      if (!eventMatchesOrder(ids, data)) return;
      onDeliveryState?.(data);
      const mapped = data.state ? deliveryStateToOrderStatus(data.state) : null;
      if (mapped) {
        applyStatusEvent({
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          status: mapped,
        });
      }
    };
    const etaHandler = (data: EtaUpdatePayload) => onEtaUpdate?.(data);

    const seenDeliveryCodes = new Set<string>();
    const deliveryCodeHandler = (data: DeliveryCodePayload) => {
      if (!eventMatchesOrder(ids, data)) return;
      const dedupeKey = `${data.orderId ?? ''}|${data.orderNumber ?? ''}|${data.code}`;
      if (seenDeliveryCodes.has(dedupeKey)) return;
      seenDeliveryCodes.add(dedupeKey);
      onDeliveryCode?.(data);
      for (const orderId of ids) {
        void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('orderStatus', statusHandler);
    socket.on('orderStatusUpdate', statusUpdateHandler);
    socket.on('queueUpdate', queueHandler);
    socket.on('pickupSoon', pickupHandler);
    socket.on('deliveryState', deliveryStateHandler);
    socket.on('etaUpdate', etaHandler);
    socket.on('deliveryCode', deliveryCodeHandler);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('orderStatus', statusHandler);
      socket.off('orderStatusUpdate', statusUpdateHandler);
      socket.off('queueUpdate', queueHandler);
      socket.off('pickupSoon', pickupHandler);
      socket.off('deliveryState', deliveryStateHandler);
      socket.off('etaUpdate', etaHandler);
      socket.off('deliveryCode', deliveryCodeHandler);
    };
  }, [
    idsKey,
    orderIdentifiers,
    onStatus,
    onQueueUpdate,
    onPickupSoon,
    onDeliveryState,
    onEtaUpdate,
    onDeliveryCode,
    trackToken,
    queryClient,
  ]);

  return socketConnected;
}

export function useCustomerSocket() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const socket = getSocket();

    const handleNotification = (payload: CustomerNotificationPayload) => {
      window.dispatchEvent(new CustomEvent('bc-customer-notification', { detail: payload }));

      const isCompletion =
        payload.status === 'DELIVERED' || payload.status === 'READY';
      const isPickupSoon = payload.type === 'PICKUP_SOON';
      if (isCompletion && payload.orderNumber) {
        window.dispatchEvent(
          new CustomEvent('bc-order-complete', {
            detail: {
              orderNumber: payload.orderNumber,
              orderId: payload.orderId,
              status: payload.status,
            },
          })
        );
      }

      if (isPickupSoon) {
        toast(payload.message || payload.title, { icon: '⏰', duration: 6000 });
      } else if (payload.type === 'DELIVERY_CODE') {
        // Track page handles deliveryCode socket events — skip duplicate toast here.
      } else if (!isCompletion) {
        const icon = payload.status ? STATUS_TOAST[payload.status] ?? '🔔' : '🔔';
        toast(payload.title, {
          icon,
          duration: 5000,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['customer-notifications'] });
    };

    const handleStatusUpdate = (data: {
      orderId: string;
      orderNumber: string;
      status: OrderStatus;
      note?: string;
    }) => {
      patchOrderInQueryCache(
        queryClient,
        [data.orderId, data.orderNumber],
        {
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          status: data.status,
        },
      );
    };

    socket.on('customerNotification', handleNotification);
    socket.on('orderStatusUpdate', handleStatusUpdate);

    return () => {
      socket.off('customerNotification', handleNotification);
      socket.off('orderStatusUpdate', handleStatusUpdate);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    const socket = getSocket();
    if (!isAuthenticated || !userId) return;

    const joinUserRoom = () => {
      socket.emit('joinUser', userId);
    };

    joinUserRoom();
    socket.on('connect', joinUserRoom);
    return () => {
      socket.off('connect', joinUserRoom);
    };
  }, [isAuthenticated, userId]);
}
