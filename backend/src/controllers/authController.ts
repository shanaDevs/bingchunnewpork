import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  signToken,
  signAdminRefreshToken,
  signDeliveryToken,
  isBranchScopedRole,
} from '../middleware/auth';
import { issueCustomerTokens, rotateCustomerRefresh, revokeUserSessions } from '../lib/userSession';
import { completePasswordReset, passwordResetGenericMessage, requestPasswordReset } from '../lib/passwordReset';
import {
  assertAdminCsrf,
  clearAdminAuthCookies,
  readAdminAccessCookie,
  readAdminRefreshCookie,
} from '../lib/adminCookies';
import { respondWithAdminAuthCookies } from '../lib/adminAuthResponse';
import {
  assertCustomerCsrf,
  clearCustomerAuthCookies,
  readCustomerRefreshCookie,
} from '../lib/customerCookies';
import { respondWithCustomerAuth, respondWithCustomerRefresh } from '../lib/customerAuthResponse';
import { accessExpiresAtMsFromToken } from '../lib/jwtExpiry';
import { sendOtp } from '../integrations/smsAdapter';
import { success, error } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';
import jwt from 'jsonwebtoken';
import { isSocialPlaceholderPhone, normalizePhone, phoneLookupVariants } from '../utils/phone';
import { findUserByPhone, toCustomerUserPayload, reactivateUserIfDeleted, archiveDeletedUserPhone, createFreshUserForPhone, type OtpIntent } from '../lib/userAccount';
import { incrementDriverSessionVersion } from '@bingchun/delivery-domain';
import {
  consumeDriverOtpChallenge,
  findDriverByPhone,
  generateDriverOtp,
  signDriverOtpChallenge,
  verifyDriverOtpChallenge,
} from '../lib/driverPhoneLogin';
import { linkDriverBranches } from '../lib/driverAccess';
import { revokeDriverSockets } from '../lib/socket';
import { applyReferralCodeToUser } from '../lib/referral';
import { hashLoginOtp, verifyLoginOtp } from '../lib/otpHash';
import { assertOtpAttemptsAllowed, recordFailedOtpAttempt, resetOtpAttempts } from '../lib/otpAttempts';
import { ensureAdminRoles, ensureAdminTokenVersionColumn } from '../lib/adminSchema';
import { randomInt } from 'crypto';

const INACTIVE_ADMIN_MESSAGE =
  'Access denied. Your account has been deactivated. Contact a super admin to restore access.';

function generateOtp() {
  return String(randomInt(100000, 1000000));
}

function customerAuthPayload(
  req: Request,
  res: Response,
  user: { id: string; [key: string]: unknown },
  tokens: { token: string; refreshToken: string },
) {
  return respondWithCustomerAuth(res, req, {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: toCustomerUserPayload(user as never),
    accessExpiresAt: accessExpiresAtMsFromToken(tokens.token),
  });
}

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^(?:\+94|0)[0-9]{9}$/, 'Invalid Sri Lankan phone number'),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  referralCode: z.string().max(32).optional(),
});

const loginSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
}).refine((d) => d.phone || d.email, 'Phone or email required');

const otpRequestSchema = z.object({
  phone: z.string().regex(/^(?:\+94|0)[0-9]{9}$/),
  referralCode: z.string().max(32).optional(),
  intent: z.enum(['login', 'recover', 'create_new']).optional(),
  /** Legacy Android SMS Retriever hash from the client; not included in the OTP SMS body. */
  appSignature: z.string().min(8).max(16).optional(),
});

const otpVerifySchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
  referralCode: z.string().max(32).optional(),
  intent: z.enum(['login', 'recover', 'create_new']).optional(),
  name: z.string().min(2).max(100).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) throw new AppError('Phone number already registered', 409);

    if (data.email) {
      const emailExists = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailExists) throw new AppError('Email already registered', 409);
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : null;

    const user = await prisma.user.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        passwordHash: passwordHash ?? undefined,
      },
    });

    await applyReferralCodeToUser(user.id, data.referralCode);

    const tokens = await issueCustomerTokens(user.id);

    return success(res, customerAuthPayload(req, res, user, tokens), 201);
  } catch (err) {
    next(err);
  }
}

