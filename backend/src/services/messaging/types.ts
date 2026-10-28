import type { MessagingChannel, ConversationState, OrderChannel } from '@prisma/client';

export type MessagingChannelKind = 'WHATSAPP' | 'TELEGRAM';

export type ConversationCartItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  size: 'REGULAR' | 'LARGE';
};

export type ConversationContext = {
  selectedProductId?: string;
  selectedProductName?: string;
  selectedUnitPrice?: number;
  selectedAvailable?: number;
  pendingQuantity?: number;
  searchResults?: Array<{
    productId: string;
    name: string;
    unitPrice: number;
    available: number;
  }>;
  checkoutStep?:
    | 'name'
    | 'phone'
    | 'address'
    | 'city'
    | 'notes'
    | 'payment'
    | 'confirm';
  guestName?: string;
  guestPhone?: string;
  addressLine?: string;
  city?: string;
  district?: string;
  deliveryNotes?: string;
  paymentMethod?: 'CASH_ON_DELIVERY' | 'CASH_AT_COUNTER';
  orderMode?: 'DELIVERY' | 'TAKEAWAY';
  lastOrderId?: string;
  lastOrderNumber?: string;
  lat?: number;
  lng?: number;
};

export type IncomingMessagingEvent = {
  channel: MessagingChannelKind;
  externalUserId: string;
  externalMessageId: string;
  text?: string;
  /** Normalized callback / button payload (e.g. store:uuid, add:productId, qty:2) */
  callbackData?: string;
  username?: string;
  phoneNumber?: string;
  raw?: unknown;
};

export type OutboundButton = {
  id: string;
  label: string;
  description?: string;
};

export type OutboundListSection = {
  title: string;
  rows: OutboundButton[];
};

export type OutboundMessage = {
  text: string;
  buttons?: OutboundButton[];
  /** Telegram-style inline rows; WhatsApp uses first 3 as reply buttons */
  buttonRows?: OutboundButton[][];
  /** WhatsApp interactive list (up to 10 rows). Ignored on Telegram (flattened to buttons). */
  list?: {
    buttonLabel: string;
    header?: string;
    sections: OutboundListSection[];
  };
  /** WhatsApp CTA URL button (e.g. Visit order details). Sent as interactive cta_url. */
  ctaUrl?: {
    label: string;
    url: string;
  };
};

export type MessagingSendResult = {
  waMessageId: string | null;
};

export type MessagingChannelAdapter = {
  channel: MessagingChannelKind;
  send(externalUserId: string, message: OutboundMessage): Promise<MessagingSendResult>;
};

export function toOrderChannel(channel: MessagingChannelKind): OrderChannel {
  return channel === 'WHATSAPP' ? 'WHATSAPP' : 'TELEGRAM';
}

export function asMessagingChannel(channel: MessagingChannelKind): MessagingChannel {
  return channel;
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

export type SessionState = ConversationState;
