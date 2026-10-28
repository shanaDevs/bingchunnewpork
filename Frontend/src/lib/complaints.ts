import { resolveCustomerDisplayName } from '@/lib/customerName';
import type { AdminBadgeVariant } from '@/lib/adminBadges';

export type AdminDriverComplaintOrder = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddressLine?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
};

export type AdminDriverComplaint = {
  id: string;
  orderId: string;
  driverId: string;
  category: string;
  description: string;
  status: 'OPEN' | 'CONFIRMED' | 'DISMISSED' | 'RESOLVED';
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  driver?: { id: string; name: string } | null;
  order?: AdminDriverComplaintOrder | null;
};

export type AdminDriverComplaintDetailItemTopping = {
  toppingName: string;
  extraPrice: number;
};

export type AdminDriverComplaintDetailItem = {
  productName: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  toppings: AdminDriverComplaintDetailItemTopping[];
};

export type AdminDriverComplaintDetail = Omit<AdminDriverComplaint, 'driver' | 'order'> & {
  otherComplaintsCount: number;
  driver?: {
    id: string;
    name: string;
    phone?: string | null;
    meritPoints?: number | null;
    vehicleType?: string | null;
    vehicleNumber?: string | null;
  } | null;
  order?: (AdminDriverComplaintOrder & {
    orderMode?: string | null;
    channel?: string | null;
    createdAt?: string | null;
    notes?: string | null;
    paymentMethod?: string | null;
    paymentStatus?: string | null;
    subtotal?: number | null;
    deliveryFee?: number | null;
    convenientFee?: number | null;
    discount?: number | null;
    loyaltyDiscount?: number | null;
    total?: number | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    items?: AdminDriverComplaintDetailItem[];
  }) | null;
};

export function complaintStatusLabel(status: AdminDriverComplaint['status']): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'RESOLVED':
      return 'Resolved';
    case 'DISMISSED':
      return 'Dismissed';
    default:
      return status;
  }
}

export function complaintStatusVariant(status: AdminDriverComplaint['status']): AdminBadgeVariant {
  switch (status) {
    case 'OPEN':
      return 'amber';
    case 'CONFIRMED':
      return 'green';
    case 'RESOLVED':
      return 'teal';
    case 'DISMISSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function complaintResolutionSummary(row: Pick<
  AdminDriverComplaint,
  'status' | 'resolvedAt' | 'resolvedByName'
>): string | null {
  if (row.status === 'OPEN') return null;
  const action =
    row.status === 'CONFIRMED'
      ? 'Confirmed'
      : row.status === 'DISMISSED'
        ? 'Dismissed'
        : row.status === 'RESOLVED'
          ? 'Resolved'
          : row.status;
  const when = row.resolvedAt ? new Date(row.resolvedAt).toLocaleString() : null;
  const who = row.resolvedByName ?? null;
  if (!when && !who) return action;
  if (when && who) return `${action} · ${when} · ${who}`;
  return when ? `${action} · ${when}` : `${action} · ${who}`;
}

export function formatOrderDetails(order: AdminDriverComplaintOrder | null | undefined): string {
  if (!order) return '—';
  const customer = resolveCustomerDisplayName({
    guestName: order.guestName,
    userName: order.user?.name,
    phone: order.user?.phone ?? order.guestPhone,
  });
  const addressParts = [order.deliveryAddressLine, order.deliveryCity, order.deliveryDistrict].filter(Boolean);
  const address = addressParts.join(', ') || '—';
  const status = order.status.replace(/_/g, ' ').toLowerCase();
  return `${customer} · ${address} · ${status}`;
}
