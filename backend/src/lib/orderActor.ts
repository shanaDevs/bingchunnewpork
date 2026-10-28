import type { Request } from 'express';
import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isBranchScopedRole } from '../middleware/auth';

export type OrderActor = {
  adminId: string;
  name: string;
  role: string;
};

type OrderActorDb = {
  order: Pick<Prisma.TransactionClient['order'], 'updateMany'>;
};

/** Branch cashier or store manager from the JWT — never from the request body. */
export async function resolveOrderActor(req: Request): Promise<OrderActor | null> {
  if (req.user?.type !== 'admin' || !req.user.sub) return null;
  if (!isBranchScopedRole(req.user.role)) return null;

  const admin = await prisma.adminUser.findUnique({
    where: { id: req.user.sub },
    select: {
      id: true,
      name: true,
      isActive: true,
      role: { select: { name: true } },
    },
  });
  if (!admin?.isActive) return null;
  if (!isBranchScopedRole(admin.role.name)) return null;

  return {
    adminId: admin.id,
    name: admin.name,
    role: admin.role.name,
  };
}

export function actorEventFields(actor: OrderActor | null): {
  actorAdminId: string;
  actorName: string;
  actorRole: string;
} | Record<string, never> {
  if (!actor) return {};
  return {
    actorAdminId: actor.adminId,
    actorName: actor.name,
    actorRole: actor.role,
  };
}

/** Prisma `orderStatusEvent.create` / nested `statusEvents.create` payload. */
export function orderStatusEventData(
  status: string,
  note: string | null | undefined,
  actor: OrderActor | null,
) {
  return {
    status: status as OrderStatus,
    ...(note != null && note !== '' ? { note } : {}),
    ...actorEventFields(actor),
  };
}

export function nestedOrderStatusEvent(
  status: string,
  note: string | null | undefined,
  actor: OrderActor | null,
) {
  return { create: orderStatusEventData(status, note, actor) };
}

/** First-touch only: a later cashier cannot overwrite who processed the order. */
export async function claimProcessedBy(
  db: OrderActorDb,
  orderId: string,
  actor: OrderActor | null,
): Promise<void> {
  if (!actor) return;
  await db.order.updateMany({
    where: { id: orderId, processedByAdminId: null },
    data: {
      processedByAdminId: actor.adminId,
      processedByName: actor.name,
      processedAt: new Date(),
    },
  });
}

export function stripEventActor(event: unknown): unknown {
  if (!event || typeof event !== 'object') return event;
  const {
    actorAdminId: _actorAdminId,
    actorName: _actorName,
    actorRole: _actorRole,
    actor: _actor,
    ...safe
  } = event as Record<string, unknown>;
  return safe;
}

/** Remove staff identities from customer / guest order payloads. */
export function stripStaffAttribution<T>(order: T): T {
  if (!order || typeof order !== 'object') return order;
  const {
    processedByAdminId: _processedByAdminId,
    processedByName: _processedByName,
    processedAt: _processedAt,
    processedBy: _processedBy,
    statusEvents,
    ...rest
  } = order as T & Record<string, unknown>;

  return {
    ...rest,
    ...(Array.isArray(statusEvents)
      ? { statusEvents: statusEvents.map(stripEventActor) }
      : statusEvents !== undefined
        ? { statusEvents }
        : {}),
  } as T;
}
