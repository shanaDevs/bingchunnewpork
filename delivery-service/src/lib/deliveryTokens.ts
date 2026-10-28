import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface DeliveryAccessPayload {
  sub: string;
  type: 'admin';
  role: 'DELIVERY_DRIVER';
  storeId: string;
  sv?: number;
}

export interface DeliveryRefreshPayload {
  sub: string;
  type: 'admin';
  role: 'DELIVERY_DRIVER';
  deviceId: string;
  jti: string;
}

/** Same shape as backend's signDeliveryToken so tokens are interchangeable, but with the
 *  M7 12h access-token lifetime instead of the legacy 7d one. */
export function signDeliveryAccessToken(driverId: string, storeId: string, sessionVersion = 0): string {
  const payload: DeliveryAccessPayload = {
    sub: driverId,
    type: 'admin',
    role: 'DELIVERY_DRIVER',
    storeId,
    sv: sessionVersion,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtDeliveryAccessExpiresIn });
}

export function signDeliveryRefreshToken(driverId: string, deviceId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const payload: DeliveryRefreshPayload = { sub: driverId, type: 'admin', role: 'DELIVERY_DRIVER', deviceId, jti };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (jwt.sign as any)(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtDeliveryRefreshExpiresIn,
  });
  return { token, jti };
}

export function verifyDeliveryRefreshToken(token: string): DeliveryRefreshPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as DeliveryRefreshPayload;
}

export async function hashRefreshToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

export async function compareRefreshToken(token: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(token, hash);
}
