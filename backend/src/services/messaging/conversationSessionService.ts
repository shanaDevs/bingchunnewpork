import { prisma } from '../../lib/prisma';
import type { MessagingChannelKind, ConversationCartItem, ConversationContext } from './types';
import { SESSION_TTL_MS } from './types';
import type { ConversationState, ConversationSession } from '@prisma/client';

function parseCart(raw: unknown): ConversationCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (typeof row.productId !== 'string' || typeof row.productName !== 'string') return null;
      const quantity = Number(row.quantity);
      const unitPrice = Number(row.unitPrice);
      if (!Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(unitPrice)) return null;
      return {
        productId: row.productId,
        productName: row.productName,
        quantity: Math.floor(quantity),
        unitPrice: Math.floor(unitPrice),
        size: row.size === 'LARGE' ? ('LARGE' as const) : ('REGULAR' as const),
      };
    })
    .filter((x): x is ConversationCartItem => Boolean(x));
}

function parseContext(raw: unknown): ConversationContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ConversationContext;
}

export function getSessionCart(session: ConversationSession): ConversationCartItem[] {
  return parseCart(session.cartJson);
}

export function getSessionContext(session: ConversationSession): ConversationContext {
  return parseContext(session.contextJson);
}

export async function getOrCreateSession(
  channel: MessagingChannelKind,
  externalUserId: string,
  customerId?: string | null,
): Promise<ConversationSession> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const existing = await prisma.conversationSession.findUnique({
    where: { channel_externalUserId: { channel, externalUserId } },
  });

  if (existing) {
    if (existing.expiresAt.getTime() < Date.now()) {
      return prisma.conversationSession.update({
        where: { id: existing.id },
        data: {
          state: 'NEW',
          cartJson: [],
          contextJson: {},
          storeId: null,
          customerId: customerId ?? existing.customerId,
          expiresAt,
        },
      });
    }
    return prisma.conversationSession.update({
      where: { id: existing.id },
      data: {
        expiresAt,
        ...(customerId && !existing.customerId ? { customerId } : {}),
      },
    });
  }

  return prisma.conversationSession.create({
    data: {
      channel,
      externalUserId,
      customerId: customerId ?? null,
      state: 'NEW',
      cartJson: [],
      contextJson: {},
      expiresAt,
    },
  });
}

export async function updateSession(
  sessionId: string,
  data: {
    state?: ConversationState;
    storeId?: string | null;
    customerId?: string | null;
    cart?: ConversationCartItem[];
    context?: ConversationContext;
  },
): Promise<ConversationSession> {
  return prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
      ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      ...(data.cart !== undefined ? { cartJson: data.cart } : {}),
      ...(data.context !== undefined ? { contextJson: data.context } : {}),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

export async function clearSessionCart(sessionId: string): Promise<void> {
  await updateSession(sessionId, {
    cart: [],
    state: 'BROWSING_PRODUCTS',
    context: {},
  });
}
