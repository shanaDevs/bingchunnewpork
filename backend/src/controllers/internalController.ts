import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { getIo } from '../lib/socket';
import {
  applyOrderStatusFromDelivery,
  deliveryOrderStatusPayloadSchema,
  sendDeliveryCodeFromDelivery,
} from '../lib/applyOrderStatusFromDelivery';

export async function updateOrderStatusInternal(req: Request, res: Response, next: NextFunction) {
  try {
    const body = deliveryOrderStatusPayloadSchema.parse(req.body);
    const result = await applyOrderStatusFromDelivery(body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

const socketEmitSchema = z.object({
  room: z.string(),
  event: z.string(),
  payload: z.any(),
});

/** ADR 0004 — HTTP-relay fallback for the delivery service's EventPublisher when no
 *  shared Redis adapter is configured. */
export async function emitSocketInternal(req: Request, res: Response, next: NextFunction) {
  try {
    const { room, event, payload } = socketEmitSchema.parse(req.body);
    getIo().to(room).emit(event, payload);
    return success(res, { emitted: true });
  } catch (err) {
    next(err);
  }
}

const deliveryCodeSchema = z.object({
  orderId: z.string().min(1),
  code: z.string().regex(/^\d{4,8}$/),
});

/** Delivery service creates the OTP hash; core owns SMS + customer socket/push fan-out. */
export async function sendDeliveryCodeInternal(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId, code } = deliveryCodeSchema.parse(req.body);
    await sendDeliveryCodeFromDelivery({ orderId, code });
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    if (!order) throw new AppError('Order not found', 404);
    return success(res, { sent: true, orderNumber: order.orderNumber });
  } catch (err) {
    next(err);
  }
}
