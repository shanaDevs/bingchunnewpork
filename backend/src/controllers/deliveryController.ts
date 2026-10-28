import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { buildDeliveryRoutePayload } from '../lib/deliveryRouteResponse';
import { optimizeDeliveryStops, type RouteStop } from '../lib/routeOptimizer';
import { resolveCustomerDisplayName } from '../lib/customerName';

export async function getOptimizedRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) throw new AppError('Driver account is not linked to a branch', 403);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
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
      const lat = order.deliveryLat ?? order.address?.lat;
      const lng = order.deliveryLng ?? order.address?.lng;
      if (lat == null || lng == null) continue;

      rawStops.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: resolveCustomerDisplayName({
          guestName: order.guestName,
          userName: order.user?.name,
          phone: order.guestPhone ?? order.user?.phone,
        }),
        customerPhone: order.user?.phone ?? order.guestPhone ?? '',
        addressLine: order.deliveryAddressLine ?? order.address?.addressLine ?? '',
        city: order.deliveryCity ?? order.address?.city ?? '',
        district: order.deliveryDistrict ?? order.address?.district ?? '',
        status: order.status,
        total: order.total,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
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
