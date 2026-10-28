import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, type DeliveryAttemptOutcome } from '@bingchun/db';
import { invalidateJobRoute } from '@bingchun/delivery-domain';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { formatJobOrder, fetchDriverComplaintsByOrderIds, jobOrdersWithDetails, maybeEnterReturningPhase, heldJobStatuses, jobHasPickedUp, REJECT_JOB_BEFORE_FAILURE_MESSAGE } from '../lib/deliveryJobHelpers';
import { enqueueOrderStatusOutbox } from '../lib/outbox';
import { ensureOtpForOrder, hasVerifiedOtp, verifyDeliveryOtp, createDeliveryOtp, isOtpRequiredForStore, assertOtpForDelivery } from '../lib/otp';
import { getEventPublisher } from '../sockets/eventPublisher';
import { getDriverAccessibleStoreIds } from '../lib/driverAccess';
import { recordSuccessfulDelivery } from '../lib/meritPoints';

async function requireAccessibleStores(driverId: string, jwtStoreId?: string | null): Promise<string[]> {
  const ids = await getDriverAccessibleStoreIds(driverId, jwtStoreId);
  if (ids.length === 0) throw new AppError('Driver account is not linked to a branch', 403);
  return ids;
}

async function getActiveJobOrderLink(orderId: string, driverId: string, accessibleStoreIds: string[]) {
  const link = await prisma.deliveryJobOrder.findFirst({
    where: {
      orderId,
      job: {
        driverId,
        storeId: { in: accessibleStoreIds },
        status: { in: await heldJobStatuses() },
      },
    },
    include: {
      order: jobOrdersWithDetails.include.order,
      job: true,
    },
  });
  if (!link) throw new AppError('Order not in your active job', 404);
  return link;
}

async function isStoreOtpRequired(storeId: string): Promise<boolean> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { deliveryOtpRequired: true } });
  return isOtpRequiredForStore(store);
}

function mapFailureNoteToOutcome(note?: string): DeliveryAttemptOutcome {
  const n = (note || '').toLowerCase();
  if (n.includes('not available') || n.includes('cannot contact') || n.includes('unreachable')) {
    return 'CUSTOMER_UNREACHABLE';
  }
  if (n.includes('address') || n.includes('wrong')) return 'WRONG_ADDRESS';
  if (n.includes('refused')) return 'REFUSED';
  if (n.includes('payment')) return 'PAYMENT_FAILED';
  return 'OTHER';
}

const OUTCOMES = [
  'CUSTOMER_UNREACHABLE',
  'WRONG_ADDRESS',
  'REFUSED',
  'PAYMENT_FAILED',
  'OTHER',
] as const;

const driverStatusSchema = z
  .object({
    status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED']),
    note: z.string().max(250).optional(),
    otp: z.string().optional(),
    outcome: z.enum(OUTCOMES).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status !== 'DELIVERY_FAILED') return;
    const outcome = data.outcome ?? (data.note ? mapFailureNoteToOutcome(data.note) : undefined);
    if (!outcome) {
      ctx.addIssue({ code: 'custom', message: 'Failure outcome is required', path: ['outcome'] });
      return;
    }
    if (outcome === 'OTHER') {
      const note = (data.note || '').trim();
      if (note.length < 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'Reason is required when outcome is Other',
          path: ['note'],
        });
      }
    }
  });