function resolveLoginIdentifier(data: { phone?: string; email?: string }) {
  const identifier = data.email ?? data.phone;
  if (!identifier) return { field: null as null, value: null as null };

  if (data.email || identifier.includes('@')) {
    return { field: 'email' as const, value: identifier.toLowerCase() };
  }
  return { field: 'phone' as const, value: identifier };
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const data = loginSchema.parse(req.body);
    const { field, value } = resolveLoginIdentifier(data);

    let user = null;
    if (field === 'email') {
      user = await prisma.user.findUnique({ where: { email: value! } });
    } else if (field === 'phone') {
      user = await findUserByPhone(value!);
    }

    if (!user) {
      if (field === 'email') {
        const admin = await prisma.adminUser.findUnique({ where: { email: value! }, include: { role: true } });
        if (admin?.isActive) {
          const roleName = admin.role?.name;
          const roleLabel =
            roleName === 'STORE_MANAGER' ? 'Branch Admin'
            : roleName === 'CASHIER' ? 'Cashier'
            : 'Super Admin';
          throw new AppError(`This is a ${roleLabel} account. Please sign in at /admin/login`, 401);
        }
        if (admin && data.password && admin.passwordHash) {
          const valid = await bcrypt.compare(data.password, admin.passwordHash);
          if (valid) {
            throw new AppError(INACTIVE_ADMIN_MESSAGE, 403, 'ACCOUNT_INACTIVE');
          }
        }
      }
      throw new AppError('Invalid credentials', 401);
    }

    if (user.bannedAt) {
      throw new AppError(
        `This account has been suspended: ${user.bannedReason || 'Please contact support.'}`,
        403,
        'ACCOUNT_BANNED',
      );
    } else if (user.deletedAt) {
      throw new AppError(
        'This account has been deleted. Sign in with OTP and choose to recover your account or create a new one.',
        403,
        'ACCOUNT_DELETED',
      );
    } else if (data.password) {
      if (!user.passwordHash) throw new AppError('Password not set. Use OTP login.', 400);
      const valid = await bcrypt.compare(data.password, user.passwordHash);
      if (!valid) throw new AppError('Invalid credentials', 401);
    } else {
      throw new AppError('Password required. Use OTP login for passwordless sign-in.', 401);
    }

    const tokens = await issueCustomerTokens(user.id);

    return success(res, customerAuthPayload(req, res, user, tokens));
  } catch (err) {
    next(err);
  }
}

