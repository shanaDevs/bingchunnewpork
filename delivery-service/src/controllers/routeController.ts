import { Request, Response, NextFunction } from 'express';
import { prisma } from '@bingchun/db';
import {
  buildDeliveryRoutePayload,
  optimizeDeliveryStops,
  type RouteStop,
} from '@bingchun/delivery-domain';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getDriverAccessibleStoreIds } from '../lib/driverAccess';

/** Legacy multi-order route for the driver's home / accessible branches. */
export async function getOptimizedRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await getDriverAccessibleStoreIds(driverId, req.user!.storeId);
    if (accessibleStoreIds.length === 0) {
      throw new AppError('Driver account is not linked to a branch', 403);
    }

    // Prefer home branch from JWT when available; otherwise first accessible store.
    const storeId = req.user!.storeId && accessibleStoreIds.includes(req.user!.storeId)
      ? req.user!.storeId
      : accessibleStoreIds[0];

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const orders = await prisma.order.findMany({
      where: {
        storeId: { in: accessibleStoreIds },
        orderMode: 'DELIVERY',
        status: { in: ['READY', 'OUT_FOR_DELIVERY'] },
        OR: [
          { deliveryLat: { not: null }, deliveryLng: { not: null } },
          { address: { lat: { not: null }, lng: { not: null } } },
        ],
      },
      include: {
        user: { select: { name: true, phone: true } },
        address: {
          select: {
            addressLine: true,
            city: true,
            district: true,
            lat: true,
            lng: true,
          },
        },
        items: { select: { quantity: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rawStops: Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'>[] = [];

    for (const order of orders) {
      const lat = order.deliveryLat ?? order.address?.lat ?? null;
      const lng = order.deliveryLng ?? order.address?.lng ?? null;
      if (lat == null || lng == null) continue;

      rawStops.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.guestName || order.user?.name || 'Guest',
        customerPhone: order.user?.phone ?? order.guestPhone ?? '',
        addressLine: order.deliveryAddressLine ?? order.address?.addressLine ?? '',
        city: order.deliveryCity ?? order.address?.city ?? '',
        district: order.deliveryDistrict ?? order.address?.district ?? '',
        status: order.status,
        total: order.total,
        itemCount: order.items.reduce((n: number, i: { quantity: number }) => n + i.quantity, 0),
        lat,
        lng,
      });
    }

    const stops = optimizeDeliveryStops({ lat: store.lat, lng: store.lng }, rawStops);
    const payload = await buildDeliveryRoutePayload(store, stops);

    return success(res, payload);
  } catch (err) {
    next(err);
  }
}
