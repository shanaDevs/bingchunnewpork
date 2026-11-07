import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { normalizePhone, phoneLookupVariants } from '../utils/phone';

/** Canonical Sri Lankan mobile for storage: 07XXXXXXXX */
export function parseDriverPhone(raw: string): string {
  const normalized = normalizePhone(raw.trim());
  if (!/^0[0-9]{9}$/.test(normalized)) {
    throw new AppError('Invalid Sri Lankan phone number', 400);
  }
  return normalized;
}

/**
 * Mobile must be unique across all delivery drivers (active or inactive).
 * Matches legacy stored formats via phoneLookupVariants.
 */
export async function assertDriverPhoneAvailable(
  phone: string,
  excludeDriverId?: string,
): Promise<string> {
  const canonical = parseDriverPhone(phone);
  const variants = phoneLookupVariants(canonical);

  const existing = await prisma.adminUser.findFirst({
    where: {
      role: { name: 'DELIVERY_DRIVER' },
      phone: { in: variants },
      ...(excludeDriverId ? { id: { not: excludeDriverId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError('This mobile number is already registered to another rider', 409);
  }

  return canonical;
}