/** Validate phone format only; does not disclose registration or deletion status. */
export async function checkPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone } = z.object({
      phone: z.string().regex(/^(?:\+94|0)[0-9]{9}$/, 'Invalid Sri Lankan phone number'),
    }).parse(req.body);
    normalizePhone(rawPhone);
    return success(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

/** @deprecated Use POST /auth/otp/request then /auth/otp/verify — phone login requires OTP. */
const phoneLoginSchema = z.object({
  phone: z.string().regex(/^(?:\+94|0)[0-9]{9}$/, 'Invalid Sri Lankan phone number'),
  code: z.string().length(6),
  name: z.string().min(2).max(100).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  referralCode: z.string().max(32).optional(),
  intent: z.enum(['login', 'recover', 'create_new']).optional(),
});

export async function phoneLogin(req: Request, res: Response, next: NextFunction) {
  try {
    req.body = phoneLoginSchema.parse(req.body);
    return verifyOtp(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function linkGuestOrdersToUser(userId: string, phone: string) {
  const phoneVariants = phoneLookupVariants(phone);
  await prisma.order.updateMany({
    where: { userId: null, guestPhone: { in: phoneVariants } },
    data: { userId },
  });
}

async function resolveOtpUser(opts: {
  phone: string;
  intent?: OtpIntent;
}): Promise<{ user: { id: string; deletedAt: Date | null }; isNew: boolean }> {
  const { phone, intent = 'login' } = opts;
  let user = await findUserByPhone(phone);

  if (user?.bannedAt) {
    throw new AppError(
      `This account has been suspended: ${user.bannedReason || 'Please contact support.'}`,
      403,
      'ACCOUNT_BANNED',
    );
  }

  if (user?.deletedAt) {
    if (intent === 'recover') {
      return { user, isNew: false };
    }
    if (intent === 'create_new') {
      await archiveDeletedUserPhone(user.id);
      const freshUser = await createFreshUserForPhone(phone);
      return { user: freshUser, isNew: true };
    }
    throw new AppError(
      'This phone number belongs to a deleted account. Choose to recover your account or create a new one.',
      403,
      'ACCOUNT_DELETED',
    );
  }

  if (!user) {
    const freshUser = await createFreshUserForPhone(phone);
    return { user: freshUser, isNew: true };
  }

  return { user, isNew: false };
}

export async function requestOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone, referralCode, appSignature, intent } = otpRequestSchema.parse(req.body);
    const phone = normalizePhone(rawPhone);

    const { user, isNew } = await resolveOtpUser({ phone, intent });

    if (isNew || referralCode) {
      await applyReferralCodeToUser(user.id, referralCode);
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate any previous unused OTPs so only the newly sent code can verify.
    await prisma.otpRecord.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    await prisma.otpRecord.create({
      data: { userId: user.id, phone, code: hashLoginOtp(code, phone), expiresAt },
    });
    await resetOtpAttempts(phone);
    await sendOtp(phone, code, appSignature);

    return success(res, { message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone, code, referralCode, intent, name, email } = otpVerifySchema.parse(req.body);
    const phone = normalizePhone(rawPhone);
    const profileEmail = email === '' ? undefined : email?.trim();

    try {
      await assertOtpAttemptsAllowed(phone);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Too many OTP attempts', 429);
    }

    let user = await findUserByPhone(phone);
    if (!user) throw new AppError('User not found', 404);

    const otp = await prisma.otpRecord.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || !verifyLoginOtp(code, phone, otp.code)) {
      await recordFailedOtpAttempt(phone);
      throw new AppError('Invalid or expired OTP', 400);
    }

    await resetOtpAttempts(phone);
    await prisma.otpRecord.update({ where: { id: otp.id }, data: { used: true } });
    // Burn any other leftover unused codes for this user.
    await prisma.otpRecord.updateMany({
      where: { userId: user.id, used: false, id: { not: otp.id } },
      data: { used: true },
    });

    if (user.bannedAt) {
      throw new AppError(
        `This account has been suspended: ${user.bannedReason || 'Please contact support.'}`,
        403,
        'ACCOUNT_BANNED',
      );
    }

    if (user.deletedAt) {
      if (intent === 'recover') {
        user = await reactivateUserIfDeleted(user, {
          ...(name ? { name } : {}),
          ...(profileEmail ? { email: profileEmail } : {}),
        });
      } else {
        throw new AppError(
          'This account has been deleted. Choose to recover your account or create a new one.',
          403,
          'ACCOUNT_DELETED',
        );
      }
    }

    user = await prisma.user.update({ where: { id: user.id }, data: { isPhoneVerified: true } });
    await applyReferralCodeToUser(user.id, referralCode);
    await linkGuestOrdersToUser(user.id, phone);

    const tokens = await issueCustomerTokens(user.id);

    return success(res, customerAuthPayload(req, res, user, tokens));
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const bodyToken = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {}).refreshToken;
    if (!bodyToken) {
      assertCustomerCsrf(req);
    }
    const token = bodyToken || readCustomerRefreshCookie(req);
    if (!token) throw new AppError('Invalid token', 401);
    const payload = jwt.verify(token, config.jwtRefreshSecret) as { sub: string; type?: string };
    if (payload.type === 'admin') throw new AppError('Invalid token', 401);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new AppError('Invalid token', 401);
    if (user.bannedAt) {
      throw new AppError('This account has been suspended.', 403, 'ACCOUNT_BANNED');
    }
    if (user.deletedAt) throw new AppError('Invalid token', 401);

    const rotated = await rotateCustomerRefresh(payload as { sub: string; tv?: number; jti?: string; fam?: string });
    res.setHeader('Cache-Control', 'no-store');
    return success(
      res,
      respondWithCustomerRefresh(res, req, rotated, accessExpiresAtMsFromToken(rotated.token)),
    );
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    clearCustomerAuthCookies(res);
    return success(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.type !== 'user') throw new AppError('Unauthorised', 401);
    await revokeUserSessions(req.user.sub);
    clearCustomerAuthCookies(res);
    return success(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
}

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotSchema.parse(req.body);
    await requestPasswordReset(email, 'user');
    return success(res, { message: passwordResetGenericMessage() });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetSchema.parse(req.body);
    await completePasswordReset(token, password, 'user');
    return success(res, { reset: true });
  } catch (err) {
    next(err);
  }
}

export async function adminForgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotSchema.parse(req.body);
    await requestPasswordReset(email, 'admin');
    return success(res, { message: passwordResetGenericMessage() });
  } catch (err) {
    next(err);
  }
}

