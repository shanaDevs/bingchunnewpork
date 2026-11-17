import type { OrderStatus } from '@prisma/client';
import { cancelOrderByCustomer, updateOrderStatus } from '../../controllers/orderController';
import { updateRefundStatus } from '../../controllers/refundController';
import { CUSTOMER_CANCEL_WINDOW_MS } from '../../lib/orderCancel';
import { prisma } from '../../lib/prisma';
import { runHandler, type HarnessUser } from './seedControllerHarness';

export async function resolveBranchStaff(storeId: string): Promise<{
  managerId: string;
  branchStaffId: string;
  branchRole: 'CASHIER' | 'STORE_MANAGER';
}> {
  const manager =
    (await prisma.adminUser.findFirst({
      where: { email: 'branch@bingchunsrilanka.lk', isActive: true },
      select: { id: true },
    })) ??
    (await prisma.adminUser.findFirst({
      where: { storeId, isActive: true, role: { name: 'STORE_MANAGER' } },
      select: { id: true },
    }));
  const cashier = await prisma.adminUser.findFirst({
    where: { storeId, isActive: true, role: { name: 'CASHIER' } },
    select: { id: true },
  });
  if (!manager) throw new Error('No STORE_MANAGER for refund approval — run prisma:seed');
  if (!cashier) throw new Error('No CASHIER for branch — run prisma:seed');
  return { managerId: manager.id, branchStaffId: cashier.id, branchRole: 'CASHIER' };
}

export function patchPrismaTransactionTimeout(): void {
  const origTransaction = prisma.$transaction.bind(prisma);
  (prisma as unknown as { $transaction: typeof prisma.$transaction }).$transaction = (
    fn: Parameters<typeof origTransaction>[0],
    options?: Parameters<typeof origTransaction>[1],
  ) =>
    origTransaction(fn, {
      maxWait: 60_000,
      timeout: 120_000,
      ...(typeof options === 'object' && options !== null ? options : {}),
    });
}

async function setStatus(
  orderId: string,
  status: OrderStatus,
  staff: HarnessUser & { type: 'admin' },
  note?: string,
): Promise<void> {
  await runHandler(updateOrderStatus, {
    method: 'PUT',
    params: { id: orderId },
    user: staff,
    body: { status, note },
  });
}

export async function advanceToPreparing(
  orderId: string,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  if (order.status === 'RECEIVED') {
    await setStatus(orderId, 'PREPARING', staff, 'Seed: move to preparing before refund');
  }
}

export async function expireCancelWindow(orderId: string): Promise<void> {
  const past = new Date(Date.now() - CUSTOMER_CANCEL_WINDOW_MS - 5 * 60 * 1000);
  await prisma.order.update({
    where: { id: orderId },
    data: { cancelWindowStartsAt: past },
  });
}

export async function customerCancelOrder(
  orderId: string,
  customer: HarnessUser & { type: 'user' },
  reason: string,
): Promise<void> {
  await runHandler(cancelOrderByCustomer, {
    method: 'POST',
    params: { id: orderId },
    user: customer,
    body: { cancellationReason: reason },
  });
}

/** Branch reject after accept — refund submittedBy BRANCH_ADMIN (+ LKR 150 gateway penalty). */
export async function branchCancelOrder(
  orderId: string,
  staff: HarnessUser & { type: 'admin' },
  cancelReason: 'OUT_OF_STOCK' | 'CUSTOMER_REQUEST' | 'PAYMENT_OR_SYSTEM_ISSUE' = 'OUT_OF_STOCK',
): Promise<void> {
  await runHandler(updateOrderStatus, {
    method: 'PUT',
    params: { id: orderId },
    user: staff,
    body: {
      status: 'CANCELLED',
      cancelReason,
      note: 'Seed: branch cancelled after accept (gateway penalty)',
    },
  });
}

export async function completeRefundForOrder(
  orderId: string,
  manager: HarnessUser & { type: 'admin' },
): Promise<void> {
  const refund = await prisma.refund.findUnique({ where: { orderId }, select: { id: true } });
  if (!refund) throw new Error(`Expected refund for order ${orderId}`);
  await runHandler(updateRefundStatus, {
    method: 'PUT',
    params: { id: refund.id },
    user: manager,
    body: { status: 'COMPLETE' },
  });
}

export async function shiftRefundTimelines(orderId: string, targetPlacedAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { createdAt: true, updatedAt: true, cancelWindowStartsAt: true },
  });
  if (!order) return;
  const delta = targetPlacedAt.getTime() - order.createdAt.getTime();
  if (delta === 0) return;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      createdAt: targetPlacedAt,
      updatedAt: new Date(order.updatedAt.getTime() + delta),
      cancelWindowStartsAt: order.cancelWindowStartsAt
        ? new Date(order.cancelWindowStartsAt.getTime() + delta)
        : undefined,
    },
  });

  for (const ev of await prisma.orderStatusEvent.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.orderStatusEvent.update({
      where: { id: ev.id },
      data: { createdAt: new Date(ev.createdAt.getTime() + delta) },
    });
  }

  const refund = await prisma.refund.findUnique({
    where: { orderId },
    select: { id: true, createdAt: true, updatedAt: true, processedAt: true, paidAt: true },
  });
  if (refund) {
    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        createdAt: new Date(refund.createdAt.getTime() + delta),
        updatedAt: new Date(refund.updatedAt.getTime() + delta),
        processedAt: refund.processedAt ? new Date(refund.processedAt.getTime() + delta) : null,
        paidAt: refund.paidAt ? new Date(refund.paidAt.getTime() + delta) : null,
      },
    });
  }

  for (const tx of await prisma.walletTransaction.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.walletTransaction.update({
      where: { id: tx.id },
      data: { createdAt: new Date(tx.createdAt.getTime() + delta) },
    });
  }

  for (const pu of await prisma.promotionUsage.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.promotionUsage.update({
      where: { id: pu.id },
      data: { createdAt: new Date(pu.createdAt.getTime() + delta) },
    });
  }
}
