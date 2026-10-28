import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { AppError } from './errorHandler';
import { readAdminAccessCookie, assertAdminCsrf } from '../lib/adminCookies';
import { readCustomerAccessCookie, assertCustomerCsrf } from '../lib/customerCookies';

export const SESSION_SUPERSEDED = 'SESSION_SUPERSEDED';

export interface JwtPayload {
  sub: string;
  type: 'user' | 'admin';
  role?: string;
  storeId?: string;
  /** Rider session version. Missing on pre-single-session tokens (treated as 0). */
  sv?: number;
  /** Customer token version. Missing tokens are treated as 0. */
  tv?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function tokenSessionVersion(payload: { sv?: number }): number {
  return typeof payload.sv === 'number' ? payload.sv : 0;
}

/** Reject rider JWTs that were superseded by a later PIN login on another device. */
export async function assertDriverSession(payload: JwtPayload): Promise<void> {
  if (payload.role !== 'DELIVERY_DRIVER') return;
  const tokenSv = tokenSessionVersion(payload);
  const row = await prisma.adminUser.findUnique({
    where: { id: payload.sub },
    select: { sessionVersion: true },
  });
  if (!row || row.sessionVersion !== tokenSv) {
    throw new AppError('Signed in on another device', 401, SESSION_SUPERSEDED);
  }
}

async function applyVerifiedToken(req: Request, token: string, fromCookie: boolean): Promise<void> {
  const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
  if (payload.type === 'user') {
    const { readUserTokenVersion } = await import('../lib/userSession');
    const tv = await readUserTokenVersion(payload.sub);
    if ((payload.tv ?? 0) !== tv) throw new AppError('Invalid or expired token', 401);
  }
  if (payload.role === 'DELIVERY_DRIVER') {
    await assertDriverSession(payload);
  }
  if (fromCookie && payload.type === 'admin') {
    assertAdminCsrf(req);
  }
  if (fromCookie && payload.type === 'user') {
    assertCustomerCsrf(req);
  }
  req.user = payload;
}

function readAccessTokenFromRequest(req: Request, hasBearer: boolean, bearerToken: string): string | null {
  if (hasBearer) return bearerToken;
  return readAdminAccessCookie(req) || readCustomerAccessCookie(req);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const hasBearer = typeof header === 'string' && header.startsWith('Bearer ');
  const token = readAccessTokenFromRequest(req, hasBearer, hasBearer ? header.slice(7) : '');
  if (!hasBearer && !token) return next(new AppError('Unauthorised', 401, 'UNAUTHENTICATED'));

  try {
    await applyVerifiedToken(req, token || '', !hasBearer);
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Invalid or expired token', 401, 'TOKEN_EXPIRED'));
    }
    next(new AppError('Invalid or expired token', 401));
  }
}

/** Block soft-deleted or banned customer accounts from ordering and other app features. */
export async function requireActiveCustomer(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== 'user') throw new AppError('Unauthorised', 401);
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { deletedAt: true, bannedAt: true, bannedReason: true },
  });
  if (!user) throw new AppError('Unauthorised', 401);
  if (user.bannedAt) {
    throw new AppError(
      `This account has been suspended: ${user.bannedReason || 'Please contact support.'}`,
      403,
      'ACCOUNT_BANNED',
    );
  }
  if (user.deletedAt) {
    throw new AppError(
      'This account has been deleted. You can only access your profile.',
      403,
      'ACCOUNT_DELETED',
    );
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const hasBearer = !!header?.startsWith('Bearer ');
  const token = readAccessTokenFromRequest(req, hasBearer, hasBearer ? header!.slice(7) : '');
  if (!token) return next();

  return applyVerifiedToken(req, token, !hasBearer)
    .catch(() => undefined)
    .finally(() => next());
}

export const KNOWN_ROLES = Object.freeze(
  new Set(['SYSTEM_ADMIN', 'STORE_MANAGER', 'CASHIER', 'DELIVERY_ADMIN', 'DELIVERY_DRIVER']),
);

export function isKnownRole(role?: string): boolean {
  return !!role && KNOWN_ROLES.has(role);
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.type !== 'admin' || req.user.role === 'DELIVERY_DRIVER') {
      throw new AppError('Forbidden', 403);
    }
    if (!isKnownRole(req.user.role)) throw new AppError('Forbidden', 403);

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.user.sub },
      select: { isActive: true, role: { select: { name: true } } },
    });
    if (!admin || !admin.isActive || admin.role.name !== req.user.role) {
      throw new AppError('Forbidden', 403);
    }

    next();
  } catch (err) {
    next(err);
  }
}

