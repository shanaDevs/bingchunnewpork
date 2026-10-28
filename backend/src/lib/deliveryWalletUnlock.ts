import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { config } from '../config';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

export const DELIVERY_WALLET_UNLOCK_TYPE = 'delivery_wallet_unlock';
export const DELIVERY_WALLET_UNLOCK_HEADER = 'x-delivery-wallet-unlock';
export const DELIVERY_WALLET_UNLOCK_EXPIRES_IN = '8h';

type UnlockPayload = {
  sub: string;
  type: typeof DELIVERY_WALLET_UNLOCK_TYPE;
};

export function signDeliveryWalletUnlockToken(adminId: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(
    { sub: adminId, type: DELIVERY_WALLET_UNLOCK_TYPE } satisfies UnlockPayload,
    config.jwtSecret,
    { expiresIn: DELIVERY_WALLET_UNLOCK_EXPIRES_IN },
  );
}

export function verifyDeliveryWalletUnlockToken(token: string, adminId: string): void {
  let payload: UnlockPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as UnlockPayload;
  } catch {
    throw new AppError('Delivery wallet PIN required', 401);
  }
  if (payload.type !== DELIVERY_WALLET_UNLOCK_TYPE || payload.sub !== adminId) {
    throw new AppError('Delivery wallet PIN required', 401);
  }
}

export async function assertActiveSystemAdmin(adminId: string | undefined): Promise<void> {
  if (!adminId) throw new AppError('Forbidden', 403);
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { isActive: true, role: { select: { name: true } } },
  });
  if (!admin?.isActive || admin.role.name !== 'SYSTEM_ADMIN') {
    throw new AppError('Forbidden', 403);
  }
}

/** Require an active super-admin session (role + DB check). */
export async function requireSystemAdminFromRequest(req: Request) {
  const user = req.user;
  if (user?.role !== 'SYSTEM_ADMIN') {
    throw new AppError('Forbidden', 403);
  }
  await assertActiveSystemAdmin(user.sub);
  return user;
}
