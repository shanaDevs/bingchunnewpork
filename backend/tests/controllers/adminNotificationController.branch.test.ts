import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminNotification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/paymentSettings', () => ({
  ensurePaymentSettingsTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn(),
  };
});

vi.mock('../../src/lib/customerNotifications', () => ({
  sendTestCustomerNotification: vi.fn(),
}));

import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markReadByOrder,
  sendTestCustomerPush,
} from '../../src/controllers/adminNotificationController';
import { sendTestCustomerNotification } from '../../src/lib/customerNotifications';
import { ensurePaymentSettingsTables } from '../../src/lib/paymentSettings';
import { prisma } from '../../src/lib/prisma';
import { resolveBranchStoreId } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

describe('listMyNotifications', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(prisma.adminNotification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.adminNotification.count).mockResolvedValue(0);
  });

  it('returns notifications and unread count for the signed-in admin', async () => {
    const notifications = [
      { id: 'notif-1', title: 'New order', read: false, storeId: 'store-1' },
    ];
    vi.mocked(prisma.adminNotification.findMany).mockResolvedValue(notifications as never);
    vi.mocked(prisma.adminNotification.count).mockResolvedValue(1);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await listMyNotifications(req, res, next);

    expect(ensurePaymentSettingsTables).toHaveBeenCalled();
    expect(prisma.adminNotification.findMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { notifications, unreadCount: 1 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('filters notifications to the branch store for branch admins', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-nugegoda');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: {},
    });
    const res = createMockRes();

    await listMyNotifications(req, res, next);

    expect(resolveBranchStoreId).toHaveBeenCalledWith(req);
    expect(prisma.adminNotification.findMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1', storeId: 'store-nugegoda' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    expect(prisma.adminNotification.count).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1', read: false, storeId: 'store-nugegoda' },
    });
  });

  it('returns only unread notifications when unread=true', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { unread: 'true', limit: '10' },
    });
    const res = createMockRes();

    await listMyNotifications(req, res, next);

    expect(prisma.adminNotification.findMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1', read: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  });

  it('returns an empty list when there are no notifications', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { unread: 'true' },
    });
    const res = createMockRes();

    await listMyNotifications(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { notifications: [], unreadCount: 0 },
    });
  });

  it('does not expose another branch store when branch scope resolves', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-a');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-a' },
      query: { storeId: 'store-b' },
    });
    const res = createMockRes();

    await listMyNotifications(req, res, next);

    expect(prisma.adminNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-a' }),
      }),
    );
    expect(prisma.adminNotification.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-b' }),
      }),
    );
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.adminNotification.findMany).mockRejectedValue(
      new Error('Notification query failed'),
    );

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await listMyNotifications(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('markReadByOrder', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminNotification.updateMany).mockResolvedValue({ count: 2 });
  });

  it('marks unread notifications for the order as read', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      body: { orderId: 'order-1' },
    });
    const res = createMockRes();

    await markReadByOrder(req, res, next);

    expect(prisma.adminNotification.updateMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1', orderId: 'order-1', read: false },
      data: { read: true },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Marked read' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('scopes updates to the signed-in admin only', async () => {
    const req = createMockReq({
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
      body: { orderId: 'order-1' },
    });
    const res = createMockRes();

    await markReadByOrder(req, res, next);

    expect(prisma.adminNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ adminUserId: 'admin-2' }),
      }),
    );
  });

  it('succeeds even when no unread notifications match the order', async () => {
    vi.mocked(prisma.adminNotification.updateMany).mockResolvedValue({ count: 0 });

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      body: { orderId: 'missing-order' },
    });
    const res = createMockRes();

    await markReadByOrder(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Marked read' },
    });
  });

  it('forwards validation errors when orderId is missing', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      body: {},
    });
    const res = createMockRes();

    await markReadByOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.adminNotification.updateMany).not.toHaveBeenCalled();
  });

  it('propagates prisma update failures', async () => {
    vi.mocked(prisma.adminNotification.updateMany).mockRejectedValue(
      new Error('Notification update failed'),
    );

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      body: { orderId: 'order-1' },
    });
    const res = createMockRes();

    await markReadByOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('markNotificationRead', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the notification read when it belongs to the signed-in admin', async () => {
    vi.mocked(prisma.adminNotification.findUnique).mockResolvedValue({
      id: 'notif-1',
      adminUserId: 'admin-1',
      read: false,
    } as never);
    vi.mocked(prisma.adminNotification.update).mockResolvedValue({
      id: 'notif-1',
      adminUserId: 'admin-1',
      read: true,
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      params: { id: 'notif-1' },
    });
    const res = createMockRes();

    await markNotificationRead(req, res, next);

    expect(prisma.adminNotification.findUnique).toHaveBeenCalledWith({ where: { id: 'notif-1' } });
    expect(prisma.adminNotification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { read: true },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'notif-1', adminUserId: 'admin-1', read: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when the notification does not exist', async () => {
    vi.mocked(prisma.adminNotification.findUnique).mockResolvedValue(null);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      params: { id: 'missing-notif' },
    });
    const res = createMockRes();

    await markNotificationRead(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Notification not found');
    expect(prisma.adminNotification.update).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 404 when the notification belongs to a different admin (no cross-admin access)', async () => {
    vi.mocked(prisma.adminNotification.findUnique).mockResolvedValue({
      id: 'notif-1',
      adminUserId: 'admin-2',
      read: false,
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      params: { id: 'notif-1' },
    });
    const res = createMockRes();

    await markNotificationRead(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect(prisma.adminNotification.update).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.adminNotification.findUnique).mockRejectedValue(new Error('Notification lookup failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      params: { id: 'notif-1' },
    });
    const res = createMockRes();

    await markNotificationRead(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma update failures', async () => {
    vi.mocked(prisma.adminNotification.findUnique).mockResolvedValue({
      id: 'notif-1',
      adminUserId: 'admin-1',
      read: false,
    } as never);
    vi.mocked(prisma.adminNotification.update).mockRejectedValue(new Error('Notification update failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      params: { id: 'notif-1' },
    });
    const res = createMockRes();

    await markNotificationRead(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('markAllNotificationsRead', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminNotification.updateMany).mockResolvedValue({ count: 0 });
  });

  it('marks every unread notification for the signed-in admin as read', async () => {
    vi.mocked(prisma.adminNotification.updateMany).mockResolvedValue({ count: 4 });

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await markAllNotificationsRead(req, res, next);

    expect(prisma.adminNotification.updateMany).toHaveBeenCalledWith({
      where: { adminUserId: 'admin-1', read: false },
      data: { read: true },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'All marked as read' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('scopes the update to the signed-in admin only (no cross-admin/branch scope)', async () => {
    const req = createMockReq({
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await markAllNotificationsRead(req, res, next);

    expect(prisma.adminNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adminUserId: 'admin-2', read: false } }),
    );
  });

  it('succeeds even when there are no unread notifications', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await markAllNotificationsRead(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'All marked as read' },
    });
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.adminNotification.updateMany).mockRejectedValue(new Error('Mark-all-read query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await markAllNotificationsRead(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('sendTestCustomerPush', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(sendTestCustomerNotification).mockResolvedValue({
      notificationId: 'notif-1',
      fcmConfigured: true,
      pushTokensTargeted: 1,
      pushTokensSent: 1,
      socketEmitted: true,
    });
  });

  it('sends a test push to a customer resolved by userId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      name: 'Alice',
      phone: '0771234567',
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { userId: 'user-1' },
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(sendTestCustomerNotification).toHaveBeenCalledWith(
      'user-1',
      'Test notification',
      'This is a test push from the Bing Chun admin panel.',
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        notificationId: 'notif-1',
        fcmConfigured: true,
        pushTokensTargeted: 1,
        pushTokensSent: 1,
        socketEmitted: true,
        user: { id: 'user-1', name: 'Alice', phone: '0771234567' },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('resolves the customer by normalized phone number and applies custom title/message', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-2',
      name: 'Bob',
      phone: '0779876543',
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { phone: '+94 77 987 6543', title: 'Hello', message: 'Custom message' },
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { phone: '0779876543' } });
    expect(sendTestCustomerNotification).toHaveBeenCalledWith('user-2', 'Hello', 'Custom message');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ user: { id: 'user-2', name: 'Bob', phone: '0779876543' } }),
      }),
    );
  });

  it('prefers userId over phone when both are provided', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      name: 'Alice',
      phone: '0771234567',
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { userId: 'user-1', phone: '0779999999' },
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('forwards a validation error when neither phone nor userId is provided', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: {},
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 404 when no customer matches the provided phone or userId', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { userId: 'missing-user' },
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Customer not found for that phone or user ID');
    expect(sendTestCustomerNotification).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma lookup failures', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('User lookup failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { userId: 'user-1' },
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates failures from the external push notification service', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      name: 'Alice',
      phone: '0771234567',
    } as never);
    vi.mocked(sendTestCustomerNotification).mockRejectedValue(new Error('FCM send failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { userId: 'user-1' },
    });
    const res = createMockRes();

    await sendTestCustomerPush(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