export async function adminResetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetSchema.parse(req.body);
    await completePasswordReset(token, password, 'admin');
    return success(res, { reset: true });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        loyaltyPoints: true,
        notifyEmail: true,
        notifySms: true,
        notifyPush: true,
        isPhoneVerified: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!user) throw new AppError('User not found', 404);
    return success(res, toCustomerUserPayload(user));
  } catch (err) {
    next(err);
  }
}

export async function linkPhoneRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone, appSignature } = otpRequestSchema.parse(req.body);
    const phone = normalizePhone(rawPhone);
    const userId = req.user!.sub;

    const existing = await findUserByPhone(phone);
    if (existing && existing.id !== userId && !isSocialPlaceholderPhone(existing.phone)) {
      throw new AppError('This phone number is already registered', 409);
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.otpRecord.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });

    await prisma.otpRecord.create({ data: { userId, phone, code: hashLoginOtp(code, phone), expiresAt } });
    await sendOtp(phone, code, appSignature);

    return success(res, { message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
}

export async function linkPhoneVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone, code } = otpVerifySchema.parse(req.body);
    const phone = normalizePhone(rawPhone);
    const userId = req.user!.sub;

    const otp = await prisma.otpRecord.findFirst({
      where: {
        userId,
        phone,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || !verifyLoginOtp(code, phone, otp.code)) {
      throw new AppError('Invalid or expired OTP', 400);
    }

    const existing = await findUserByPhone(phone);
    if (existing && existing.id !== userId && !isSocialPlaceholderPhone(existing.phone)) {
      throw new AppError('This phone number is already registered', 409);
    }

    await prisma.otpRecord.update({ where: { id: otp.id }, data: { used: true } });
    await prisma.otpRecord.updateMany({
      where: { userId, used: false, id: { not: otp.id } },
      data: { used: true },
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { phone, isPhoneVerified: true },
    });

    return success(res, toCustomerUserPayload(user));
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      name: z.string().min(2).max(100).optional(),
      email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
      notifyEmail: z.boolean().optional(),
      notifySms: z.boolean().optional(),
      notifyPush: z.boolean().optional(),
      referralCode: z.string().max(32).optional(),
    });
    const data = schema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { deletedAt: true, bannedAt: true, bannedReason: true },
    });
    if (!existing) throw new AppError('User not found', 404);
    if (existing.bannedAt) {
      throw new AppError('This account has been suspended.', 403, 'ACCOUNT_BANNED');
    }
    if (existing.deletedAt) {
      throw new AppError('This account has been deleted and cannot be updated.', 403, 'ACCOUNT_DELETED');
    }
    const { referralCode, email, ...profileData } = data;
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: {
        ...profileData,
        ...(email !== undefined ? { email: email && email.length > 0 ? email : null } : {}),
      },
    });
    if (referralCode) {
      await applyReferralCodeToUser(user.id, referralCode);
    }
    return success(res, toCustomerUserPayload(user));
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: { deletedAt: new Date() },
    });
    return success(res, {
      message: 'Account deleted successfully',
      user: toCustomerUserPayload(user),
    });
  } catch (err) {
    next(err);
  }
}

// Admin auth
const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const adminStoreInclude = {
  store: { select: { id: true, name: true, city: true, deliveryEnabled: true } },
  role: true,
} as const;

type AdminAuthRecord = {
  id: string;
  name: string;
  email: string;
  role: { name: string } | null;
  storeId: string | null;
  tokenVersion?: number | null;
  store?: { id: string; name: string; city: string; deliveryEnabled?: boolean | null } | null;
};

function toAdminLoginPayload(admin: AdminAuthRecord) {
  const roleName = admin.role?.name;
  if (!roleName) {
    throw new AppError('Admin account is missing a role assignment. Contact a system administrator.', 500);
  }
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: roleName,
    storeId: admin.storeId,
    storeName: admin.store?.name ?? null,
    storeCity: admin.store?.city ?? null,
    deliveryEnabled: admin.store?.deliveryEnabled ?? null,
  };
}

