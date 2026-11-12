import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';
import { requireSystemAdmin } from '../../src/middleware/auth';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    role: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    permission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/middleware/permission', () => ({
  assertMenuAction: vi.fn(),
}));

vi.mock('../../src/lib/verifyAdminPin', () => ({
  verifyAdminPin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async () => 'new-hash'),
  },
}));

import { createRole, deleteRole, updateRole } from '../../src/controllers/roleController';
import { listUsers, updateAdminUser, updatePermissions } from '../../src/controllers/adminUserController';
import { prisma } from '../../src/lib/prisma';
import { assertMenuAction } from '../../src/middleware/permission';
import { verifyAdminPin } from '../../src/lib/verifyAdminPin';

describe('ROLE-001 roleController security', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects creating a role with a reserved name', async () => {
    const req = createMockReq({ body: { name: 'CASHIER' } });
    const res = createMockRes();

    await createRole(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.role.create).not.toHaveBeenCalled();
  });

  it('rejects renaming a built-in role', async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: 'role-sm',
      name: 'STORE_MANAGER',
    } as never);

    const req = createMockReq({
      params: { id: 'role-sm' },
      body: { name: 'BRANCH_OPS' },
    });
    const res = createMockRes();

    await updateRole(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Built-in roles cannot be renamed');
    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it('rejects renaming a custom role to a reserved name', async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: 'role-custom',
      name: 'CUSTOM_ROLE',
    } as never);

    const req = createMockReq({
      params: { id: 'role-custom' },
      body: { name: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await updateRole(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cannot rename a role to a reserved name');
    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it('allows renaming a custom role to a non-reserved name', async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: 'role-custom',
      name: 'CUSTOM_ROLE',
    } as never);
    vi.mocked(prisma.role.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.update).mockResolvedValue({
      id: 'role-custom',
      name: 'CUSTOM_OPS',
    } as never);

    const req = createMockReq({
      params: { id: 'role-custom' },
      body: { name: 'CUSTOM_OPS' },
    });
    const res = createMockRes();

    await updateRole(req, res, next);

    expect(prisma.role.update).toHaveBeenCalledWith({
      where: { id: 'role-custom' },
      data: { name: 'CUSTOM_OPS' },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'role-custom', name: 'CUSTOM_OPS' },
    });
  });

  it('rejects deleting a built-in role', async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: 'role-sm',
      name: 'STORE_MANAGER',
      _count: { users: 0 },
    } as never);

    const req = createMockReq({ params: { id: 'role-sm' } });
    const res = createMockRes();

    await deleteRole(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Built-in roles cannot be deleted');
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });
});

describe('ROLE-001 requireSystemAdmin route gate', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects STORE_MANAGER on role routes (simulated PUT /admin/roles/:id)', async () => {
    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });

    await requireSystemAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });
});

describe('ROLE-002 updatePermissions security', () => {
  const next = createMockNext();
  const permissionRow = {
    menu: 'ORDERS',
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminPin).mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(prisma as never));
  });

  it('rejects updates without a PIN', async () => {
    const req = createMockReq({
      params: { id: 'staff-1' },
      user: { sub: 'admin-other', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { permissions: [permissionRow] },
    });
    const res = createMockRes();

    await updatePermissions(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    expect(verifyAdminPin).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid PIN before mutating permissions', async () => {
    vi.mocked(verifyAdminPin).mockRejectedValue(new AppError('Invalid PIN', 401));

    const req = createMockReq({
      params: { id: 'staff-1' },
      user: { sub: 'admin-other', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { password: 'wrong', permissions: [permissionRow] },
    });
    const res = createMockRes();

    await updatePermissions(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-other', 'wrong');
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid PIN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects self-permission edits', async () => {
    const req = createMockReq({
      params: { id: 'admin-self' },
      user: { sub: 'admin-self', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { password: 'secret-pin', permissions: [permissionRow] },
    });
    const res = createMockRes();

    await updatePermissions(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-self', 'secret-pin');
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cannot edit your own permissions');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects modifying SYSTEM_ADMIN permissions', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'super-1',
      role: { name: 'SYSTEM_ADMIN' },
    } as never);

    const req = createMockReq({
      params: { id: 'super-1' },
      user: { sub: 'admin-other', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { password: 'secret-pin', permissions: [permissionRow] },
    });
    const res = createMockRes();

    await updatePermissions(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cannot modify SYSTEM_ADMIN permissions');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown menu names via schema validation', async () => {
    const req = createMockReq({
      params: { id: 'staff-1' },
      user: { sub: 'admin-other', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: {
        password: 'secret-pin',
        permissions: [{ menu: 'FAKE_MENU', canCreate: true, canRead: true, canUpdate: true, canDelete: true }],
      },
    });
    const res = createMockRes();

    await updatePermissions(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    expect(verifyAdminPin).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows valid permission updates for non-SYSTEM_ADMIN targets', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'staff-1',
      role: { name: 'STORE_MANAGER' },
    } as never);

    const req = createMockReq({
      params: { id: 'staff-1' },
      user: { sub: 'admin-other', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: {
        password: 'secret-pin',
        permissions: [{ menu: 'ORDERS', canCreate: false, canRead: true, canUpdate: true, canDelete: false }],
      },
    });
    const res = createMockRes();

    await updatePermissions(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-other', 'secret-pin');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Permissions updated successfully' },
    });
  });
});

describe('ROLE-003 updateAdminUser password security', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertMenuAction).mockResolvedValue(undefined);
  });

  it('rejects non-SYSTEM_ADMIN resetting a SYSTEM_ADMIN password', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'super-1',
      role: { name: 'SYSTEM_ADMIN' },
    } as never);

    const req = createMockReq({
      params: { id: 'super-1' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
      body: { password: 'NewPass@123' },
    });
    const res = createMockRes();

    await updateAdminUser(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cannot reset a SYSTEM_ADMIN password');
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it('allows SYSTEM_ADMIN to reset another SYSTEM_ADMIN password and bumps tokenVersion', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'super-1',
      role: { name: 'SYSTEM_ADMIN' },
    } as never);
    vi.mocked(prisma.adminUser.update).mockResolvedValue({
      id: 'super-1',
      name: 'Super',
      email: 'super@example.com',
      role: { name: 'SYSTEM_ADMIN' },
    } as never);

    const req = createMockReq({
      params: { id: 'super-1' },
      user: { sub: 'super-2', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { password: 'NewPass@123' },
    });
    const res = createMockRes();

    await updateAdminUser(req, res, next);

    expect(prisma.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: 'new-hash',
          tokenVersion: { increment: 1 },
        }),
      }),
    );
    expect(res.json).toHaveBeenCalled();
  });
});

describe('ROLE-014 listUsers security', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0 as never);
  });

  it('excludes SYSTEM_ADMIN accounts for non-super-admin callers', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await listUsers(req, res, next);

    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { role: { name: 'SYSTEM_ADMIN' } },
        }),
      }),
    );
  });

  it('includes all accounts for SYSTEM_ADMIN callers', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'super-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await listUsers(req, res, next);

    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          NOT: { role: { name: 'SYSTEM_ADMIN' } },
        }),
      }),
    );
  });
});