/** Ownership-checked single order fetch for the driver app Order Detail screen. */
export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const orderId = req.params.orderId as string;

    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        orderId,
        job: {
          storeId: { in: accessibleStoreIds },
          OR: [
            { driverId, status: { in: [...(await heldJobStatuses()), 'COMPLETED'] } },
            { status: 'SCHEDULED', driverId: null },
          ],
        },
      },
      include: {
        order: jobOrdersWithDetails.include.order,
        job: { select: { id: true, driverId: true, status: true, storeId: true } },
      },
    });
    if (!link) throw new AppError('Order not found', 404);

    const isMine = link.job.driverId === driverId;
    const failed = await prisma.deliveryAttempt.findFirst({
      where: { orderId, jobId: link.jobId, outcome: { not: 'DELIVERED' } },
      select: { id: true },
    });
    const otpRequired = await isStoreOtpRequired(link.job.storeId);
    const complaints = isMine
      ? ((await fetchDriverComplaintsByOrderIds(driverId, [orderId])).get(orderId) ?? [])
      : [];

    return success(res, {
      ...formatJobOrder(link.order as any, link.sequence, {
        redactCustomer: !isMine,
        redactPricing: true,
      }),
      jobId: link.jobId,
      jobStatus: link.job.status,
      deliveryOtpRequired: otpRequired,
      deliveryFailed: !!failed,
      complaints,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const body = driverStatusSchema.parse(req.body);
    const { status, note, otp } = body;
    const orderId = req.params.orderId as string;

    const link = await getActiveJobOrderLink(orderId, driverId, accessibleStoreIds);
    const existing = link.order;
    const jobStoreId = link.job.storeId;

    if (status === 'DELIVERED' && link.job.status !== 'IN_PROGRESS') {
      throw new AppError('Start the run before marking stops delivered', 400);
    }

    if (status === 'DELIVERY_FAILED') {
      if (
        (link.job.status === 'ASSIGNED' || link.job.status === 'QUEUED') &&
        !(await jobHasPickedUp(link.job.id, link.job.status))
      ) {
        throw new AppError(REJECT_JOB_BEFORE_FAILURE_MESSAGE, 400);
      }
      if (!['PENDING', 'READY', 'OUT_FOR_DELIVERY', 'RECEIVED', 'PREPARING'].includes(existing.status)) {
        throw new AppError(`Cannot report failure from ${existing.status}`, 400);
      }
      const prior = await prisma.deliveryAttempt.count({ where: { orderId, jobId: link.jobId } });
      const outcome = (body.outcome ?? mapFailureNoteToOutcome(note)) as DeliveryAttemptOutcome;
      await prisma.deliveryAttempt.create({
        data: {
          orderId,
          jobId: link.jobId,
          driverId,
          attemptNo: prior + 1,
          outcome,
          note: note ?? outcome,
        },
      });
      await prisma.deliveryEvent.create({
        data: {
          orderId,
          jobId: link.jobId,
          driverId,
          state: 'FAILED',
          note: note ? `Delivery failed: ${note}` : `Delivery failed: ${outcome}`,
        },
      });
      invalidateJobRoute(link.jobId);
      await maybeEnterReturningPhase(link.jobId);

      getEventPublisher()
        .publish(`store:${jobStoreId}`, 'deliveryJobUpdated', {
          jobId: link.jobId,
          orderId,
          status: 'DELIVERY_FAILED',
        })
        .catch(() => {});

      return success(res, {
        ...formatJobOrder(existing as any, link.sequence, { redactPricing: true }),
        deliveryFailed: true,
      });
    }

    const allowed =
      (status === 'OUT_FOR_DELIVERY' && ['PENDING', 'READY', 'RECEIVED', 'PREPARING'].includes(existing.status)) ||
      (status === 'DELIVERED' && ['PENDING', 'READY', 'OUT_FOR_DELIVERY', 'RECEIVED', 'PREPARING'].includes(existing.status));
    if (!allowed) throw new AppError(`Cannot change status from ${existing.status} to ${status}`, 400);

    if (status === 'DELIVERED') {
      await assertOtpForDelivery(orderId, jobStoreId, otp);
    }

    await enqueueOrderStatusOutbox({
      orderId,
      status,
      note,
      orderNumber: existing.orderNumber,
      userId: existing.userId,
      orderMode: existing.orderMode,
    });

    const publisher = getEventPublisher();
    const statusPayload = {
      orderId,
      orderNumber: existing.orderNumber,
      status,
      note,
    };
    void publisher.publish(`order:${orderId}`, 'orderStatus', statusPayload);
    void publisher.publish(`order:${existing.orderNumber}`, 'orderStatus', statusPayload);
    if (existing.userId) {
      void publisher.publish(`user:${existing.userId}`, 'orderStatusUpdate', statusPayload);
    }

    await prisma.deliveryEvent.create({
      data: {
        orderId,
        jobId: link.jobId,
        driverId,
        state: status === 'DELIVERED' ? 'DELIVERED' : 'EN_ROUTE',
        note: note ?? 'Updated by driver',
      },
    });

    if (status === 'DELIVERED') {
      await recordSuccessfulDelivery(driverId, orderId).catch(() => {});
    }

    invalidateJobRoute(link.jobId);
    await maybeEnterReturningPhase(link.jobId);

    getEventPublisher()
      .publish(`store:${jobStoreId}`, 'deliveryJobUpdated', { jobId: link.jobId, orderId, status })
      .catch(() => {});

    return success(res, {
      ...formatJobOrder(existing as any, link.sequence, { redactPricing: true }),
      status,
      deliveryFailed: false,
    });
  } catch (err) {
    next(err);
  }
}