const BRANCH_SCOPED_ROLES = new Set(['STORE_MANAGER', 'CASHIER']);

export function isBranchScopedRole(role?: string): boolean {
  return !!role && BRANCH_SCOPED_ROLES.has(role);
}

/** Roles that see every branch rather than a single linked store. */
const ALL_BRANCH_ROLES = new Set(['SYSTEM_ADMIN', 'DELIVERY_ADMIN']);

export function isAllBranchRole(role?: string): boolean {
  return !!role && ALL_BRANCH_ROLES.has(role);
}

/**
 * Driver onboarding: super admin or delivery admin only. Stack this in front of
 * `requirePermission('DELIVERY', …)` — the permission alone is too broad, since
 * branch managers and cashiers hold DELIVERY by default.
 */
export function requireSystemOrDeliveryAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== 'admin' || !isAllBranchRole(req.user.role)) {
    throw new AppError('Forbidden', 403);
  }
  next();
}

export function blockCashier(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === 'CASHIER') throw new AppError('Forbidden', 403);
  next();
}

export async function requireSystemAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.user.sub },
      select: { isActive: true, role: { select: { name: true } } },
    });
    if (!admin || !admin.isActive || admin.role.name !== 'SYSTEM_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function requireStoreManager(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== 'admin') throw new AppError('Forbidden', 403);
  if (req.user.role !== 'STORE_MANAGER' && req.user.role !== 'SYSTEM_ADMIN') {
    throw new AppError('Forbidden', 403);
  }
  next();
}

/** Branch admin (STORE_MANAGER) only — excludes Super Admin. */
export function requireBranchAdminOnly(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== 'admin' || req.user.role !== 'STORE_MANAGER') {
    throw new AppError('Forbidden', 403);
  }
  next();
}

export function requireDeliveryDriver(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== 'admin') return next(new AppError('Forbidden', 403));
  if (req.user.role !== 'DELIVERY_DRIVER') return next(new AppError('Delivery driver access only', 403));
  next();
}

/** Resolve branch store id from the admin record (source of truth — not stale JWT). */
export async function resolveBranchStoreId(req: Request): Promise<string | null> {
  if (!isBranchScopedRole(req.user?.role)) return null;
  if (!req.user.sub) return null;

  const admin = await prisma.adminUser.findUnique({
    where: { id: req.user.sub },
    select: { storeId: true, role: { select: { name: true } }, isActive: true },
  });
  if (!admin || !isBranchScopedRole(admin.role.name) || !admin.isActive) return null;

  const storeId = admin.storeId ?? null;
  if (storeId) req.user.storeId = storeId;
  return storeId;
}

export async function requireBranchStoreId(req: Request): Promise<string> {
  const storeId = await resolveBranchStoreId(req);
  if (!storeId) throw new AppError('Branch not linked to your account', 403);
  return storeId;
}

export async function assertOrderStoreAccess(req: Request, orderStoreId: string) {
  if (!isKnownRole(req.user?.role)) throw new AppError('Forbidden', 403);
  if (!isBranchScopedRole(req.user?.role)) return;
  const storeId = await resolveBranchStoreId(req);
  if (!storeId) {
    throw new AppError('Branch not linked to your account', 403);
  }
  if (storeId !== orderStoreId) {
    throw new AppError('You can only manage orders for your branch', 403);
  }
}

/** Order mutations are branch-operations only — super admin oversight is read-only. */
export function requireBranchOrderWrite(req: Request, _res: Response, next: NextFunction) {
  if (!isBranchScopedRole(req.user?.role)) {
    throw new AppError('Only branch staff can modify orders', 403);
  }
  next();
}

export function signToken(
  sub: string,
  type: 'user' | 'admin',
  role?: string,
  storeId?: string,
  tokenVersion = 0,
): string {
  const payload = type === 'user'
    ? { sub, type, tv: tokenVersion }
    : { sub, type, role, storeId };
  if (type === 'user') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtUserExpiresIn });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function signDeliveryToken(sub: string, storeId: string, sessionVersion = 0): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(
    { sub, type: 'admin', role: 'DELIVERY_DRIVER', storeId, sv: sessionVersion },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function signRefreshToken(
  sub: string,
  tokenVersion = 0,
  jti?: string,
  familyId?: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(
    { sub, type: 'user', tv: tokenVersion, jti, fam: familyId },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtUserRefreshExpiresIn },
  );
}

export function signAdminRefreshToken(sub: string, tokenVersion = 0): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(
    { sub, type: 'admin', tokenVersion },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn },
  );
}

