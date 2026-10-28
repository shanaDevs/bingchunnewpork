import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success, paginated } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { resolveBranchStoreId } from '../middleware/auth';
import { assertMenuAction } from '../middleware/permission';
import {
  buildDefaultPermissionRows,
  getDefaultMenusForRole,
} from '../constants/defaultPermissions';

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: { select: { name: true } },
  storeId: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  store: { select: { id: true, name: true, city: true } },
} as const;

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = (req.query.search as string || '').trim();
    const branchStoreId = await resolveBranchStoreId(req);

    const excludeSuperAdmin =
      req.user?.role !== 'SYSTEM_ADMIN' ? { NOT: { role: { name: 'SYSTEM_ADMIN' } } } : {};

    const where = {
      ...excludeSuperAdmin,
      ...(branchStoreId ? { storeId: branchStoreId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        select: adminUserSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminUser.count({ where }),
    ]);

    return paginated(res, users, total, page, limit);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const branchStoreId = await resolveBranchStoreId(req);
    const user = await prisma.adminUser.findFirst({
      where: { id, ...(branchStoreId ? { storeId: branchStoreId } : {}) },
      select: adminUserSelect,
    });
    
    if (!user) {
      throw new AppError('Staff member not found', 404);
    }
    
    return success(res, user);
  } catch (err) {
    next(err);
  }
}

const updateAdminUserSchema = z.object({
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Quick Actions on the staff manage page: reset password and activate/deactivate.
 * Status changes require USERS delete; password changes require USERS update.
 */
export async function updateAdminUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const data = updateAdminUserSchema.parse(req.body);

    const changingStatus = data.isActive !== undefined;
    const changingPassword = data.password !== undefined;
    if (!changingStatus && !changingPassword) {
      throw new AppError('No changes provided', 400);
    }
    if (changingStatus) {
      await assertMenuAction(req, 'USERS', 'delete');
    }
    if (changingPassword) {
      await assertMenuAction(req, 'USERS', 'update');
    }

    const existing = await prisma.adminUser.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) {
      throw new AppError('Staff member not found', 404);
    }

    if (changingStatus && req.user?.sub === id) {
      throw new AppError('You cannot change the status of your own account', 400);
    }
    if (changingStatus && existing.role.name === 'SYSTEM_ADMIN' && data.isActive === false) {
      throw new AppError('System admin accounts cannot be deactivated here', 400);
    }
    if (changingPassword && existing.role.name === 'SYSTEM_ADMIN' && req.user?.role !== 'SYSTEM_ADMIN') {
      throw new AppError('Cannot reset a SYSTEM_ADMIN password', 403);
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
    const shouldBumpTokenVersion = changingPassword || changingStatus;

    const user = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        ...(shouldBumpTokenVersion ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: adminUserSelect,
    });

    return success(res, user);
  } catch (err) {
    next(err);
  }
}

const branchManagerSelect = {
  id: true,
  name: true,
  email: true,
  role: { select: { name: true } },
  storeId: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  store: { select: { id: true, name: true, city: true } },
} as const;

const createBranchManagerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  storeId: z.string().min(1),
});

const createCashierSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  storeId: z.string().min(1).optional(),
});

const updateBranchManagerSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  storeId: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

/** Staff types the admin can assign when creating an account. */
const CREATABLE_ROLES = ['STORE_MANAGER', 'CASHIER', 'DELIVERY_ADMIN'] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

/** Delivery admins are headquarters accounts — they are never linked to one branch. */
const HQ_ROLES: ReadonlySet<CreatableRole> = new Set(['DELIVERY_ADMIN']);

async function assertUniqueCashierName(storeId: string, name: string, excludeId?: string) {
  const clash = await prisma.adminUser.findFirst({
    where: {
      storeId,
      role: { name: 'CASHIER' },
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('A cashier with this name already exists at this branch', 409);
  }
}

/**
 * The single creation path for every staff type: validates the branch and email,
 * hashes the password, then creates the account and seeds the role's default
 * permission matrix in one transaction.
 */
async function createStaffMember(input: {
  name: string;
  email: string;
  password: string;
  role: CreatableRole;
  storeId?: string | null;
}) {
  if (input.storeId) {
    const store = await prisma.store.findUnique({ where: { id: input.storeId } });
    if (!store) throw new AppError('Store not found', 404);
  }

  if (input.role === 'CASHIER' && input.storeId) {
    await assertUniqueCashierName(input.storeId, input.name);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError('Email already registered', 409);

  const passwordHash = await bcrypt.hash(input.password, 12);

  return prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        // connectOrCreate so an environment that has not re-seeded still works.
        role: {
          connectOrCreate: { where: { name: input.role }, create: { name: input.role } },
        },
        ...(input.storeId
          ? {
              store: { connect: { id: input.storeId } },
              // Keep Branch Access Management in sync with the primary branch.
              accessibleStores: { connect: [{ id: input.storeId }] },
            }
          : {}),
      },
      select: adminUserSelect,
    });

    const menus = getDefaultMenusForRole(input.role);
    if (menus.length > 0) {
      await tx.permission.createMany({ data: buildDefaultPermissionRows(created.id, menus) });
    }

    return created;
  });
}

const createAdminUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(CREATABLE_ROLES),
  storeId: z.string().min(1).optional(),
});

export async function createAdminUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAdminUserSchema.parse(req.body);
    const isHqRole = HQ_ROLES.has(data.role);

    if (isHqRole && data.storeId) {
      throw new AppError('Delivery admins cover all branches and cannot be linked to one', 400);
    }
    if (!isHqRole && !data.storeId) {
      throw new AppError('Branch is required for this staff type', 400);
    }

    const user = await createStaffMember({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
      storeId: isHqRole ? null : data.storeId,
    });

    return success(res, user, 201);
  } catch (err) {
    next(err);
  }
}

export async function listBranchManagers(req: Request, res: Response, next: NextFunction) {
  try {
    const branchStoreId = await resolveBranchStoreId(req);
    const managers = await prisma.adminUser.findMany({
      where: {
        role: { name: 'STORE_MANAGER' },
        ...(branchStoreId ? { storeId: branchStoreId } : {}),
      },
      select: branchManagerSelect,
      orderBy: [{ store: { name: 'asc' } }, { name: 'asc' }],
    });
    return success(res, managers);
  } catch (err) {
    next(err);
  }
}

export async function createBranchManager(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBranchManagerSchema.parse(req.body);
    const manager = await createStaffMember({ ...data, role: 'STORE_MANAGER' });
    return success(res, manager, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateBranchManager(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const data = updateBranchManagerSchema.parse(req.body);
    const branchStoreId = await resolveBranchStoreId(req);

    const existing = await prisma.adminUser.findUnique({ where: { id }, include: { role: true } });
    if (!existing || existing.role.name !== 'STORE_MANAGER') {
      throw new AppError('Branch manager not found', 404);
    }
    if (branchStoreId && existing.storeId !== branchStoreId) {
      throw new AppError('Branch manager not found', 404);
    }
    if (branchStoreId && data.storeId && data.storeId !== branchStoreId) {
      throw new AppError('You cannot move staff to another branch', 403);
    }

    if (data.storeId) {
      const store = await prisma.store.findUnique({ where: { id: data.storeId } });
      if (!store) throw new AppError('Store not found', 404);
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.adminUser.findUnique({ where: { email: data.email } });
      if (emailTaken) throw new AppError('Email already registered', 409);
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
    const changingStatus = data.isActive !== undefined;
    const changingPassword = data.password !== undefined;
    const shouldBumpTokenVersion = changingPassword || changingStatus;

    const manager = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.storeId !== undefined
          ? {
              storeId: data.storeId,
              accessibleStores: { connect: [{ id: data.storeId }] },
            }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        ...(shouldBumpTokenVersion ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: branchManagerSelect,
    });

    return success(res, manager);
  } catch (err) {
    next(err);
  }
}

export async function listCashiers(req: Request, res: Response, next: NextFunction) {
  try {
    const branchStoreId = await resolveBranchStoreId(req);
    const cashiers = await prisma.adminUser.findMany({
      where: {
        role: { name: 'CASHIER' },
        ...(branchStoreId ? { storeId: branchStoreId } : {}),
      },
      select: branchManagerSelect,
      orderBy: [{ name: 'asc' }],
    });
    return success(res, cashiers);
  } catch (err) {
    next(err);
  }
}

export async function createCashier(req: Request, res: Response, next: NextFunction) {
  try {
    const branchStoreId = await resolveBranchStoreId(req);
    const data = createCashierSchema.parse(req.body);
    const storeId = branchStoreId ?? data.storeId;
    if (!storeId) throw new AppError('Store is required', 400);

    const cashier = await createStaffMember({
      name: data.name,
      email: data.email,
      password: data.password,
      role: 'CASHIER',
      storeId,
    });

    return success(res, cashier, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCashier(req: Request, res: Response, next: NextFunction) {
  try {
    const branchStoreId = await resolveBranchStoreId(req);
    const id = req.params.id as string;
    const data = updateBranchManagerSchema.parse(req.body);

    const changingStatus = data.isActive !== undefined;
    const changingDetails =
      data.name !== undefined || data.email !== undefined || data.password !== undefined;
    if (!changingStatus && !changingDetails) {
      throw new AppError('No changes provided', 400);
    }
    // Activate/deactivate maps to Delete; name/email/password maps to Update.
    if (changingStatus) {
      await assertMenuAction(req, 'CASHIERS', 'delete');
    }
    if (changingDetails) {
      await assertMenuAction(req, 'CASHIERS', 'update');
    }

    const existing = await prisma.adminUser.findUnique({ where: { id }, include: { role: true } });
    if (!existing || existing.role.name !== 'CASHIER') {
      throw new AppError('Cashier not found', 404);
    }
    if (branchStoreId && existing.storeId !== branchStoreId) {
      throw new AppError('Cashier not found', 404);
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.adminUser.findUnique({ where: { email: data.email } });
      if (emailTaken) throw new AppError('Email already registered', 409);
    }

    if (data.name && data.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      const storeId = existing.storeId;
      if (storeId) await assertUniqueCashierName(storeId, data.name, existing.id);
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
    const changingPassword = data.password !== undefined;
    const shouldBumpTokenVersion = changingStatus || changingPassword;

    const cashier = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        ...(shouldBumpTokenVersion ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: branchManagerSelect,
    });

    return success(res, cashier);
  } catch (err) {
    next(err);
  }
}

export async function getPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const permissions = await prisma.permission.findMany({
      where: { adminUserId: id },
      select: {
        id: true,
        menu: true,
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
      },
    });

    return success(res, permissions);
  } catch (err) {
    next(err);
  }
}

export async function getMyPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.user!.sub;
    const permissions = await prisma.permission.findMany({
      where: { adminUserId: id },
      select: {
        menu: true,
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
      },
    });

    return success(res, permissions);
  } catch (err) {
    next(err);
  }
}

