import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import {
  parseTelegramUpdate,
  validateTelegramWebhookSecret,
  telegramChannel,
  answerTelegramCallback,
  isTelegramConfigured,
} from '../services/messaging/telegramChannel';
import { handleMessagingEvent } from '../services/messaging/orderConversationService';
import { excludeWebhookNoiseWhere } from '../services/messaging/channelMessageService';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { success } from '../utils/apiResponse';

/** POST /api/telegram/webhook */
export async function receiveTelegramWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = req.header('x-telegram-bot-api-secret-token') || undefined;
    if (!validateTelegramWebhookSecret(secret)) {
      throw new AppError('Invalid Telegram webhook secret', 403);
    }

    res.status(200).json({ ok: true });

    if (!isTelegramConfigured()) {
      logger.warn('telegram.webhook_received_unconfigured');
      return;
    }

    logger.info('telegram.webhook_received');
    const event = parseTelegramUpdate(req.body);
    if (req.body?.callback_query?.id) {
      await answerTelegramCallback(String(req.body.callback_query.id));
    }
    if (event) {
      await handleMessagingEvent(telegramChannel, event).catch((err) => {
        logger.error('telegram.event_failed', { error: String(err) });
      });
    }
  } catch (err) {
    next(err);
  }
}

/** Admin: GET /api/admin/orders/:id/conversation */
export async function getOrderConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = String(req.params.id || '');
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      select: {
        id: true,
        channel: true,
        userId: true,
        guestPhone: true,
      },
    });
    if (!order) throw new AppError('Order not found', 404);
    if (order.channel !== 'WHATSAPP' && order.channel !== 'TELEGRAM') {
      return success(res, { channel: order.channel, messages: [] });
    }

    const link = order.userId
      ? await prisma.customerChannel.findFirst({
          where: { customerId: order.userId, channel: order.channel },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    const byOrder = await prisma.channelMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        direction: true,
        messageType: true,
        bodyText: true,
        createdAt: true,
        externalUserId: true,
      },
    });

    if (byOrder.length) {
      return success(res, { channel: order.channel, messages: byOrder });
    }

    const externalUserId =
      link?.externalUserId ||
      (order.channel === 'WHATSAPP' && order.guestPhone
        ? order.guestPhone.replace(/\D/g, '')
        : null);

    if (!externalUserId) {
      return success(res, { channel: order.channel, messages: [] });
    }

    const messages = await prisma.channelMessage.findMany({
      where: {
        channel: order.channel,
        externalUserId,
        ...excludeWebhookNoiseWhere(),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        direction: true,
        messageType: true,
        bodyText: true,
        createdAt: true,
        externalUserId: true,
      },
    });

    return success(res, { channel: order.channel, messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
}
