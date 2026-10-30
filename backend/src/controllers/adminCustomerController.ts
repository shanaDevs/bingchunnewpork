import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { success, paginated } from '../utils/apiResponse';
import { normalizePhone, phoneLookupVariants } from '../utils/phone';

const PLACEHOLDER_NAMES = new Set([
  'guest',
  'walk-in',
  'bing chun user',
  '[deleted]',
  'customer',
]);

function isPlaceholderName(name?: string | null): boolean {
  if (!name) return true;
  const trimmed = name.trim().toLowerCase();
  return trimmed.length < 2 || PLACEHOLDER_NAMES.has(trimmed);
}

function resolveCustomerDisplayName(name?: string | null, _phone?: string | null): string {
  if (isPlaceholderName(name)) {
    return 'Unnamed customer';
  }
  return name!.trim();
}

export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '—';
  const trimmed = phone.trim();
  if (/^deleted:/i.test(trimmed)) return '[Deleted]';
  if (/^(google|facebook):/i.test(trimmed)) return '[Social Account]';
  const norm = normalizePhone(trimmed);
  if (norm.length === 10 && norm.startsWith('07')) {
    return `${norm.slice(0, 3)} XXX ${norm.slice(6)}`;
  }
  if (norm.length > 4) {
    return `${norm.slice(0, 3)} ••• ${norm.slice(-4)}`;
  }
  return norm;
}

function isInvalidGuestPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits === '0700000000' || digits === '700000000' || digits === '94700000000' || /^deleted:/i.test(trimmed);
}

const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'banned', 'deleted']).default('all'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'spend', 'orders', 'lastOrder']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /admin/customers
 * List customers with search, status filtering, and KPIs summary.
 */
export async function listCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listCustomersQuerySchema.parse(req.query);
    const { search, status, page, limit } = query;
    const skip = (page - 1) * limit;

    // Base where filter
    const where: any = {};

    if (status === 'active') {
      where.deletedAt = null;
      where.bannedAt = null;
    } else if (status === 'banned') {
      where.deletedAt = null;
      where.bannedAt = { not: null };
    } else if (status === 'deleted') {
      where.deletedAt = { not: null };
    }

    if (search && search.trim()) {
      const q = search.trim();
      const matchingOrder = await prisma.order.findFirst({
        where: {
          orderNumber: { equals: q, mode: 'insensitive' },
          userId: { not: null },
        },
        select: { userId: true },
      });

      const conditions: any[] = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { in: phoneLookupVariants(q) } },
        { phone: { contains: q } },
      ];

      if (matchingOrder?.userId) {
        conditions.push({ id: matchingOrder.userId });
      }

      where.OR = conditions;
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isEmailVerified: true,
          createdAt: true,
          deletedAt: true,
          bannedAt: true,
          bannedReason: true,
        },
      }),
    ]);

    const userIds = users.map((user) => user.id);
    const [orderStats, paidByStore] = userIds.length
      ? await Promise.all([
          prisma.order.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _count: { _all: true },
            _max: { createdAt: true },
          }),
          prisma.order.groupBy({
            by: ['userId', 'storeId'],
            where: {
              userId: { in: userIds },
              paymentStatus: 'PAID',
              status: { not: 'CANCELLED' },
            },
            _sum: { total: true },
            _count: { _all: true },
            _max: { createdAt: true },
          }),
        ])
      : [
          [] as Array<{
            userId: string | null;
            _count: { _all: number };
            _max: { createdAt: Date | null };
          }>,
          [] as Array<{
            userId: string | null;
            storeId: string;
            _sum: { total: number | null };
            _count: { _all: number };
            _max: { createdAt: Date | null };
          }>,
        ];

    const storeIds = [...new Set(paidByStore.map((row) => row.storeId))];
    const stores = storeIds.length
      ? await prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, name: true, city: true },
        })
      : [];
    const storeById = new Map(stores.map((store) => [store.id, store]));
    const statsByUser = new Map(
      orderStats.filter((row) => row.userId).map((row) => [row.userId as string, row]),
    );
    const paidRowsByUser = new Map<string, typeof paidByStore>();
    for (const row of paidByStore) {
      if (!row.userId) continue;
      const list = paidRowsByUser.get(row.userId) ?? [];
      list.push(row);
      paidRowsByUser.set(row.userId, list);
    }

    const data = users.map((user) => {
      let userStatus: 'ACTIVE' | 'BANNED' | 'DELETED' = 'ACTIVE';
      if (user.deletedAt) {
        userStatus = 'DELETED';
      } else if (user.bannedAt) {
        userStatus = 'BANNED';
      }

      const paidRows = paidRowsByUser.get(user.id) ?? [];
      const lifetimeSpend = paidRows.reduce((sum, row) => sum + (row._sum.total ?? 0), 0);
      const sortedStores = paidRows
        .flatMap((row) => {
          const store = storeById.get(row.storeId);
          if (!store || !row._max.createdAt) return [];
          return [{
            store,
            spend: row._sum.total ?? 0,
            orders: row._count._all,
            lastOrder: row._max.createdAt,
          }];
        })
        .sort((a, b) => {
          if (b.spend !== a.spend) return b.spend - a.spend;
          if (b.orders !== a.orders) return b.orders - a.orders;
          return b.lastOrder.getTime() - a.lastOrder.getTime();
        });

      const favouriteBranch = sortedStores[0]
        ? { name: sortedStores[0].store.name, city: sortedStores[0].store.city }
        : null;

      const orderStat = statsByUser.get(user.id);
      const lastOrder = orderStat?._max.createdAt ?? null;

      return {
        id: user.id,
        name: resolveCustomerDisplayName(user.name, user.phone),
        phone: user.phone?.trim() || '—',
        isInvalidPhone: isInvalidGuestPhone(user.phone),
        email: user.email,
        createdAt: user.createdAt,
        status: userStatus,
        bannedAt: user.bannedAt,
        bannedReason: user.bannedReason,
        lifetimeSpend,
        ordersCount: orderStat?._count._all ?? 0,
        favouriteBranch,
        lastOrderAt: lastOrder,
      };
    });

    return paginated(res, data, total, page, limit);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/customers/:id
 * Detailed Customer 360 profile with snapshot KPIs, addresses, and HQ audit history.
 */
