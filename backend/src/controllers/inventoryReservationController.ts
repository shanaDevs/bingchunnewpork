import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { RESERVATION_MAX_LINE_QUANTITY } from '../lib/inventoryReservationSchema';
import {
  cancelReservation,
  getBatchAvailability,
  getStockAvailability,
  releaseExpiredReservations,
} from '../services/inventoryReservationService';
import {
  abortCheckoutReservation,
  finalizePaidCheckout,
  readCheckoutReservationStatus,
  startCheckoutWithReservation,
} from '../services/checkoutReservationService';

const lineSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).max(RESERVATION_MAX_LINE_QUANTITY),
  productName: z.string().optional(),
});

const MAX_BATCH_PRODUCT_IDS = 100;

const createReservationSchema = z.object({
  storeId: z.string(),
  items: z.array(lineSchema).min(1),
  reservationUuid: z.string().uuid().optional(),
  renewExisting: z.boolean().optional(),
});

const checkoutSchema = createReservationSchema;

const paymentSuccessSchema = z.object({
  orderId: z.string(),
  storeId: z.string(),
  items: z.array(lineSchema).min(1).optional(),
});

const paymentFailureSchema = z.object({
  orderId: z.string().optional(),
  reservationUuid: z.string().uuid().optional(),
}).refine((data) => Boolean(data.orderId || data.reservationUuid), {
  message: 'orderId or reservationUuid is required',
});

const availabilityQuerySchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  reservationUuid: z.string().uuid().optional(),
});

const batchAvailabilityQuerySchema = z.object({
  storeId: z.string().min(1),
  productIds: z.string().min(1),
  reservationUuid: z.string().uuid().optional(),
});

export async function getAvailableStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId, productId, reservationUuid } = availabilityQuerySchema.parse({
      storeId: String(req.query.storeId || ''),
      productId: String(req.query.productId || ''),
      reservationUuid: typeof req.query.reservationUuid === 'string' ? req.query.reservationUuid : undefined,
    });

    const availability = await getStockAvailability(storeId, productId, reservationUuid);
    return success(res, availability);
  } catch (err) {
    next(err);
  }
}

export async function getBatchAvailableStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId, productIds: productIdsRaw, reservationUuid } = batchAvailabilityQuerySchema.parse({
      storeId: String(req.query.storeId || ''),
      productIds: String(req.query.productIds || ''),
      reservationUuid: typeof req.query.reservationUuid === 'string' ? req.query.reservationUuid : undefined,
    });

    const productIds = productIdsRaw.split(',').map((id) => id.trim()).filter(Boolean);
    if (productIds.length === 0) {
      return res.status(400).json({ success: false, message: 'productIds are required' });
    }
    if (productIds.length > MAX_BATCH_PRODUCT_IDS) {
      return res.status(400).json({
        success: false,
        message: `productIds cannot exceed ${MAX_BATCH_PRODUCT_IDS} items`,
      });
    }

    const availability = await getBatchAvailability(storeId, productIds, reservationUuid);
    return success(res, { storeId, items: availability });
  } catch (err) {
    next(err);
  }
}

export async function createReservationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createReservationSchema.parse(req.body);
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Unauthorised', 401);
    const session = await startCheckoutWithReservation({ ...data, userId });
    return success(res, session, 201);
  } catch (err) {
    next(err);
  }
}

export async function checkoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = checkoutSchema.parse(req.body);
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Unauthorised', 401);
    const session = await startCheckoutWithReservation({ ...data, userId });
    return success(res, session, 201);
  } catch (err) {
    next(err);
  }
}

export async function paymentSuccessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = paymentSuccessSchema.parse(req.body);
    await finalizePaidCheckout(data);
    return success(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function paymentFailureHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = paymentFailureSchema.parse(req.body);
    await abortCheckoutReservation(data);
    return success(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function reservationStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const reservationUuid = String(req.params.uuid || '');
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Unauthorised', 401);
    const status = await readCheckoutReservationStatus(reservationUuid, userId);
    return success(res, status);
  } catch (err) {
    next(err);
  }
}

export async function expireReservationsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const count = await releaseExpiredReservations();
    return success(res, { expired: count });
  } catch (err) {
    next(err);
  }
}

export async function deleteReservationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const reservationUuid = String(req.params.uuid || '');
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Unauthorised', 401);
    const cancelled = await cancelReservation(reservationUuid, userId);
    return success(res, { cancelled });
  } catch (err) {
    next(err);
  }
}
