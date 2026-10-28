import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { ensurePaymentSettingsTables } from '../lib/paymentSettings';
import { resolveBranchStoreId } from '../middleware/auth';
import { sendTestCustomerNotification } from '../lib/customerNotifications';
import { normalizePhone } from '../utils/phone';

export async function listMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    await ensurePaymentSettingsTables();
    const adminId = req.user!.sub;
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(parseInt(String(req.query.limit || '30'), 10), 100);

    const branchStoreId = await resolveBranchStoreId(req);
    const storeFilter = branchStoreId ? { storeId: branchStoreId } : {};

    const notifications = await prisma.adminNotification.findMany({
      where: {
        adminUserId: adminId,
        ...(unreadOnly ? { read: false } : {}),
        ...storeFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.adminNotification.count({
      where: { adminUserId: adminId, read: false, ...storeFilter },
    });

    return success(res, { notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const notification = await prisma.adminNotification.findUnique({
      where: { id: req.params.id as string },
    });
    if (!notification || notification.adminUserId !== adminId) {
      throw new AppError('Notification not found', 404);
    }

    const updated = await prisma.adminNotification.update({
      where: { id: notification.id },
      data: { read: true },
    });
    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    await prisma.adminNotification.updateMany({
      where: { adminUserId: adminId, read: false },
      data: { read: true },
    });
    return success(res, { message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
}

export async function markReadByOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
    await prisma.adminNotification.updateMany({
      where: { adminUserId: adminId, orderId, read: false },
      data: { read: true },
    });
    return success(res, { message: 'Marked read' });
  } catch (err) {
    next(err);
  }
}

const testCustomerPushSchema = z
  .object({
    phone: z.string().optional(),
    userId: z.string().optional(),
    title: z.string().min(1).max(191).optional(),
    message: z.string().min(1).max(500).optional(),
  })
  .refine((data) => Boolean(data.phone?.trim() || data.userId?.trim()), {
    message: 'phone or userId is required',
  });

export async function sendTestCustomerPush(req: Request, res: Response, next: NextFunction) {
  try {
    const body = testCustomerPushSchema.parse(req.body);
    const title = body.title?.trim() || 'Test notification';
    const message =
      body.message?.trim() || 'This is a test push from the Bing Chun admin panel.';

    let user = null;
    if (body.userId?.trim()) {
      user = await prisma.user.findUnique({ where: { id: body.userId.trim() } });
    } else if (body.phone?.trim()) {
      const phone = normalizePhone(body.phone.trim());
      user = await prisma.user.findFirst({ where: { phone } });
    }

    if (!user) {
      throw new AppError('Customer not found for that phone or user ID', 404);
    }

    const result = await sendTestCustomerNotification(user.id, title, message);

    return success(res, {
      ...result,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    next(err);
  }
}
