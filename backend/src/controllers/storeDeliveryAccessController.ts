import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { success } from '../utils/apiResponse';
import {
  computeDeliveryMilestoneProgress,
  getDeliveryMilestoneSettings,
} from '../lib/deliveryAccessMilestones';

const patchSchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1, 'Passcode is required'),
  reason: z.string().max(500).optional(),
});

async function countMonthlyOrders(storeId: string): Promise<number> {
  const now = new Date();
  const gte = new Date(now.getFullYear(), now.getMonth(), 1);
  return prisma.order.count({
    where: {
      storeId,
      paymentStatus: 'PAID',
      createdAt: { gte, lte: now },
    },
  });
}

export async function listDeliveryAccessStores(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        deliveryEnabled: true,
      },
      orderBy: { name: 'asc' },
    });

    const orderStats = await prisma.order.groupBy({
      by: ['storeId'],
      where: {
        paymentStatus: 'PAID',
        createdAt: { gte: monthStart, lte: now },
      },
      _count: { id: true },
      _sum: { total: true },
    });

    const statsMap = new Map(
      orderStats.map((row) => [
        row.storeId,
        { orders: row._count.id, grossSales: row._sum.total ?? 0 },
      ]),
    );

    const milestoneSettings = await getDeliveryMilestoneSettings();

    const rows = stores.map((store) => {
      const stats = statsMap.get(store.id) ?? { orders: 0, grossSales: 0 };
      const milestone = computeDeliveryMilestoneProgress(
        stats.orders,
        store.deliveryEnabled,
        milestoneSettings,
      );
      return {
        storeId: store.id,
        branchName: store.name,
        deliveryEnabled: store.deliveryEnabled,
        tier: store.deliveryEnabled ? 'top' : 'standard',
        ordersThisMonth: stats.orders,
        grossSalesThisMonth: stats.grossSales,
        milestone,
      };
    });

    return success(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function patchDeliveryAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = z.string().parse(req.params.id);
    const { enabled, password, reason } = patchSchema.parse(req.body);

    if (!req.user?.sub) throw new AppError('Unauthorized', 401);

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.user.sub },
      select: { name: true, email: true, passwordHash: true },
    });
    if (!admin) throw new AppError('Unauthorized', 401);

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new AppError('Invalid passcode', 401);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, deliveryEnabled: true, isActive: true },
    });
    if (!store || !store.isActive) throw new AppError('Store not found', 404);
    if (store.deliveryEnabled === enabled) {
      return success(res, {
        storeId: store.id,
        branchName: store.name,
        deliveryEnabled: store.deliveryEnabled,
        tier: store.deliveryEnabled ? 'top' : 'standard',
      });
    }

    const ordersAtChange = await countMonthlyOrders(storeId);
    const changedByName = admin.name || admin.email || 'Super Admin';

    const updated = await prisma.$transaction(async (tx) => {
      const nextStore = await tx.store.update({
        where: { id: storeId },
        data: { deliveryEnabled: enabled },
        select: { id: true, name: true, deliveryEnabled: true },
      });

      await tx.deliveryAccessLog.create({
        data: {
          storeId,
          action: enabled ? 'ENABLED' : 'DISABLED',
          changedById: req.user!.sub,
          changedByName,
          reason: reason?.trim() || null,
          ordersAtChange,
        },
      });

      return nextStore;
    });

    return success(res, {
      storeId: updated.id,
      branchName: updated.name,
      deliveryEnabled: updated.deliveryEnabled,
      tier: updated.deliveryEnabled ? 'top' : 'standard',
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryAccessLog(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = z.coerce.number().min(1).max(200).optional().default(50).parse(req.query.limit);

    const logs = await prisma.deliveryAccessLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        store: { select: { id: true, name: true, deliveryEnabled: true } },
      },
    });

    return success(
      res,
      logs.map((log) => ({
        id: log.id,
        storeId: log.storeId,
        branchName: log.store.name,
        action: log.action,
        changedBy: log.changedByName ?? 'Super Admin',
        reason: log.reason ?? null,
        date: log.createdAt,
        ordersAtChange: log.ordersAtChange,
        status: log.store.deliveryEnabled ? 'Active' : 'Disabled',
      })),
    );
  } catch (err) {
    next(err);
  }
}
