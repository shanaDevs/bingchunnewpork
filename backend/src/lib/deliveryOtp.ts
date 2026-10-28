import crypto from 'crypto';
import { prisma } from './prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import {
  sendDeliveryCodeSms,
  sendDeliveryStartedSms,
  type DeliveryStartedSmsDriver,
} from '../integrations/smsAdapter';
import { notifyDeliveryCode } from './customerNotifications';
import { getAssignedDriverPublic } from './liveDriverTracking';

const MAX_OTP_ATTEMPTS = 5;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code: string): string {
  return crypto.createHmac('sha256', config.otpPepper).update(code).digest('hex');
}

export type CreateDeliveryOtpOptions = {
  /** When set, SMS includes rider pickup + vehicle details (start-run SMS). */
  startedByDriverId?: string | null;
};

/**
 * Create a delivery OTP for an order and deliver the plaintext to the customer
 * (SMS + in-app notification). Only the hash is persisted.
 */
export async function createDeliveryOtp(
  orderId: string,
  options: CreateDeliveryOtpOptions = {},
): Promise<void> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60_000);

  await prisma.deliveryOtp.create({
    data: { orderId, codeHash, expiresAt },
  });

  if (config.nodeEnv !== 'production') {
    logger.info(`[dev-only] Delivery OTP for order ${orderId}: ${code}`);
  }

  await sendCodeToCustomer(orderId, code, options.startedByDriverId);
}

async function sendCodeToCustomer(
  orderId: string,
  code: string,
  startedByDriverId?: string | null,
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        guestPhone: true,
        user: { select: { phone: true } },
      },
    });
    if (!order) return;

    const phone = order.guestPhone || order.user?.phone;
    if (phone) {
      let driverSms: DeliveryStartedSmsDriver | null = null;
      if (startedByDriverId) {
        const driver = await getAssignedDriverPublic(startedByDriverId);
        if (driver) {
          driverSms = {
            name: driver.name,
            phone: driver.phone,
            vehicleType: driver.vehicleType,
            vehicleNumber: driver.vehicleNumber,
            vehicleColor: driver.vehicleColor,
          };
        }
      }

      if (driverSms) {
        await sendDeliveryStartedSms(phone, order.orderNumber, code, driverSms).catch((err) =>
          logger.error('Failed to SMS delivery-started code', err),
        );
      } else {
        await sendDeliveryCodeSms(phone, order.orderNumber, code).catch((err) =>
          logger.error('Failed to SMS delivery code', err),
        );
      }
    }

    await notifyDeliveryCode({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      code,
    });
  } catch (err) {
    logger.error('Failed to deliver OTP to customer', err);
  }
}

/**
 * A branch requires the customer code when the global baseline is on, or when
 * the branch opts in. Used by both enforcement and the driver app payload.
 */
export function isOtpRequiredForStore(store?: { deliveryOtpRequired?: boolean } | null): boolean {
  return config.deliveryOtpRequiredDefault || !!store?.deliveryOtpRequired;
}

/** Create an OTP only if there isn't already a live (unverified, unexpired) one. */
export async function ensureOtpForOrder(
  orderId: string,
  options: CreateDeliveryOtpOptions = {},
): Promise<void> {
  const active = await prisma.deliveryOtp.findFirst({
    where: { orderId, verifiedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (active) {
    // Already issued — rotate so start-run SMS can include plaintext PIN + rider details.
    if (options.startedByDriverId) {
      await prisma.deliveryOtp.updateMany({
        where: { orderId, verifiedAt: null },
        data: { expiresAt: new Date(0) },
      });
      await createDeliveryOtp(orderId, options);
    }
    return;
  }
  await createDeliveryOtp(orderId, options);
}

export async function hasVerifiedOtp(orderId: string): Promise<boolean> {
  const otp = await prisma.deliveryOtp.findFirst({
    where: { orderId, verifiedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  return !!otp;
}

export async function verifyDeliveryOtp(orderId: string, code: string): Promise<void> {
  const digits = String(code).replace(/\D/g, '');
  const otp = await prisma.deliveryOtp.findFirst({
    where: { orderId, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw new AppError('No pending OTP for this order', 404, 'OTP_NOT_FOUND');

  if (otp.expiresAt < new Date()) {
    throw new AppError('OTP has expired — ask for a new code', 400, 'OTP_EXPIRED');
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts — OTP locked', 429, 'OTP_LOCKED');
  }

  if (!digits || hashCode(digits) !== otp.codeHash) {
    await prisma.deliveryOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError('Incorrect OTP code', 400, 'OTP_INVALID');
  }

  await prisma.deliveryOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
  const { clearLiveDeliveryCode } = await import('./deliveryCodeLive');
  await clearLiveDeliveryCode(orderId).catch(() => {});
}

/** Verify inline OTP from the status PUT body when the branch requires OTP. */
export async function requireOtpIfNeeded(
  orderId: string,
  storeId: string,
  otp: string | undefined,
): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { deliveryOtpRequired: true },
  });
  if (!isOtpRequiredForStore(store)) {
    if (otp?.trim()) await verifyDeliveryOtp(orderId, otp);
    return;
  }

  if (await hasVerifiedOtp(orderId)) return;

  if (!otp) {
    await ensureOtpForOrder(orderId).catch(() => {});
    throw new AppError('Ask the customer for their delivery code', 400, 'OTP_REQUIRED');
  }
  await verifyDeliveryOtp(orderId, otp);
}
