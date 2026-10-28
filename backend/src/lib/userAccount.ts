import type { User } from '@prisma/client';
import { prisma } from './prisma';
import { isSocialPlaceholderPhone, normalizePhone, phoneLookupVariants } from '../utils/phone';
import { AppError } from '../middleware/errorHandler';

export type OtpIntent = 'login' | 'recover' | 'create_new';

const PLACEHOLDER_NAMES = new Set([
  'guest',
  'walk-in',
  'bing chun user',
  '[deleted]',
  'customer',
]);

function isPlaceholderCustomerName(name?: string | null): boolean {
  if (name == null) return true;
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

function displayNameForCustomer(user: {
  name: string;
  phone: string;
  deletedAt?: Date | null;
}): string {
  if (user.deletedAt && isPlaceholderCustomerName(user.name)) {
    return user.phone;
  }
  return user.name;
}

export type CustomerUserPayload = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  loyaltyPoints: number;
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  isDeleted: boolean;
  isPhoneVerified: boolean;
  needsPhoneNumber: boolean;
};

export function toCustomerUserPayload(user: {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  loyaltyPoints?: number;
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  isPhoneVerified?: boolean;
  deletedAt?: Date | null;
}): CustomerUserPayload {
  const placeholderPhone = isSocialPlaceholderPhone(user.phone);
  const isPhoneVerified = Boolean(user.isPhoneVerified) && !placeholderPhone;
  const needsPhoneNumber = !isPhoneVerified;

  return {
    id: user.id,
    name: displayNameForCustomer(user),
    phone: placeholderPhone ? '' : user.phone,
    email: user.email ?? undefined,
    loyaltyPoints: user.loyaltyPoints ?? 0,
    notifyEmail: user.notifyEmail,
    notifySms: user.notifySms,
    notifyPush: user.notifyPush,
    isDeleted: Boolean(user.deletedAt),
    isPhoneVerified,
    needsPhoneNumber,
  };
}

export function isArchivedCustomerPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  return isSocialPlaceholderPhone(trimmed) || /^deleted:/i.test(trimmed);
}

export function archivedPhonePlaceholder(userId: string): string {
  return `deleted:${userId}`;
}

/** Free a soft-deleted user's phone so a new account can register with it. */
export async function archiveDeletedUserPhone(userId: string): Promise<User> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.deletedAt) {
    throw new AppError('Account is not deleted', 400);
  }
  if (isArchivedCustomerPhone(user.phone)) {
    return user;
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      phone: archivedPhonePlaceholder(userId),
      name: isPlaceholderCustomerName(user.name) ? '[Deleted]' : user.name,
    },
  });
}

/** Create a fresh customer row after archiving the previous deleted account. */
export async function createFreshUserForPhone(phone: string): Promise<User> {
  return prisma.user.create({
    data: {
      name: 'Guest',
      phone: normalizePhone(phone),
    },
  });
}

export async function findUserByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  let user = await prisma.user.findUnique({ where: { phone: normalized } });
  if (!user) {
    user = await prisma.user.findFirst({
      where: { phone: { in: phoneLookupVariants(normalized) } },
    });
  }
  return user;
}

/** Allow returning customers to sign in / checkout after a soft-deleted account. */
export async function reactivateUserIfDeleted(
  user: { id: string; name: string; deletedAt: Date | null },
  profile?: { name?: string; email?: string }
): Promise<User> {
  if (!user.deletedAt) {
    return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  const name =
    profile?.name && profile.name.trim().length >= 2
      ? profile.name.trim()
      : user.name === '[Deleted]'
        ? 'Guest'
        : user.name;

  return prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: null,
      isPhoneVerified: true,
      name,
      ...(profile?.email ? { email: profile.email } : {}),
    },
  });
}
