import type { DriverBranchRequest, DriverComplaint, DriverComplaintStatus } from '@prisma/client';
import { prisma } from './prisma';
import { sendDriverAccountUpdateToDriver } from './driverPush';

let tablesReady = false;

export async function ensureDriverNotificationTables(): Promise<void> {
  tablesReady = true;
}

const COMPLAINT_STATUS_LABEL: Record<
  Exclude<DriverComplaintStatus, 'OPEN'>,
  { title: string; verb: string }
> = {
  CONFIRMED: { title: 'Complaint confirmed', verb: 'confirmed' },
  DISMISSED: { title: 'Complaint dismissed', verb: 'dismissed' },
  RESOLVED: { title: 'Complaint resolved', verb: 'resolved' },
};

async function persistAndPush(opts: {
  driverId: string;
  type: 'COMPLAINT_UPDATE' | 'BRANCH_REQUEST_UPDATE';
  title: string;
  message: string;
  kind: 'COMPLAINT' | 'BRANCH_REQUEST';
  complaintId?: string;
  branchRequestId?: string;
  orderId?: string;
  orderNumber?: string;
}): Promise<void> {
  await ensureDriverNotificationTables();

  const notification = await prisma.driverNotification.create({
    data: {
      driverId: opts.driverId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      complaintId: opts.complaintId,
      branchRequestId: opts.branchRequestId,
      orderId: opts.orderId,
      orderNumber: opts.orderNumber,
    },
  });

  await sendDriverAccountUpdateToDriver(opts.driverId, {
    notificationId: notification.id,
    kind: opts.kind,
    title: opts.title,
    body: opts.message,
    complaintId: opts.complaintId,
    branchRequestId: opts.branchRequestId,
  });
}

/** Notify rider when admin changes complaint status away from OPEN. */
export async function notifyDriverComplaintStatusChange(
  previousStatus: DriverComplaintStatus,
  updated: DriverComplaint,
): Promise<void> {
  if (updated.status === previousStatus || updated.status === 'OPEN') return;

  const label = COMPLAINT_STATUS_LABEL[updated.status as Exclude<DriverComplaintStatus, 'OPEN'>];
  if (!label) return;

  const order = await prisma.order.findUnique({
    where: { id: updated.orderId },
    select: { orderNumber: true },
  });
  const orderNumber = order?.orderNumber ?? '';
  const orderRef = orderNumber ? `order #${orderNumber}` : 'your complaint';

  const title = label.title;
  const message = `Your complaint on ${orderRef} was ${label.verb}.`;

  await persistAndPush({
    driverId: updated.driverId,
    type: 'COMPLAINT_UPDATE',
    title,
    message,
    kind: 'COMPLAINT',
    complaintId: updated.id,
    orderId: updated.orderId,
    orderNumber: orderNumber || undefined,
  });
}

const BRANCH_TYPE_LABEL: Record<string, string> = {
  ADD_BRANCH: 'add branch',
  CHANGE_BRANCH: 'home branch change',
  REMOVE_BRANCH: 'remove branch',
};

/** Notify rider when a pending branch request is approved or rejected. */
export async function notifyDriverBranchRequestReviewed(
  request: DriverBranchRequest,
  toStoreName?: string | null,
): Promise<void> {
  if (request.status !== 'APPROVED' && request.status !== 'REJECTED') return;

  const branchLabel = toStoreName?.trim() || request.toStoreId;
  const typeLabel = BRANCH_TYPE_LABEL[request.type] ?? 'branch request';

  if (request.status === 'APPROVED') {
    const title = 'Branch request approved';
    const message = `Your ${typeLabel} request for ${branchLabel} was approved.`;
    await persistAndPush({
      driverId: request.driverId,
      type: 'BRANCH_REQUEST_UPDATE',
      title,
      message,
      kind: 'BRANCH_REQUEST',
      branchRequestId: request.id,
    });
    return;
  }

  const note = request.reviewNote?.trim();
  const reasonSuffix = note ? ` Reason: ${note}` : '';
  const title = 'Branch request rejected';
  const message = `Your ${typeLabel} request for ${branchLabel} was rejected.${reasonSuffix}`;

  await persistAndPush({
    driverId: request.driverId,
    type: 'BRANCH_REQUEST_UPDATE',
    title,
    message,
    kind: 'BRANCH_REQUEST',
    branchRequestId: request.id,
  });
}
