import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createMockNext } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    refund: {
      findMany: vi.fn(),
    },
    loyaltyTransaction: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    customerAuditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callbacks) => {
      if (Array.isArray(callbacks)) {
        return Promise.all(callbacks);
      }
      return callbacks(prisma);
    }),
  },
}));

import {
  maskPhoneNumber,
  listCustomers,
  getCustomerProfile,
  banCustomer,
  restoreCustomer,
} from '../../src/controllers/adminCustomerController';
import { prisma } from '../../src/lib/prisma';

function createMockRes() {
  const res: Partial<Response> = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response & { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
}

describe('adminCustomerController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('maskPhoneNumber', () => {
    it('masks standard 10-digit Sri Lankan phone numbers', () => {
      expect(maskPhoneNumber('0771234567')).toBe('077 XXX 4567');
      expect(maskPhoneNumber('0719876543')).toBe('071 XXX 6543');
    });

    it('handles international format 94771234567', () => {
      expect(maskPhoneNumber('+94771234567')).toBe('077 XXX 4567');
    });

    it('identifies deleted and social placeholders', () => {
      expect(maskPhoneNumber('deleted:user-123')).toBe('[Deleted]');
      expect(maskPhoneNumber('google:12345678')).toBe('[Social Account]');
      expect(maskPhoneNumber('')).toBe('—');
    });
  });

  describe('listCustomers', () => {
    it('returns paginated shape with top-level data array and meta', async () => {
      const createdAt = new Date('2026-01-15T10:00:00Z');
      (prisma.user.count as any).mockResolvedValue(1);
      (prisma.user.findMany as any).mockResolvedValue([
        {
          id: 'user-1',
          name: 'Kamal Perera',
          phone: '0771234567',
          email: 'kamal@example.com',
          isEmailVerified: true,
          createdAt,
          deletedAt: null,
          bannedAt: null,
          bannedReason: null,
          orders: [],
        },
      ]);

      const req = {
        query: { page: '1', limit: '20', status: 'all' },
      } as unknown as Request;

      const res = createMockRes();
      const next = createMockNext();

      await listCustomers(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'user-1',
              name: 'Kamal Perera',
              phone: '0771234567',
              status: 'ACTIVE',
            }),
          ]),
          meta: expect.objectContaining({
            total: 1,
            page: 1,
            limit: 20,
            pages: 1,
          }),
        }),
      );
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        data: unknown;
      };
      expect(Array.isArray(payload.data)).toBe(true);
      expect(payload.data).not.toHaveProperty('data');
    });
  });

  describe('banCustomer', () => {
    it('successfully bans an active customer and creates audit log', async () => {
      const mockUser = {
        id: 'user-1',
        phone: '0771234567',
        deletedAt: null,
        bannedAt: null,
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (prisma.user.update as any).mockResolvedValue({
        ...mockUser,
        bannedAt: new Date(),
        bannedReason: '[FRAUD] Fake orders test',
      });
      (prisma.customerAuditLog.create as any).mockResolvedValue({ id: 'audit-1' });

      const req = {
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'user-1' },
        body: { category: 'FRAUD', reason: 'Fake orders test' },
      } as unknown as Request;

      const res = createMockRes();
      const next = createMockNext();

      await banCustomer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            message: 'Customer account banned successfully',
          }),
        }),
      );
    });

    it('rejects banning an already banned customer', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
        bannedAt: new Date(),
      });

      const req = {
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'user-1' },
        body: { category: 'OTHER', reason: 'Already banned' },
      } as unknown as Request;

      const res = createMockRes();
      const next = createMockNext();

      await banCustomer(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Account is already banned',
          statusCode: 400,
        }),
      );
    });
  });

  describe('restoreCustomer', () => {
    it('restores a banned customer when no phone collision exists', async () => {
      const mockUser = {
        id: 'user-1',
        phone: '0771234567',
        deletedAt: null,
        bannedAt: new Date('2026-08-01'),
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (prisma.user.findFirst as any).mockResolvedValue(null); // No collision
      (prisma.user.update as any).mockResolvedValue({
        ...mockUser,
        bannedAt: null,
        bannedReason: null,
        deletedAt: null,
      });
      (prisma.customerAuditLog.create as any).mockResolvedValue({ id: 'audit-2' });

      const req = {
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'user-1' },
        body: { reason: 'Customer ID verified by HQ' },
      } as unknown as Request;

      const res = createMockRes();
      const next = createMockNext();

      await restoreCustomer(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            message: 'Customer account restored successfully',
          }),
        }),
      );
    });

    it('returns 409 conflict when phone is used by another active account', async () => {
      const mockUser = {
        id: 'user-1',
        phone: '0771234567',
        deletedAt: new Date('2026-07-01'),
        bannedAt: null,
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      // Active user conflict with the same phone
      (prisma.user.findFirst as any).mockResolvedValue({ id: 'user-2', phone: '0771234567' });

      const req = {
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'user-1' },
        body: { reason: 'Restore request' },
      } as unknown as Request;

      const res = createMockRes();
      const next = createMockNext();

      await restoreCustomer(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          code: 'PHONE_CONFLICT',
        }),
      );
    });
  });

  describe('getCustomerProfile', () => {
    it('returns customer 360 KPIs and unmasked phone for Super Admin', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        name: 'Kamal Perera',
        phone: '0771234567',
        email: 'kamal@example.com',
        isEmailVerified: true,
        createdAt: new Date('2026-01-15T10:00:00Z'),
        deletedAt: null,
        bannedAt: null,
        bannedReason: null,
        loyaltyPoints: 350,
        referredBy: { id: 'ref-1', name: 'Nimal', phone: '0719876543' },
        _count: { referrals: 2 },
        addresses: [
          {
            id: 'addr-1',
            label: 'Home',
            addressLine: '123 Galle Rd',
            city: 'Colombo',
            district: 'Colombo',
            isDefault: true,
            createdAt: new Date(),
          },
        ],
        customerAuditLogs: [],
      });

      (prisma.order.findMany as any).mockResolvedValue([
        {
          id: 'ord-1',
          storeId: 'store-1',
          total: 2500,
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          orderMode: 'DELIVERY',
          addressId: 'addr-1',
          createdAt: new Date('2026-08-10T12:00:00Z'),
          store: { id: 'store-1', name: 'Colombo 03', city: 'Colombo' },
          items: [{ productName: 'Brown Sugar Milk Tea', quantity: 3 }],
          refund: null,
        },
      ]);

      (prisma.refund.findMany as any).mockResolvedValue([]);
      (prisma.loyaltyTransaction.findMany as any).mockResolvedValue([
        { points: 500, type: 'EARN' },
        { points: -150, type: 'REDEEM' },
      ]);

      const req = {
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'user-1' },
      } as unknown as Request;

      const res = createMockRes();
      const next = createMockNext();

      await getCustomerProfile(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 'user-1',
            name: 'Kamal Perera',
            phone: '0771234567', // Unmasked
            status: 'ACTIVE',
            referralsCount: 2,
            orderBranches: [
              expect.objectContaining({
                id: 'store-1',
                name: 'Colombo 03',
                city: 'Colombo',
                ordersCount: 1,
                isFavourite: true,
              }),
            ],
            kpis: expect.objectContaining({
              totalSpend: 2500,
              favouriteBranch: expect.objectContaining({ name: 'Colombo 03' }),
              favouriteItem: expect.objectContaining({ productName: 'Brown Sugar Milk Tea', quantity: 3 }),
              loyaltyPoints: 350,
              lifetimeEarned: 500,
              lifetimeRedeemed: 150,
            }),
          }),
        }),
      );
    });
  });
});
