import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { ensureDriverNotificationTables } from '../lib/driverNotifications';

export async function listMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriverNotificationTables();
    const driverId = req.user!.sub;
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(parseInt(String(req.query.limit || '30'), 10), 100);

    const notifications = await prisma.driverNotification.findMany({
      where: {
        driverId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.driverNotification.count({
      where: { driverId, read: false },
    });

    return success(res, { notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriverNotificationTables();
    const driverId = req.user!.sub;
    const notification = await prisma.driverNotification.findUnique({
      where: { id: req.params.id as string },
    });
    if (!notification || notification.driverId !== driverId) {
      throw new AppError('Notification not found', 404);
    }

    const updated = await prisma.driverNotification.update({
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
    await ensureDriverNotificationTables();
    const driverId = req.user!.sub;
    await prisma.driverNotification.updateMany({
      where: { driverId, read: false },
      data: { read: true },
    });
    return success(res, { message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
}
