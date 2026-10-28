import { prisma } from './prisma';
import { getIo } from './socket';
import { ensurePaymentSettingsTables } from './paymentSettings';
import { logger } from '../utils/logger';
import { resolveCustomerDisplayName } from './customerName';
import { normalizeProductImageUrl, productImageUrl } from './productImages';
import { ensureProductOnBranch } from './storeInventory';

export type NewOrderNotifyItem = {
  productName: string;
  quantity: number;
  imageUrl?: string | null;
};

export function mapNotifyOrderItems(
  items: Array<{
    productName: string;
    quantity: number;
    product?: { imageUrl?: string | null } | null;
  }>,
): NewOrderNotifyItem[] {
  return items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    imageUrl:
      normalizeProductImageUrl(item.product?.imageUrl ?? null) ??
      productImageUrl(item.productName) ??
      null,
  }));
}

interface NewOrderNotifyInput {
  orderId: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  orderMode: string;
  total: number;
  guestName?: string | null;
  userName?: string | null;
  phone?: string | null;
  itemCount: number;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  queuePosition?: number | null;
  pickupTime?: string | null;
  scheduledPickupAt?: string | null;
  createdAt?: string;
  items?: NewOrderNotifyItem[];
  /** WEB | APP | POS | WHATSAPP | TELEGRAM */
  channel?: string | null;
}

export async function notifyBranchNewOrder(input: NewOrderNotifyInput): Promise<void> {
  await ensurePaymentSettingsTables();

  const targets = await prisma.adminUser.findMany({
    where: {
      isActive: true,
      storeId: input.storeId,
      role: { name: { in: ['STORE_MANAGER', 'CASHIER'] } },
    },
    select: { id: true },
  });

  const customer = resolveCustomerDisplayName({
    guestName: input.guestName,
    userName: input.userName,
    phone: input.phone,
  });
  const modeLabel = input.orderMode === 'DELIVERY' ? 'Delivery' : 'Takeaway';
  const channelLabel =
    input.channel === 'WHATSAPP'
      ? 'WhatsApp'
      : input.channel === 'TELEGRAM'
        ? 'Telegram'
        : input.channel === 'POS'
          ? 'POS'
          : null;
  const title = channelLabel
    ? `New ${modeLabel} order · ${channelLabel}`
    : `New ${modeLabel} order`;
  const message = channelLabel
    ? `${customer} placed order ${input.orderNumber} via ${channelLabel} · ${input.itemCount} item(s) · LKR ${input.total.toLocaleString()} · ${input.storeName}`
    : `${customer} placed order ${input.orderNumber} · ${input.itemCount} item(s) · LKR ${input.total.toLocaleString()} · ${input.storeName}`;

  const payload = {
    type: 'NEW_ORDER',
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    orderMode: input.orderMode,
    channel: input.channel ?? 'WEB',
    storeId: input.storeId,
    storeName: input.storeName,
    customerName: customer,
    itemCount: input.itemCount,
    total: input.total,
    status: input.status ?? 'RECEIVED',
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    queuePosition: input.queuePosition ?? null,
    pickupTime: input.pickupTime ?? null,
    scheduledPickupAt: input.scheduledPickupAt ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    items: input.items ?? [],
    title,
    message,
  };

  for (const admin of targets) {
    try {
      const notification = await prisma.adminNotification.create({
        data: {
          adminUserId: admin.id,
          storeId: input.storeId,
          type: 'NEW_ORDER',
          title,
          message,
          orderId: input.orderId,
        },
      });

      try {
        const io = getIo();
        io.to(`admin:${admin.id}`).emit('adminNotification', {
          ...payload,
          id: notification.id,
          read: false,
        });
      } catch {
        /* socket not ready */
      }
    } catch (err) {
      logger.error('Failed to create admin notification', err);
    }
  }

  try {
    const io = getIo();
    io.to(`store:${input.storeId}`).emit('storeNewOrder', payload);
  } catch {
    /* socket not ready */
  }
}

interface NewProductNotifyInput {
  productId: string;
  productName: string;
}

export async function notifyBranchNewProduct(input: NewProductNotifyInput): Promise<void> {
  await ensurePaymentSettingsTables();

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { imageUrl: true },
  }).catch(() => null);

  const imageUrl =
    normalizeProductImageUrl(product?.imageUrl ?? null) ??
    productImageUrl(input.productName) ??
    null;

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const title = 'New product added';
  const message = `Super admin released "${input.productName}". Open Branch Stock and set the weekly base qty to make it available at your branch.`;

  const payload = {
    type: 'NEW_PRODUCT',
    productId: input.productId,
    productName: input.productName,
    imageUrl,
    title,
    message,
  };

  for (const store of stores) {
    await ensureProductOnBranch(store.id, input.productId, 0).catch((err) => {
      logger.warn('Failed to ensure new product on branch before notify', {
        storeId: store.id,
        productId: input.productId,
        err,
      });
    });

    const targets = await prisma.adminUser.findMany({
      where: {
        isActive: true,
        storeId: store.id,
        role: { name: 'STORE_MANAGER' },
      },
      select: { id: true },
    });

    for (const admin of targets) {
      try {
        const notification = await prisma.adminNotification.create({
          data: {
            adminUserId: admin.id,
            storeId: store.id,
            type: 'NEW_PRODUCT',
            title,
            message,
            productId: input.productId,
          },
        });

        try {
          const io = getIo();
          io.to(`admin:${admin.id}`).emit('adminNotification', {
            ...payload,
            id: notification.id,
            storeId: store.id,
            storeName: store.name,
            read: false,
            createdAt: notification.createdAt.toISOString(),
          });
        } catch {
          /* socket not ready */
        }
      } catch (err) {
        logger.error('Failed to create new product admin notification', err);
      }
    }

    try {
      const io = getIo();
      io.to(`store:${store.id}`).emit('storeNewProduct', {
        ...payload,
        storeId: store.id,
        storeName: store.name,
      });
    } catch {
      /* socket not ready */
    }
  }
}