function issueAdminAuthTokens(admin: AdminAuthRecord) {
  const roleName = admin.role?.name;
  if (!roleName) {
    throw new AppError('Admin account is missing a role assignment. Contact a system administrator.', 500);
  }
  const token = signToken(admin.id, 'admin', roleName, admin.storeId ?? undefined);
  const refreshToken = signAdminRefreshToken(admin.id, admin.tokenVersion ?? 0);
  const accessExpiresAt = accessExpiresAtMsFromToken(token);
  return {
    token,
    refreshToken,
    admin: toAdminLoginPayload(admin),
    accessExpiresAt,
  };
}

export async function adminLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    await ensureAdminTokenVersionColumn();
    await ensureAdminRoles();
    const admin = await prisma.adminUser.findUnique({
      where: { email },
      include: adminStoreInclude,
    });
    if (!admin) throw new AppError('Invalid credentials', 401);

    // Deactivated staff should see Access denied, not Invalid credentials.
    if (!admin.isActive) {
      throw new AppError(INACTIVE_ADMIN_MESSAGE, 403, 'ACCOUNT_INACTIVE');
    }

    if (!admin.role?.name) {
      throw new AppError('Admin account is missing a role assignment. Contact a system administrator.', 500);
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    if (admin.role.name === 'DELIVERY_DRIVER') {
      throw new AppError('This is a delivery driver account. Please sign in with the Bing Chun Delivery app.', 401);
    }

    if (isBranchScopedRole(admin.role.name) && !admin.storeId) {
      throw new AppError('Branch account is not linked to a store', 403);
    }

    await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    const issued = issueAdminAuthTokens(admin);
    return success(res, respondWithAdminAuthCookies(res, issued));
  } catch (err) {
    next(err);
  }
}

export async function adminLogout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = readAdminRefreshCookie(req);
    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, config.jwtRefreshSecret, {
          ignoreExpiration: true,
        }) as { sub?: string; type?: string };
        if (payload.type === 'admin' && payload.sub) {
          await ensureAdminTokenVersionColumn();
          await prisma.adminUser.updateMany({
            where: { id: payload.sub },
            data: { tokenVersion: { increment: 1 } },
          });
        }
      } catch {
        // Best-effort revocation; always clear cookies and return success.
      }
    }
    clearAdminAuthCookies(res);
    return success(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Expose the httpOnly admin access JWT for Socket.IO handshake.auth.
 * Same-origin Next `/api` proxy can read the cookie; the browser cannot send
 * that cookie to the CapRover API host on a cross-origin websocket.
 * JWT verify only — no DB — so this stays cheap under reconnect storms.
 */
export async function adminSocketToken(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || readAdminAccessCookie(req);
    if (!token) throw new AppError('Unauthorized', 401);

    let payload: { type?: string; sub?: string; role?: string };
    try {
      payload = jwt.verify(token, config.jwtSecret) as typeof payload;
    } catch {
      throw new AppError('Unauthorized', 401);
    }
    if (payload.type !== 'admin' || !payload.sub) throw new AppError('Unauthorized', 401);
    if (payload.role === 'DELIVERY_DRIVER') throw new AppError('Unauthorized', 401);

    res.setHeader('Cache-Control', 'no-store');
    return success(res, { token });
  } catch (err) {
    next(err);
  }
}

export async function adminRefreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const bodyToken = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {}).refreshToken;
    if (!bodyToken) {
      assertAdminCsrf(req);
    }
    const token = bodyToken || readAdminRefreshCookie(req);
    if (!token) throw new AppError('Invalid token', 401);
    const payload = jwt.verify(token, config.jwtRefreshSecret) as {
      sub: string;
      type?: string;
      tokenVersion?: number;
    };
    if (payload.type !== 'admin') throw new AppError('Invalid token', 401);

    await ensureAdminTokenVersionColumn();
    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: adminStoreInclude,
    });
    if (!admin) throw new AppError('Invalid token', 401);
    if (!admin.isActive) throw new AppError(INACTIVE_ADMIN_MESSAGE, 403, 'ACCOUNT_INACTIVE');
    if (!admin.role?.name) {
      throw new AppError('Admin account is missing a role assignment. Contact a system administrator.', 500);
    }
    if (admin.role.name === 'DELIVERY_DRIVER') throw new AppError('Invalid token', 401);
    if ((payload.tokenVersion ?? 0) !== (admin.tokenVersion ?? 0)) {
      throw new AppError('Invalid token', 401);
    }

    const issued = issueAdminAuthTokens(admin);
    res.setHeader('Cache-Control', 'no-store');
    return success(res, respondWithAdminAuthCookies(res, issued));
  } catch (err) {
    next(err);
  }
}

