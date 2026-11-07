import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getCustomerMapTiles, getDrivingPath, getPlaceLocation, mapsAdapter } from '../integrations/mapsAdapter';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { isBranchScopedRole } from '../middleware/auth';

import { haversineKm, normalizeStoreCoordinates } from '../utils/geo';
import { resolveDeliveryValidation } from '../lib/deliveryFee';
import { fetchStoreOrderingHours, fetchOrderingHoursMap, updateStoreOrderingHours } from '../lib/storeOrderingSchema';

export async function getStores(req: Request, res: Response, next: NextFunction) {
  try {
    const { district, lat, lng, includeInactive } = z.object({
      district: z.string().optional(),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      includeInactive: z
        .union([z.literal('true'), z.literal('false'), z.boolean()])
        .optional()
        .transform((v) => v === true || v === 'true'),
    }).parse(req.query);

    const isSystemAdmin = req.user?.type === 'admin' && req.user.role === 'SYSTEM_ADMIN';
    // Branch staff (manager/cashier) see only their accessible set. Drivers and
    // all-branch admins get the full active catalog — riders need that for Add branch.
    const isRestrictedAdmin = isBranchScopedRole(req.user?.role);
    const showInactive = isSystemAdmin && includeInactive;
    const stores = await prisma.store.findMany({
      where: { 
        ...(showInactive ? {} : { isActive: true }),
        ...(district ? { district } : {}),
        ...(isRestrictedAdmin ? { accessibleByAdmins: { some: { id: req.user!.sub } } } : {})
      },
      orderBy: { name: 'asc' },
    });
    const orderingByStore = await fetchOrderingHoursMap(stores.map((s) => s.id));
    const withOrdering = stores.map((store) =>
      normalizeStoreCoordinates({
        ...store,
        ...(orderingByStore.get(store.id) ?? {}),
      }),
    );

    if (lat && lng) {
      const withDist = withOrdering.map((s) => ({
        ...s,
        distanceKm: haversineKm(lat, lng, s.lat, s.lng),
      }));
      withDist.sort((a, b) => a.distanceKm - b.distanceKm);
      return success(res, withDist);
    }

    return success(res, withOrdering);
  } catch (err) { next(err); }
}

export async function getStore(req: Request, res: Response, next: NextFunction) {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.params.id as string },
      include: { deliveryZones: { where: { isActive: true } } },
    });
    if (!store) throw new AppError('Store not found', 404);
    const ordering = await fetchStoreOrderingHours(store.id);
    return success(res, ordering ? { ...store, ...ordering } : store);
  } catch (err) { next(err); }
}

export async function validateDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    const { address, lat, lng, storeId } = z.object({
      address: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      storeId: z.string().optional(),
    }).parse(req.body);

    let userLat = lat;
    let userLng = lng;

    if (userLat == null || userLng == null) {
      if (!address) throw new AppError('Address or coordinates required', 400);
      const coords = await mapsAdapter.geocode(address);
      if (!coords) throw new AppError('Could not geocode address', 400);
      userLat = coords.lat;
      userLng = coords.lng;
    }

    const result = await resolveDeliveryValidation(userLat, userLng, storeId);
    return success(res, result);
  } catch (err) { next(err); }
}

export async function autocompleteAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, lat, lng } = z.object({
      q: z.string().min(2),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
    }).parse(req.query);
    const bias = lat != null && lng != null ? { lat, lng } : undefined;
    const results = await mapsAdapter.autocomplete(q, bias);
    return success(res, results);
  } catch (err) { next(err); }
}

export async function geocodeAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const { address } = z.object({ address: z.string().min(2) }).parse(req.query);
    const details = await mapsAdapter.geocodeDetails(address);
    if (!details) throw new AppError('Could not find this address', 400);
    return success(res, details);
  } catch (err) { next(err); }
}

export async function customerMapTiles(_req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, await getCustomerMapTiles());
  } catch (err) { next(err); }
}

