import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { ensureCustomerNotificationTables } from '../lib/customerNotifications';

export async function listMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCustomerNotificationTables();
    const userId = req.user!.sub;
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(parseInt(String(req.query.limit || '30'), 10), 100);

    const notifications = await prisma.customerNotification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.customerNotification.count({
      where: { userId, read: false },
    });

    return success(res, { notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureCustomerNotificationTables();
    const userId = req.user!.sub;
    const notification = await prisma.customerNotification.findUnique({
      where: { id: req.params.id as string },
    });
    if (!notification || notification.userId !== userId) {
      throw new AppError('Notification not found', 404);
    }

    const updated = await prisma.customerNotification.update({
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
    await ensureCustomerNotificationTables();
    const userId = req.user!.sub;
    await prisma.customerNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return success(res, { message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
}
