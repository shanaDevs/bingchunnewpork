import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import type { MessagingChannel } from '@prisma/client';
import { probeWhatsAppToken, whatsAppChannel } from '../services/messaging/whatsappChannel';
import { telegramChannel, isTelegramConfigured } from '../services/messaging/telegramChannel';
import { getWhatsAppAdminView } from '../lib/messagingSettings';
import { logOutboundMessage, excludeWebhookNoiseWhere } from '../services/messaging/channelMessageService';
import { toWhatsAppApiNumber } from '../utils/phone';
import { randomUUID } from 'crypto';
import { z } from 'zod';

function parseChannel(raw: unknown): MessagingChannel {
  const c = String(raw || 'WHATSAPP').toUpperCase();
  if (c === 'TELEGRAM') return 'TELEGRAM';
  return 'WHATSAPP';
}

/** GET /api/admin/messaging/whatsapp-status */
export async function getWhatsAppStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    const [view, probe, lastInbound, lastOutbound] = await Promise.all([
      getWhatsAppAdminView(),
      probeWhatsAppToken(),
      prisma.channelMessage.findFirst({
        where: {
          channel: 'WHATSAPP',
          direction: 'INBOUND',
          NOT: { externalMessageId: { startsWith: 'webhook:' } },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, externalUserId: true, bodyText: true, externalMessageId: true },
      }),
      prisma.channelMessage.findFirst({
        where: { channel: 'WHATSAPP', direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, externalUserId: true, bodyText: true },
      }),
    ]);

    return success(res, {
      enabled: view.enabled,
      configured: view.configured,
      webhookUrl: view.webhookUrl,
      phoneNumberId: view.phoneNumberId,
      token: probe,
      lastInbound: lastInbound
        ? {
            at: lastInbound.createdAt,
            from: lastInbound.externalUserId,
            preview: (lastInbound.bodyText || '').slice(0, 80),
            source: (() => {
              const id = lastInbound.externalMessageId;
              if (id.startsWith('wamid.HBg') || (id.startsWith('wamid.') && !id.includes('test') && !id.includes('prodtest') && !id.includes('local')))
                return 'meta';
              if (id.startsWith('local-') || id.includes('test') || id.includes('prodtest')) return 'script';
              return 'other';
            })(),
          }
        : null,
      lastOutbound: lastOutbound
        ? {
            at: lastOutbound.createdAt,
            to: lastOutbound.externalUserId,
            preview: (lastOutbound.bodyText || '').slice(0, 80),
          }
        : null,
      metaSetup: {
        callbackUrl: null,
        verifyTokenHint: view.verifyTokenSet ? 'saved in settings (legacy)' : 'not set',
        steps: [
          'Inbound WhatsApp webhook is disabled on this API — customers cannot message the bot via WhatsApp.',
          'Remove the callback URL in Meta App → WhatsApp → Configuration if Meta still pings the old URL.',
          'Outbound templates and admin replies still use WHATSAPP_ACCESS_TOKEN when configured.',
        ],
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/messaging/conversations
 * Inbox: one row per WhatsApp/Telegram user (latest message preview).
 */
export async function listMessagingConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const channel = parseChannel(req.query.channel);
    const q = String(req.query.q || '').trim();
    const take = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);

    const grouped = await prisma.channelMessage.groupBy({
      by: ['externalUserId'],
      where: {
        channel,
        externalUserId: { not: 'meta-webhook' },
        ...excludeWebhookNoiseWhere(),
        ...(q
          ? {
              OR: [
                { externalUserId: { contains: q } },
                { bodyText: { contains: q } },
              ],
            }
          : {}),
      },
      _max: { createdAt: true },
      _count: { _all: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take,
    });

    const externalIds = grouped.map((g) => g.externalUserId);
    if (!externalIds.length) {
      return success(res, []);
    }

    const latestMessages = await prisma.channelMessage.findMany({
      where: {
        channel,
        OR: grouped.map((g) => ({
          externalUserId: g.externalUserId,
          createdAt: g._max.createdAt || undefined,
        })),
      },
      select: {
        externalUserId: true,
        bodyText: true,
        direction: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestByUser = new Map<string, (typeof latestMessages)[0]>();
    for (const m of latestMessages) {
      if (!latestByUser.has(m.externalUserId)) latestByUser.set(m.externalUserId, m);
    }

    const countByUser = new Map(grouped.map((g) => [g.externalUserId, g._count._all]));

    const [links, sessions] = await Promise.all([
      prisma.customerChannel.findMany({
        where: { channel, externalUserId: { in: externalIds } },
        select: {
          externalUserId: true,
          phoneNumber: true,
          username: true,
          customerId: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.conversationSession.findMany({
        where: { channel, externalUserId: { in: externalIds } },
        select: {
          externalUserId: true,
          state: true,
          storeId: true,
          updatedAt: true,
          store: { select: { id: true, name: true } },
        },
      }),
    ]);

    const linkMap = new Map(links.map((l) => [l.externalUserId, l]));
    const sessionMap = new Map(sessions.map((s) => [s.externalUserId, s]));

    return success(
      res,
      externalIds.map((externalUserId) => {
        const link = linkMap.get(externalUserId);
        const session = sessionMap.get(externalUserId);
        const last = latestByUser.get(externalUserId);
        return {
          channel,
          externalUserId,
          phone: link?.phoneNumber || (channel === 'WHATSAPP' ? externalUserId : null),
          username: link?.username || null,
          customerName: link?.customer?.name || null,
          customerId: link?.customerId || null,
          lastMessageAt: last?.createdAt || null,
          lastBody: last?.bodyText || null,
          lastDirection: last?.direction || null,
          messageCount: countByUser.get(externalUserId) || 0,
          sessionState: session?.state || null,
          storeId: session?.storeId || null,
          storeName: session?.store?.name || null,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/messaging/conversations/:externalUserId/messages
 */
export async function listMessagingConversationMessages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const channel = parseChannel(req.query.channel);
    const externalUserId = String(req.params.externalUserId || '').trim();
    if (!externalUserId) throw new AppError('externalUserId is required', 400);

    const take = Math.min(Math.max(parseInt(String(req.query.limit || '200'), 10) || 200, 1), 500);

    const [messagesDesc, link, session] = await Promise.all([
      prisma.channelMessage.findMany({
        where: {
          channel,
          externalUserId,
          ...excludeWebhookNoiseWhere(),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          direction: true,
          messageType: true,
          bodyText: true,
          createdAt: true,
          processed: true,
          orderId: true,
          externalMessageId: true,
          order: { select: { id: true, orderNumber: true, status: true } },
        },
      }),
      prisma.customerChannel.findFirst({
        where: { channel, externalUserId },
        select: {
          phoneNumber: true,
          username: true,
          customerId: true,
          customer: { select: { id: true, name: true, phone: true, email: true } },
        },
      }),
      prisma.conversationSession.findUnique({
        where: { channel_externalUserId: { channel, externalUserId } },
        select: {
          state: true,
          storeId: true,
          cartJson: true,
          updatedAt: true,
          store: { select: { id: true, name: true, city: true } },
        },
      }),
    ]);

    const messages = messagesDesc.reverse();

    return success(res, {
      channel,
      externalUserId,
      phone: link?.phoneNumber || (channel === 'WHATSAPP' ? externalUserId : null),
      username: link?.username || null,
      customer: link?.customer || null,
      session: session
        ? {
            state: session.state,
            storeId: session.storeId,
            storeName: session.store?.name || null,
            storeCity: session.store?.city || null,
            cartJson: session.cartJson,
            updatedAt: session.updatedAt,
          }
        : null,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        senderType:
          m.direction === 'INBOUND'
            ? 'CUSTOMER'
            : m.messageType === 'admin'
              ? 'ADMIN'
              : m.messageType === 'status'
                ? 'SYSTEM'
                : 'BOT',
        messageType: m.messageType,
        bodyText: m.bodyText,
        createdAt: m.createdAt.toISOString(),
        processed: m.processed,
        orderId: m.orderId,
        orderNumber: m.order?.orderNumber || null,
        orderStatus: m.order?.status || null,
        externalMessageId: m.externalMessageId,
      })),
      hasMore: messagesDesc.length === take,
    });
  } catch (err) {
    next(err);
  }
}

const adminReplySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  channel: z.enum(['WHATSAPP', 'TELEGRAM']).optional(),
});

/**
 * POST /api/admin/messaging/conversations/:externalUserId/reply
 * Manual staff reply (separate from automated bot messages).
 */
export async function sendAdminMessagingReply(req: Request, res: Response, next: NextFunction) {
  try {
    const externalUserIdRaw = decodeURIComponent(String(req.params.externalUserId || '')).trim();
    if (!externalUserIdRaw) throw new AppError('externalUserId is required', 400);

    const parsed = adminReplySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid reply', 400);
    }

    const channel = parseChannel(parsed.data.channel || req.query.channel || 'WHATSAPP');
    const text = parsed.data.text.trim();

    if (channel === 'WHATSAPP') {
      const to = toWhatsAppApiNumber(externalUserIdRaw);
      if (!to) throw new AppError('Invalid WhatsApp recipient', 400);

      const sendResult = await whatsAppChannel.send(to, { text });
      await logOutboundMessage({
        channel: 'WHATSAPP',
        externalUserId: to,
        externalMessageId: sendResult.waMessageId || `admin:${randomUUID()}`,
        bodyText: text,
        messageType: 'admin',
        senderType: 'ADMIN',
        payload: {
          source: 'admin',
          adminId: req.user?.sub || null,
        },
      });

      return success(res, {
        ok: true,
        channel,
        externalUserId: to,
        text,
        messageType: 'admin',
      });
    }

    if (!isTelegramConfigured()) {
      throw new AppError('Telegram is not configured', 400);
    }
    await telegramChannel.send(externalUserIdRaw, { text });
    await logOutboundMessage({
      channel: 'TELEGRAM',
      externalUserId: externalUserIdRaw,
      externalMessageId: `admin:${randomUUID()}`,
      bodyText: text,
      messageType: 'admin',
      senderType: 'ADMIN',
      payload: {
        source: 'admin',
        adminId: req.user?.sub || null,
      },
    });

    return success(res, {
      ok: true,
      channel,
      externalUserId: externalUserIdRaw,
      text,
      messageType: 'admin',
    });
  } catch (err) {
    next(err);
  }
}