export async function drivingDirections(req: Request, res: Response, next: NextFunction) {
  try {
    const { originLat, originLng, destLat, destLng, waypoints } = z.object({
      originLat: z.coerce.number(),
      originLng: z.coerce.number(),
      destLat: z.coerce.number(),
      destLng: z.coerce.number(),
      waypoints: z.string().optional(),
    }).parse(req.query);

    const via = (waypoints ?? '')
      .split('|')
      .map((pair) => pair.split(',').map((value) => Number(value.trim())))
      .filter((pair) => pair.length === 2 && pair.every((value) => Number.isFinite(value)))
      .map(([lat, lng]) => ({ lat, lng }));

    const path = await getDrivingPath([
      { lat: originLat, lng: originLng },
      ...via,
      { lat: destLat, lng: destLng },
    ]);
    return success(res, { points: path ?? [] });
  } catch (err) { next(err); }
}

export async function placeLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { placeId } = z.object({ placeId: z.string().min(2) }).parse(req.query);
    const place = await getPlaceLocation(placeId);
    if (!place) throw new AppError('Could not find this place', 400);
    return success(res, place);
  } catch (err) { next(err); }
}

export async function reverseGeocodeAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const { lat, lng } = z.object({
      lat: z.coerce.number(),
      lng: z.coerce.number(),
    }).parse(req.query);
    const address = await mapsAdapter.reverseGeocode(lat, lng);
    if (!address) throw new AppError('Could not resolve address for this location', 400);
    return success(res, { address, lat, lng });
  } catch (err) { next(err); }
}

// Admin
export async function createStore(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      name: z.string(), addressLine: z.string(), city: z.string(), district: z.string(),
      lat: z.number(), lng: z.number(), phone: z.string().trim().min(1, 'Phone is required'),
      openTime: z.string().optional(), closeTime: z.string().optional(),
      onlineOrderStartTime: z.string().nullable().optional(),
      onlineOrderStopTime: z.string().nullable().optional(),
      pickupCutoffMinutes: z.number().int().min(0).max(180).optional(),
    });
    const data = schema.parse(req.body);
    const { onlineOrderStartTime, onlineOrderStopTime, pickupCutoffMinutes, ...prismaData } = data;
    const store = await prisma.store.create({ data: prismaData });
    if (
      onlineOrderStartTime !== undefined ||
      onlineOrderStopTime !== undefined ||
      pickupCutoffMinutes !== undefined
    ) {
      const hours = await updateStoreOrderingHours(store.id, {
        onlineOrderStartTime,
        onlineOrderStopTime,
        pickupCutoffMinutes,
      });
      return success(res, { ...store, ...hours }, 201);
    }
    return success(res, store, 201);
  } catch (err) { next(err); }
}

export async function updateStore(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      name: z.string().optional(), addressLine: z.string().optional(), city: z.string().optional(),
      district: z.string().optional(), lat: z.number().optional(), lng: z.number().optional(),
      phone: z.string().optional(), openTime: z.string().optional(), closeTime: z.string().optional(),
      onlineOrderStartTime: z.string().nullable().optional(),
      onlineOrderStopTime: z.string().nullable().optional(),
      pickupCutoffMinutes: z.number().int().min(0).max(180).optional(),
      isActive: z.boolean().optional(), isBusy: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const { onlineOrderStartTime, onlineOrderStopTime, pickupCutoffMinutes, ...prismaData } = data;
    const store = await prisma.store.update({ where: { id: req.params.id as string }, data: prismaData });
    const hoursPatch = {
      ...(data.openTime !== undefined ? { openTime: data.openTime } : {}),
      ...(data.closeTime !== undefined ? { closeTime: data.closeTime } : {}),
      ...(onlineOrderStartTime !== undefined ? { onlineOrderStartTime } : {}),
      ...(onlineOrderStopTime !== undefined ? { onlineOrderStopTime } : {}),
      ...(pickupCutoffMinutes !== undefined ? { pickupCutoffMinutes } : {}),
    };
    if (Object.keys(hoursPatch).length) {
      const hours = await updateStoreOrderingHours(store.id, hoursPatch);
      return success(res, { ...store, ...hours });
    }
    return success(res, store);
  } catch (err) { next(err); }
}

export async function createDeliveryZone(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      storeId: z.string(), name: z.string(), radiusKm: z.number().positive(),
      fee: z.number().int(), minOrder: z.number().int().optional(),
    });
    const data = schema.parse(req.body);
    const zone = await prisma.deliveryZone.create({ data });
    return success(res, zone, 201);
  } catch (err) { next(err); }
}
