import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * Verifies the signed-in admin's password (used as PIN for sensitive actions).
 * Always returns a generic "Invalid PIN" on failure to avoid user enumeration.
 */
export async function verifyAdminPin(adminId: string | undefined, password: string): Promise<void> {
  const pin = typeof password === 'string' ? password.trim() : '';
  if (!adminId || !pin) {
    throw new AppError('Invalid PIN', 401);
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { passwordHash: true },
  });
  if (!admin?.passwordHash) {
    throw new AppError('Invalid PIN', 401);
  }

  const valid = await bcrypt.compare(pin, admin.passwordHash);
  if (!valid) {
    throw new AppError('Invalid PIN', 401);
  }
}
