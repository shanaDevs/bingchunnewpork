import crypto from 'crypto';
import { deliveryTableSql, prisma } from '@bingchun/db';

/** Prefer delivery schema; unqualified fallback works when search_path includes delivery. */
const CODE_LIVE = deliveryTableSql('delivery_code_live');
import { config } from '../config';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { postDeliveryCodeToCore } from '../internal/coreClient';

const MAX_OTP_ATTEMPTS = 5;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code: string): string {
  return crypto.createHmac('sha256', config.otpPepper).update(code).digest('hex');
}

/** Create (or refresh) a delivery OTP for an order and deliver the plaintext to the customer.
 *  Only the hash is persisted. SMS uses the same mock/log path until a real provider is wired. */
export async function createDeliveryOtp(orderId: string): Promise<void> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60_000);

  await prisma.deliveryOtp.create({
    data: { orderId, codeHash, expiresAt },
  });

  await deliverCodeToCustomer(orderId, code).catch((err) =>
    logger.error('Failed to deliver OTP to customer', err),
  );
}

async function deliverCodeToCustomer(orderId: string, code: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      guestPhone: true,
      user: { select: { phone: true } },
    },
  });
  if (!order) return;

  const phone = order.guestPhone || order.user?.phone;
  logger.info(
    `[OTP] Created delivery code for #${order.orderNumber}` +
      (phone ? ` → ${phone}` : ' (no phone on order)'),
  );

  // Core owns customer socket + push + SMS mock so the track page can show the code.
  const result = await postDeliveryCodeToCore({ orderId: order.id, code });
  if (!result.ok) {
    logger.error(
      `Failed to fan-out delivery code for #${order.orderNumber}: HTTP ${result.status} ${result.text}`,
    );
    // Fallback log so ops can still read the code from delivery-service logs.
    logger.info(`[OTP FALLBACK] #${order.orderNumber} code=${code}`);
  }
}

/** Create an OTP only if there isn't already a live (unverified, unexpired) one. */
export async function ensureOtpForOrder(orderId: string): Promise<void> {
  const active = await prisma.deliveryOtp.findFirst({
    where: { orderId, verifiedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (active) return;
  await createDeliveryOtp(orderId);
}

export async function hasVerifiedOtp(orderId: string): Promise<boolean> {
  const otp = await prisma.deliveryOtp.findFirst({
    where: { orderId, verifiedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  return !!otp;
}

export function isOtpRequiredForStore(store?: { deliveryOtpRequired?: boolean } | null): boolean {
  return config.deliveryOtpRequiredDefault || !!store?.deliveryOtpRequired;
}

function normaliseOtp(code: string): string {
  return String(code).replace(/\D/g, '');
}

export async function verifyDeliveryOtp(orderId: string, code: string): Promise<void> {
  const digits = normaliseOtp(code);
  const otp = await prisma.deliveryOtp.findFirst({
    where: { orderId, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw new AppError('No pending OTP for this order', 404, 'OTP_NOT_FOUND');

  if (otp.expiresAt < new Date()) {
    throw new AppError('OTP has expired — ask the driver to resend', 400, 'OTP_EXPIRED');
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts — OTP locked', 429, 'OTP_LOCKED');
  }

  if (!digits || hashCode(digits) !== otp.codeHash) {
    await prisma.deliveryOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError('Incorrect OTP code', 400, 'OTP_INVALID');
  }

  await prisma.deliveryOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });

  await prisma
    .$executeRawUnsafe(`DELETE FROM ${CODE_LIVE} WHERE "orderId" = $1`, orderId)
    .catch(() => {});
}

/** Enforce the customer code on DELIVERED. A typed code is always checked. */
export async function assertOtpForDelivery(
  orderId: string,
  storeId: string,
  otp: string | undefined,
): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { deliveryOtpRequired: true },
  });
  const required = isOtpRequiredForStore(store);
  const typed = otp?.trim();

  if (!required) {
    if (typed) await verifyDeliveryOtp(orderId, typed);
    return;
  }
  if (await hasVerifiedOtp(orderId)) return;
  if (!typed) {
    await ensureOtpForOrder(orderId).catch(() => {});
    throw new AppError('Ask the customer for their delivery code', 400, 'OTP_REQUIRED');
  }
  await verifyDeliveryOtp(orderId, typed);
}