export async function getCustomerProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        referredBy: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        _count: {
          select: {
            referrals: true,
          },
        },
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        customerAuditLogs: {
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new AppError('Customer not found', 404);
    }

    // Determine account status
    let userStatus: 'ACTIVE' | 'BANNED' | 'DELETED' = 'ACTIVE';
    if (user.deletedAt) {
      userStatus = 'DELETED';
    } else if (user.bannedAt) {
      userStatus = 'BANNED';
    }

    // Fetch all customer orders for KPI computation
    const orders = await prisma.order.findMany({
      where: { userId: id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        items: {
          select: {
            productName: true,
            quantity: true,
          },
        },
        refund: {
          select: {
            id: true,
            status: true,
            refundAmount: true,
            orderTotal: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 1. Favourite Branch & Favourite Item on PAID orders
    const paidOrders = orders.filter(
      (o) => o.paymentStatus === 'PAID' && o.status !== 'CANCELLED',
    );
    const totalSpend = paidOrders.reduce((sum, o) => sum + o.total, 0);

    const storeSpendMap = new Map<string, { name: string; city: string; spend: number; orders: number; lastOrder: Date }>();
    const productQtyMap = new Map<string, number>();

    for (const ord of paidOrders) {
      const entry = storeSpendMap.get(ord.storeId) || {
        name: ord.store.name,
        city: ord.store.city,
        spend: 0,
        orders: 0,
        lastOrder: ord.createdAt,
      };
      entry.spend += ord.total;
      entry.orders += 1;
      if (ord.createdAt > entry.lastOrder) {
        entry.lastOrder = ord.createdAt;
      }
      storeSpendMap.set(ord.storeId, entry);

      for (const item of ord.items) {
        productQtyMap.set(
          item.productName,
          (productQtyMap.get(item.productName) || 0) + item.quantity,
        );
      }
    }

    const sortedStoreEntries = [...storeSpendMap.entries()].sort((a, b) => {
      if (b[1].spend !== a[1].spend) return b[1].spend - a[1].spend;
      if (b[1].orders !== a[1].orders) return b[1].orders - a[1].orders;
      return b[1].lastOrder.getTime() - a[1].lastOrder.getTime();
    });

    const favouriteStoreId = sortedStoreEntries[0]?.[0] ?? null;

    const favouriteBranch = sortedStoreEntries[0]
      ? {
          name: sortedStoreEntries[0][1].name,
          city: sortedStoreEntries[0][1].city,
          spend: sortedStoreEntries[0][1].spend,
          orders: sortedStoreEntries[0][1].orders,
        }
      : null;

    const branchOrderMap = new Map<
      string,
      { id: string; name: string; city: string; ordersCount: number }
    >();
    for (const ord of orders) {
      const existing = branchOrderMap.get(ord.storeId) || {
        id: ord.storeId,
        name: ord.store.name,
        city: ord.store.city,
        ordersCount: 0,
      };
      existing.ordersCount += 1;
      branchOrderMap.set(ord.storeId, existing);
    }
    const orderBranches = [...branchOrderMap.values()]
      .sort((a, b) => {
        if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
        return a.name.localeCompare(b.name);
      })
      .map((branch) => ({
        ...branch,
        isFavourite: branch.id === favouriteStoreId,
      }));

    const sortedProducts = [...productQtyMap.entries()].sort((a, b) => b[1] - a[1]);
    const favouriteItem = sortedProducts[0]
      ? { productName: sortedProducts[0][0], quantity: sortedProducts[0][1] }
      : null;

    // 2. Refunds (status COMPLETE vs PENDING/RECEIVED)
    const refunds = await prisma.refund.findMany({
      where: {
        order: { userId: id },
      },
      select: {
        id: true,
        status: true,
        refundAmount: true,
        order: {
          select: {
            paymentMethod: true,
          },
        },
      },
    });

    let refundedTotal = 0;
    let refundedCash = 0;
    let refundedOnline = 0;
    let pendingRefundsCount = 0;
    let pendingRefundsLkr = 0;

    for (const r of refunds) {
      const amt = r.refundAmount || 0;
      if (r.status === 'COMPLETE') {
        refundedTotal += amt;
        if (r.order?.paymentMethod === 'CASH_ON_DELIVERY' || r.order?.paymentMethod === 'CASH_AT_COUNTER') {
          refundedCash += amt;
        } else {
          refundedOnline += amt;
        }
      } else if (r.status !== 'REJECTED') {
        // Pending / Received / In Review
        pendingRefundsCount += 1;
        pendingRefundsLkr += amt;
      }
    }

    // 3. Cancelled orders
    const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');
    let customerCancelled = 0;
    let cashierCancelled = 0;

    for (const o of cancelledOrders) {
      if (
        o.cancelReason === 'CUSTOMER_REQUEST' ||
        (o.cancelledBy && o.cancelledBy.toLowerCase().includes('customer'))
      ) {
        customerCancelled += 1;
      } else {
        cashierCancelled += 1;
      }
    }

    // 4. Loyalty points (current balance, lifetime earned vs redeemed)
    const loyaltyTxns = await prisma.loyaltyTransaction.findMany({
      where: { userId: id },
      select: { points: true, type: true },
    });

    let lifetimeEarned = 0;
    let lifetimeRedeemed = 0;

    for (const tx of loyaltyTxns) {
      if (tx.points > 0 || tx.type.toLowerCase() === 'earn') {
        lifetimeEarned += Math.abs(tx.points);
      } else if (tx.points < 0 || tx.type.toLowerCase() === 'redeem') {
        lifetimeRedeemed += Math.abs(tx.points);
      }
    }

    // 5. Addresses and last delivery address used
    const latestDeliveryOrder = orders.find((o) => o.orderMode === 'DELIVERY');
    const addresses = user.addresses.map((addr) => {
      const isLastUsed = Boolean(
        latestDeliveryOrder &&
          (latestDeliveryOrder.addressId === addr.id ||
            (latestDeliveryOrder.deliveryAddressLine &&
              latestDeliveryOrder.deliveryAddressLine.toLowerCase() === addr.addressLine.toLowerCase())),
      );

      return {
        id: addr.id,
        label: addr.label,
        addressLine: addr.addressLine,
        city: addr.city,
        district: addr.district,
        lat: addr.lat,
        lng: addr.lng,
        isDefault: addr.isDefault,
        createdAt: addr.createdAt,
        isLastDeliveryUsed: isLastUsed,
      };
    });

    // 6. Referrer details
    let referrer: { id: string; name: string; phoneMasked: string } | null = null;
    if (user.referredBy) {
      const refPhone = user.referredBy.phone ? normalizePhone(user.referredBy.phone) : '';
      const phoneLast4 = refPhone.length >= 4 ? refPhone.slice(-4) : refPhone;
      referrer = {
        id: user.referredBy.id,
        name: resolveCustomerDisplayName(user.referredBy.name, user.referredBy.phone),
        phoneMasked: phoneLast4 ? `••• ${phoneLast4}` : '—',
      };
    }

    const payload = {
      id: user.id,
      name: resolveCustomerDisplayName(user.name, user.phone),
      phone: user.phone, // Unmasked on profile for Super Admin
      isInvalidPhone: isInvalidGuestPhone(user.phone),
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      status: userStatus,
      deletedAt: user.deletedAt,
      bannedAt: user.bannedAt,
      bannedReason: user.bannedReason,
      referredBy: referrer,
      referralsCount: user._count.referrals,
      kpis: {
        favouriteBranch,
        favouriteItem,
        totalSpend,
        refundedTotal,
        refundedCash,
        refundedOnline,
        pendingRefundsCount,
        pendingRefundsLkr,
        cancelledCount: cancelledOrders.length,
        customerCancelled,
        cashierCancelled,
        loyaltyPoints: user.loyaltyPoints,
        lifetimeEarned,
        lifetimeRedeemed,
        ordersTotalCount: orders.length,
      },
      addresses,
      orderBranches,
      auditLogs: user.customerAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        reason: log.reason,
        createdAt: log.createdAt,
        admin: {
          id: log.admin.id,
          name: log.admin.name,
          email: log.admin.email,
        },
      })),
    };

    return success(res, payload);
  } catch (err) {
    next(err);
  }
}

const customerOrdersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  storeId: z.string().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  cancelledOnly: z.enum(['true', 'false']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/**
 * GET /admin/customers/:id/orders
 * Paginated order details for the customer profile.
 */
export async function getCustomerOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const query = customerOrdersQuerySchema.parse(req.query);
    const { page, limit, storeId, status, paymentStatus, cancelledOnly, from, to } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId: id };

    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (cancelledOnly === 'true') where.status = 'CANCELLED';

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00+05:30`);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59+05:30`);
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          orderMode: true,
          status: true,
          paymentMethod: true,
          paymentGateway: true,
          paymentStatus: true,
          total: true,
          channel: true,
          createdAt: true,
          cancelReason: true,
          cancelledBy: true,
          statusEvents: {
            where: { status: 'CANCELLED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { note: true },
          },
          store: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
          refund: {
            select: {
              id: true,
              status: true,
              refundAmount: true,
            },
          },
        },
      }),
    ]);

    const data = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderMode: o.orderMode,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentGateway: o.paymentGateway,
      paymentStatus: o.paymentStatus,
      total: o.total,
      channel: o.channel,
      createdAt: o.createdAt,
      cancelReason: o.cancelReason,
      cancelledBy: o.cancelledBy,
      cancellationNote: o.statusEvents[0]?.note ?? null,
      store: o.store,
      refund: o.refund
        ? {
            id: o.refund.id,
            status: o.refund.status,
            amount: o.refund.refundAmount,
          }
        : null,
    }));

    return success(res, {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/customers/:id/loyalty
 * Timeline from LoyaltyTransaction for this customer.
 */
export async function getCustomerLoyaltyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, transactions] = await Promise.all([
      prisma.loyaltyTransaction.count({ where: { userId: id } }),
      prisma.loyaltyTransaction.findMany({
        where: { userId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Fetch order numbers for transactions with orderId
    const orderIds = transactions.map((t) => t.orderId).filter(Boolean) as string[];
    const orderMap = new Map<string, string>();
    if (orderIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true },
      });
      for (const ord of orders) {
        orderMap.set(ord.id, ord.orderNumber);
      }
    }

    const data = transactions.map((t) => ({
      id: t.id,
      points: t.points,
      type: t.type,
      note: t.note,
      orderId: t.orderId,
      orderNumber: t.orderId ? orderMap.get(t.orderId) || null : null,
      createdAt: t.createdAt,
    }));

    return success(res, {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

const banCustomerSchema = z.object({
  reason: z.string().min(2, 'Ban reason is required'),
  category: z.enum(['ABUSE', 'FRAUD', 'CHARGEBACK', 'OTHER']).default('OTHER'),
});

/**
 * POST /admin/customers/:id/ban
 * SYSTEM_ADMIN only: Ban an active customer account.
 */
export async function banCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user?.sub;
    if (!adminId) throw new AppError('Unauthorized', 401);

    const id = String(req.params.id);
    const body = banCustomerSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, bannedAt: true, phone: true },
    });

    if (!user) {
      throw new AppError('Customer not found', 404);
    }

    if (user.deletedAt) {
      throw new AppError('Cannot ban a deleted account', 400);
    }

    if (user.bannedAt) {
      throw new AppError('Account is already banned', 400);
    }

    const fullReason = `[${body.category}] ${body.reason.trim()}`;

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          bannedAt: new Date(),
          bannedReason: fullReason,
        },
      }),
      prisma.customerAuditLog.create({
        data: {
          adminId,
          customerId: id,
          action: 'BAN',
          reason: fullReason,
        },
      }),
    ]);

    return success(res, {
      id: updated.id,
      bannedAt: updated.bannedAt,
      bannedReason: updated.bannedReason,
      message: 'Customer account banned successfully',
    });
  } catch (err) {
    next(err);
  }
}