const otpVerifySchema = z.object({ code: z.string().min(4).max(8) });

/** Issue a fresh delivery code and send it to the customer. */
export async function resendOrderOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const orderId = req.params.orderId as string;

    await getActiveJobOrderLink(orderId, driverId, accessibleStoreIds);
    await createDeliveryOtp(orderId);
    return success(res, { sent: true });
  } catch (err) {
    next(err);
  }
}

export async function verifyOrderOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const { code } = otpVerifySchema.parse(req.body);
    const orderId = req.params.orderId as string;

    await getActiveJobOrderLink(orderId, driverId, accessibleStoreIds);
    await verifyDeliveryOtp(orderId, code);

    return success(res, { verified: true });
  } catch (err) {
    next(err);
  }
}

const arriveSchema = z.object({ lat: z.number().optional(), lng: z.number().optional() });

export async function arriveAtOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    arriveSchema.parse(req.body ?? {});
    const orderId = req.params.orderId as string;
    const link = await getActiveJobOrderLink(orderId, driverId, accessibleStoreIds);
    const jobStoreId = link.job.storeId;

    await prisma.deliveryEvent.create({
      data: { orderId, jobId: link.jobId, driverId, state: 'ARRIVED', note: 'Driver arrived at delivery location' },
    });

    const otpRequired = await isStoreOtpRequired(jobStoreId);
    if (otpRequired) {
      await ensureOtpForOrder(orderId);
      await prisma.deliveryEvent.create({
        data: { orderId, jobId: link.jobId, driverId, state: 'AWAITING_OTP', note: 'OTP required for this branch' },
      });
    }

    return success(res, { arrived: true, otpRequired });
  } catch (err) {
    next(err);
  }
}

const attemptSchema = z
  .object({
    outcome: z.enum(['DELIVERED', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'REFUSED', 'PAYMENT_FAILED', 'OTHER']),
    note: z.string().max(250).optional(),
    photoUrl: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    returnToStore: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.outcome === 'OTHER' && !(data.note || '').trim()) {
      ctx.addIssue({ code: 'custom', message: 'Reason is required when outcome is Other', path: ['note'] });
    }
  });

export async function createDeliveryAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const body = attemptSchema.parse(req.body);
    const orderId = req.params.orderId as string;
    const link = await getActiveJobOrderLink(orderId, driverId, accessibleStoreIds);
    const existing = link.order;
    const jobStoreId = link.job.storeId;

    if (body.outcome === 'DELIVERED' && (await isStoreOtpRequired(jobStoreId))) {
      if (!(await hasVerifiedOtp(orderId))) {
        throw new AppError('OTP verification required before marking delivered', 400, 'OTP_REQUIRED');
      }
    }

    const attemptCount = await prisma.deliveryAttempt.count({ where: { orderId } });

    const attempt = await prisma.deliveryAttempt.create({
      data: {
        orderId,
        jobId: link.jobId,
        driverId,
        attemptNo: attemptCount + 1,
        outcome: body.outcome,
        note: body.note,
        photoUrl: body.photoUrl,
        lat: body.lat,
        lng: body.lng,
      },
    });

    if (body.outcome === 'DELIVERED') {
      await enqueueOrderStatusOutbox({
        orderId,
        status: 'DELIVERED',
        note: body.note,
        orderNumber: existing.orderNumber,
        userId: existing.userId,
        orderMode: existing.orderMode,
      });
      await prisma.deliveryEvent.create({
        data: { orderId, jobId: link.jobId, driverId, state: 'DELIVERED', note: body.note ?? 'Delivered with proof' },
      });
      await recordSuccessfulDelivery(driverId, orderId).catch(() => {});
    } else {
      const state = body.returnToStore ? ('RETURNED_TO_STORE' as const) : ('FAILED' as const);
      await prisma.deliveryEvent.create({
        data: {
          orderId,
          jobId: link.jobId,
          driverId,
          state,
          note: body.note ?? `Delivery attempt failed: ${body.outcome}`,
        },
      });
    }

    invalidateJobRoute(link.jobId);
    await maybeEnterReturningPhase(link.jobId);

    return success(res, { id: attempt.id, orderId, jobId: link.jobId, attemptNo: attempt.attemptNo, outcome: attempt.outcome }, 201);
  } catch (err) {
    next(err);
  }
}
