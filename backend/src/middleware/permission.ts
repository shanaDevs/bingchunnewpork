import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './errorHandler';

type Action = 'create' | 'read' | 'update' | 'delete';

export function requireAnyPermission(menus: string[], action: Action) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user || req.user.type !== 'admin') {
        throw new AppError('Forbidden', 403);
      }

      const adminUser = await prisma.adminUser.findUnique({
        where: { id: req.user.sub },
        include: { role: true },
      });

      if (!adminUser || !adminUser.isActive) {
        throw new AppError('Forbidden', 403);
      }

      if (!adminUser.role?.name) {
        throw new AppError('Admin account is missing a role assignment', 403);
      }

      if (adminUser.role.name === 'SYSTEM_ADMIN') {
        return next();
      }

      const perms = await prisma.permission.findMany({
        where: {
          adminUserId: adminUser.id,
          menu: { in: menus },
        },
      });

      const hasAccess = perms.some((perm) => {
        switch (action) {
          case 'create':
            return perm.canCreate;
          case 'read':
            return perm.canRead;
          case 'update':
            return perm.canUpdate;
          case 'delete':
            return perm.canDelete;
          default:
            return false;
        }
      });

      if (!hasAccess) {
        throw new AppError(`Permission denied: Cannot ${action} ${menus.join(' or ')}`, 403);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Throws if the current admin lacks the given menu action (SYSTEM_ADMIN always passes). */
export async function assertMenuAction(req: Request, menu: string, action: Action): Promise<void> {
  if (!req.user || req.user.type !== 'admin') {
    throw new AppError('Forbidden', 403);
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { id: req.user.sub },
    include: { role: true },
  });

  if (!adminUser || !adminUser.isActive) {
    throw new AppError('Forbidden', 403);
  }

  if (!adminUser.role?.name) {
    throw new AppError('Admin account is missing a role assignment', 403);
  }

  if (adminUser.role.name === 'SYSTEM_ADMIN') {
    return;
  }

  const perm = await prisma.permission.findUnique({
    where: {
      adminUserId_menu: {
        adminUserId: adminUser.id,
        menu,
      },
    },
  });

  if (!perm) {
    throw new AppError(`Permission denied: Missing access to ${menu}`, 403);
  }

  let hasAccess = false;
  switch (action) {
    case 'create':
      hasAccess = perm.canCreate;
      break;
    case 'read':
      hasAccess = perm.canRead;
      break;
    case 'update':
      hasAccess = perm.canUpdate;
      break;
    case 'delete':
      hasAccess = perm.canDelete;
      break;
  }

  if (!hasAccess) {
    throw new AppError(`Permission denied: Cannot ${action} ${menu}`, 403);
  }
}

export function requirePermission(menu: string, action: Action) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await assertMenuAction(req, menu, action);
      next();
    } catch (err) {
      next(err);
    }
  };
}