const sriLankanMobile = z.string().regex(/^(?:\+94|0)[0-9]{9}$/, 'Invalid Sri Lankan phone number');

const deliveryOtpRequestSchema = z.object({
  phone: sriLankanMobile,
  /** Legacy Android SMS Retriever hash from the client; not included in the OTP SMS body. */
  appSignature: z.string().min(8).max(16).optional(),
});

const deliveryLoginSchema = z.object({
  phone: sriLankanMobile,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  challenge: z.string().min(1, 'Request a new code'),
});

/** Driver-login attempt budget is kept apart from the customer OTP budget for the same number. */
const driverOtpAttemptKey = (phone: string) => `driver:${phone}`;

/** Fixed code for the Play review rider number, or null for every other number. */
function playReviewDriverOtp(phone: string): string | null {
  const { phone: reviewPhone, otp } = config.playReviewDriver;
  if (!reviewPhone || !otp) return null;
  return normalizePhone(reviewPhone) === phone ? otp : null;
}

// Delivery driver auth (mobile app) — step 1: text a code to the mobile number.
// Sent to any valid number; whether it belongs to a rider is only revealed after
// the code proves the caller owns the phone.
export async function deliveryOtpRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone, appSignature } = deliveryOtpRequestSchema.parse(req.body);
    const phone = normalizePhone(rawPhone);
    const reviewOtp = playReviewDriverOtp(phone);
    const code = reviewOtp ?? generateDriverOtp();
    const { challenge, expiresInSeconds } = signDriverOtpChallenge(phone, code);
    resetOtpAttempts(driverOtpAttemptKey(phone));
    if (!reviewOtp) await sendOtp(phone, code, appSignature);
    return success(res, { message: 'OTP sent successfully', challenge, expiresInSeconds });
  } catch (err) {
    next(err);
  }
}

// Delivery driver auth (mobile app) — step 2: verify the code, then sign in the
// rider registered with that mobile number.
export async function deliveryLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone: rawPhone, code, challenge } = deliveryLoginSchema.parse(req.body);
    const phone = normalizePhone(rawPhone);
    const attemptKey = driverOtpAttemptKey(phone);

    try {
      assertOtpAttemptsAllowed(attemptKey);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Too many OTP attempts', 429);
    }
    if (!verifyDriverOtpChallenge(challenge, phone, code)) {
      recordFailedOtpAttempt(attemptKey);
      throw new AppError('Invalid or expired OTP', 400, 'OTP_INVALID');
    }
    resetOtpAttempts(attemptKey);
    consumeDriverOtpChallenge(challenge);

    await ensureAdminTokenVersionColumn();
    const driver = await findDriverByPhone(phone);

    if (!driver || driver.role.name !== 'DELIVERY_DRIVER') {
      throw new AppError('This mobile number is not registered as a rider', 404, 'RIDER_NOT_FOUND');
    }

    if (!driver.isActive) {
      throw new AppError(
        'Your account has been suspended. Please contact the administrator.',
        403,
        'RIDER_SUSPENDED',
      );
    }

    if (!driver.storeId) {
      throw new AppError('Driver account is not linked to a branch', 403);
    }

    // One number can cover several branches — make sure the rider can deliver for all of them.
    await linkDriverBranches(driver.id, driver.matchedStoreIds);

    await prisma.adminUser.update({
      where: { id: driver.id },
      data: { lastLoginAt: new Date() },
    });
    const sessionVersion = await incrementDriverSessionVersion(driver.id);
    await prisma.driverDevice.updateMany({
      where: { driverId: driver.id },
      data: { fcmToken: null, refreshTokenHash: null },
    });
    revokeDriverSockets(driver.id);

    const token = signDeliveryToken(driver.id, driver.storeId, sessionVersion);
    return success(res, {
      token,
      driver: {
        id: driver.id,
        name: driver.name,
        role: driver.role.name,
        storeId: driver.storeId,
        storeName: driver.store?.name ?? null,
        storeCity: driver.store?.city ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