const restoreCustomerSchema = z.object({
  reason: z.string().min(2, 'Restore reason is required'),
});

/**
 * POST /admin/customers/:id/restore
 * SYSTEM_ADMIN only: Restore a banned or deleted customer account.
 */
export async function restoreCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user?.sub;
    if (!adminId) throw new AppError('Unauthorized', 401);

    const id = String(req.params.id);
    const body = restoreCustomerSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, deletedAt: true, bannedAt: true },
    });

    if (!user) {
      throw new AppError('Customer not found', 404);
    }

    if (!user.deletedAt && !user.bannedAt) {
      throw new AppError('Account is already active', 400);
    }

    // Phone collision check: Cannot restore if phone is currently used by another active account
    const phone = user.phone;
    if (phone.startsWith('deleted:')) {
      throw new AppError(
        'Cannot restore this account: The phone number was re-assigned or archived upon account creation.',
        409,
        'PHONE_CONFLICT',
      );
    }

    const activeConflict = await prisma.user.findFirst({
      where: {
        id: { not: id },
        phone: { in: phoneLookupVariants(phone) },
        deletedAt: null,
        bannedAt: null,
      },
    });

    if (activeConflict) {
      throw new AppError(
        'Cannot restore account: Phone number is already used by another active account.',
        409,
        'PHONE_CONFLICT',
      );
    }

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          deletedAt: null,
          bannedAt: null,
          bannedReason: null,
        },
      }),
      prisma.customerAuditLog.create({
        data: {
          adminId,
          customerId: id,
          action: 'RESTORE',
          reason: body.reason.trim(),
        },
      }),
    ]);

    return success(res, {
      id: updated.id,
      deletedAt: updated.deletedAt,
      bannedAt: updated.bannedAt,
      message: 'Customer account restored successfully',
    });
  } catch (err) {
    next(err);
  }
}