const VALID_MENUS = [
  'DASHBOARD',
  'ORDERS',
  'DELIVERY',
  'LIVE_DRIVERS',
  'STOCK',
  'SALES',
  'WALLET',
  'PAYMENT_HISTORY',
  'CASHIERS',
  'BRANCH_MANAGERS',
  'PROMOS',
  'REPORTS',
  'SETTINGS',
  'USERS',
  'DELIVERY_WALLET',
] as const;

const updatePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      menu: z.enum(VALID_MENUS),
      canCreate: z.boolean(),
      canRead: z.boolean(),
      canUpdate: z.boolean(),
      canDelete: z.boolean(),
    })
  ),
});

export async function updatePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { permissions } = updatePermissionsSchema.parse(req.body);

    if (id === req.user?.sub) {
      throw new AppError('Cannot edit your own permissions', 403);
    }

    const target = await prisma.adminUser.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!target) throw new AppError('User not found', 404);
    if (target.role.name === 'SYSTEM_ADMIN') {
      throw new AppError('Cannot modify SYSTEM_ADMIN permissions', 403);
    }

    // Replace all permissions for this user in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.permission.deleteMany({ where: { adminUserId: id } });

      if (permissions.length > 0) {
        await tx.permission.createMany({
          data: permissions.map((p) => ({
            adminUserId: id,
            menu: p.menu,
            canCreate: p.canCreate,
            canRead: p.canRead,
            canUpdate: p.canUpdate,
            canDelete: p.canDelete,
          })),
        });
      }
    });

    return success(res, { message: 'Permissions updated successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getUserStores(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    // Load primary branch first — this is what branch managers / cashiers are created with.
    const user = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        storeId: true,
        store: { select: { id: true, name: true, city: true } },
      },
    });
    if (!user) throw new AppError('User not found', 404);

    const byId = new Map<string, { id: string; name: string; city: string }>();
    if (user.store) {
      byId.set(user.store.id, user.store);
    } else if (user.storeId) {
      const store = await prisma.store.findUnique({
        where: { id: user.storeId },
        select: { id: true, name: true, city: true },
      });
      if (store) byId.set(store.id, store);
    }

    // Extra multi-branch access (optional; join table may be absent in older DBs).
    try {
      const withAccess = await prisma.adminUser.findUnique({
        where: { id },
        select: { accessibleStores: { select: { id: true, name: true, city: true } } },
      });
      for (const store of withAccess?.accessibleStores ?? []) {
        byId.set(store.id, store);
      }
    } catch {
      /* primary store alone is enough for the profile display */
    }

    return success(res, [...byId.values()]);
  } catch (err) {
    next(err);
  }
}

const updateUserStoresSchema = z.object({
  storeIds: z.array(z.string()),
});

export async function updateUserStores(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { storeIds } = updateUserStoresSchema.parse(req.body);

    const user = await prisma.adminUser.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new AppError('User not found', 404);

    // Branch managers and cashiers are single-branch accounts.
    const singleBranchRoles = new Set(['STORE_MANAGER', 'CASHIER']);
    if (singleBranchRoles.has(user.role.name) && storeIds.length > 1) {
      throw new AppError('This staff type can only be assigned to one branch', 400);
    }

    await prisma.adminUser.update({
      where: { id },
      data: {
        accessibleStores: {
          set: storeIds.map((storeId) => ({ id: storeId })),
        },
        ...(singleBranchRoles.has(user.role.name) && storeIds[0]
          ? { storeId: storeIds[0] }
          : {}),
      },
    });

    return success(res, { message: 'Accessible stores updated successfully' });
  } catch (err) {
    next(err);
  }
}
