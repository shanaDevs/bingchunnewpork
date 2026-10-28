import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import {
  clearOtherDefaultAddresses,
  ensureUserHasDefaultAddress,
  findNearbyUserAddress,
  upsertUserDeliveryAddress,
} from '../lib/userAddresses';

const addressSchema = z.object({
  label: z.string().default('Home'),
  addressLine: z.string().min(5),
  city: z.string().min(2),
  district: z.string().min(2),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isDefault: z.boolean().optional(),
});

export async function getAddresses(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    await ensureUserHasDefaultAddress(userId);
    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return success(res, addresses);
  } catch (err) { next(err); }
}

export async function createAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const data = addressSchema.parse(req.body);
    const userId = req.user!.sub;

    try {
      const { address, created } = await upsertUserDeliveryAddress({
        userId,
        label: data.label,
        addressLine: data.addressLine,
        city: data.city,
        district: data.district,
        lat: data.lat,
        lng: data.lng,
        isDefault: data.isDefault,
      });
      return success(res, address, created ? 201 : 200);
    } catch (err) {
      if (err instanceof Error && (err as { statusCode?: number }).statusCode === 400) {
        throw new AppError(err.message, 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function updateAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const data = addressSchema.partial().parse(req.body);
    const address = await prisma.address.findUnique({ where: { id: req.params.id as string } });
    if (!address || address.userId !== req.user!.sub) throw new AppError('Address not found', 404);

    const nextLat = data.lat ?? address.lat;
    const nextLng = data.lng ?? address.lng;
    if (
      nextLat != null &&
      nextLng != null &&
      Number.isFinite(nextLat) &&
      Number.isFinite(nextLng) &&
      (data.lat != null || data.lng != null)
    ) {
      const nearby = await findNearbyUserAddress({
        userId: req.user!.sub,
        lat: nextLat,
        lng: nextLng,
        excludeId: address.id,
      });
      if (nearby) {
        throw new AppError(
          'Another saved address is already within 20 m of this location. Use that address instead.',
          400,
        );
      }
    }

    if (data.isDefault) {
      await clearOtherDefaultAddresses(req.user!.sub, address.id);
    }

    const updated = await prisma.address.update({ where: { id: address.id }, data });

    if (address.isDefault && data.isDefault === false) {
      await ensureUserHasDefaultAddress(req.user!.sub);
    }

    return success(res, updated);
  } catch (err) { next(err); }
}

export async function deleteAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const address = await prisma.address.findUnique({ where: { id: req.params.id as string } });
    if (!address || address.userId !== req.user!.sub) throw new AppError('Address not found', 404);
    await prisma.address.delete({ where: { id: address.id } });
    await ensureUserHasDefaultAddress(req.user!.sub);
    return success(res, { message: 'Address deleted' });
  } catch (err) { next(err); }
}
