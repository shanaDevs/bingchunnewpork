import type { Request } from 'express';
import { prisma } from './prisma';
import { normalizeProductImageUrl } from './productImages';
import type { ClusterableOrder } from './orderClustering';
import { fulfillmentQueuePaymentWhere } from './orderPayment';
import { resolveCustomerDisplayName } from './customerName';
import { isAllBranchRole, isBranchScopedRole, resolveBranchStoreId } from '../middleware/auth';

const activeJobStatuses = ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'] as const;

export async function getPendingDeliveryOrders(storeId: string) {
  return prisma.order.findMany({
    where: {
      storeId,
      orderMode: 'DELIVERY',
      status: 'READY',
      ...fulfillmentQueuePaymentWhere('delivery'),
      deliveryJobOrders: {
        none: {
          job: { status: { in: [...activeJobStatuses] } },
        },
      },
    },
    include: {
      user: { select: { name: true, phone: true } },
      address: {
        select: { addressLine: true, city: true, district: true, lat: true, lng: true },
      },
      items: {
        select: {
          quantity: true,
          productName: true,
          totalPrice: true,
          product: { select: { imageUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export function orderToClusterable(order: Awaited<ReturnType<typeof getPendingDeliveryOrders>>[number]): ClusterableOrder | null {
  const lat = order.deliveryLat ?? order.address?.lat;
  const lng = order.deliveryLng ?? order.address?.lng;
  if (lat == null || lng == null) return null;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: resolveCustomerDisplayName({
      guestName: order.guestName,
      userName: order.user?.name,
      phone: order.guestPhone ?? order.user?.phone,
    }),
    addressLine: order.deliveryAddressLine ?? order.address?.addressLine ?? '',
    city: order.deliveryCity ?? order.address?.city ?? '',
    district: order.deliveryDistrict ?? order.address?.district ?? '',
    total: order.total,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    imageUrl: normalizeProductImageUrl(order.items[0]?.product?.imageUrl ?? null),
    extraItemCount: Math.max(0, order.items.length - 1),
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    lat,
    lng,
  };
}

/** @deprecated Prefer resolveAdminStoreIdForRequest — resolves branch store from DB. */
export function resolveAdminStoreId(
  role: string | undefined,
  userStoreId: string | undefined,
  requestedStoreId?: string
): string {
  if (role === 'STORE_MANAGER' || role === 'CASHIER') {
    if (!userStoreId) throw new Error('Branch account is not linked to a store');
    if (requestedStoreId && requestedStoreId !== userStoreId) {
      throw new Error('You can only manage your branch');
    }
    return userStoreId;
  }
  if (!requestedStoreId) throw new Error('storeId is required');
  return requestedStoreId;
}

export async function resolveAdminStoreIdForRequest(
  req: Request,
  requestedStoreId?: string,
): Promise<string> {
  if (isAllBranchRole(req.user?.role)) {
    if (!requestedStoreId) throw new Error('storeId is required');
    return requestedStoreId;
  }
  if (isBranchScopedRole(req.user?.role)) {
    const storeId = await resolveBranchStoreId(req);
    if (!storeId) throw new Error('Branch account is not linked to a store');
    if (requestedStoreId && requestedStoreId !== storeId) {
      throw new Error('You can only manage your branch');
    }
    return storeId;
  }
  if (!requestedStoreId) throw new Error('storeId is required');
  return requestedStoreId;
}

/** Super admin may omit storeId to query all branches. */
export function resolveOptionalAdminStoreId(
  role: string | undefined,
  userStoreId: string | undefined,
  requestedStoreId?: string
): string | undefined {
  if (role === 'SYSTEM_ADMIN') {
    return requestedStoreId || undefined;
  }
  return resolveAdminStoreId(role, userStoreId, requestedStoreId);
}

/** Super and delivery admins may omit storeId to query all branches. */
export async function resolveOptionalAdminStoreIdForRequest(
  req: Request,
  requestedStoreId?: string,
): Promise<string | undefined> {
  if (isAllBranchRole(req.user?.role)) {
    return requestedStoreId || undefined;
  }
  return resolveAdminStoreIdForRequest(req, requestedStoreId);
}
