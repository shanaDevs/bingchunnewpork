import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';

const BUILT_IN_ROLE_NAMES = Object.freeze(
  new Set(['SYSTEM_ADMIN', 'STORE_MANAGER', 'CASHIER', 'DELIVERY_ADMIN', 'DELIVERY_DRIVER']),
);

const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(50),
});

export async function getRoles(_req: Request, res: Response, next: NextFunction) {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
    return success(res, roles);
  } catch (err) {
    next(err);
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = createRoleSchema.parse(req.body);
    const formattedName = name.toUpperCase().replace(/\s+/g, '_');

    if (BUILT_IN_ROLE_NAMES.has(formattedName)) {
      throw new AppError('Cannot create a role with a reserved name', 403);
    }

    const existing = await prisma.role.findUnique({ where: { name: formattedName } });
    if (existing) throw new AppError('Role already exists', 409);

    const role = await prisma.role.create({ data: { name: formattedName } });
    return success(res, role, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { name } = updateRoleSchema.parse(req.body);
    const formattedName = name.toUpperCase().replace(/\s+/g, '_');

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) throw new AppError('Role not found', 404);

    if (BUILT_IN_ROLE_NAMES.has(existing.name)) {
      throw new AppError('Built-in roles cannot be renamed', 403);
    }
    if (BUILT_IN_ROLE_NAMES.has(formattedName)) {
      throw new AppError('Cannot rename a role to a reserved name', 403);
    }

    const duplicate = await prisma.role.findFirst({
      where: { name: formattedName, id: { not: id } }
    });
    if (duplicate) throw new AppError('Role name already in use', 409);

    const role = await prisma.role.update({
      where: { id },
      data: { name: formattedName },
    });
    return success(res, role);
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    
    const existing = await prisma.role.findUnique({ 
      where: { id },
      include: { _count: { select: { users: true } } }
    });
    
    if (!existing) throw new AppError('Role not found', 404);
    if (BUILT_IN_ROLE_NAMES.has(existing.name)) {
      throw new AppError('Built-in roles cannot be deleted', 403);
    }
    if (existing._count.users > 0) {
      throw new AppError('Cannot delete role. It is assigned to users.', 400);
    }

    await prisma.role.delete({ where: { id } });
    return success(res, { message: 'Role deleted successfully' });
  } catch (err) {
    next(err);
  }
}
