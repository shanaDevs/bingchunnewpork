import { prisma } from '../../lib/prisma';
import { normalizePhone, phoneLookupVariants } from '../../utils/phone';
import type { MessagingChannelKind } from './types';
import type { CustomerChannel, User } from '@prisma/client';

export type ResolvedMessagingCustomer = {
  customerId: string | null;
  channelLink: CustomerChannel | null;
  user: Pick<User, 'id' | 'name' | 'phone'> | null;
};

/**
 * Resolve or link a messaging identity to an existing User.
 * Prefer channel mapping, then phone match. Never create duplicate Users from Telegram alone.
 */
export async function resolveMessagingCustomer(input: {
  channel: MessagingChannelKind;
  externalUserId: string;
  phoneNumber?: string | null;
  username?: string | null;
  displayName?: string | null;
}): Promise<ResolvedMessagingCustomer> {
  const existingLink = await prisma.customerChannel.findUnique({
    where: {
      channel_externalUserId: {
        channel: input.channel,
        externalUserId: input.externalUserId,
      },
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, deletedAt: true } },
    },
  });

  if (existingLink && !existingLink.customer.deletedAt) {
    if (input.username && input.username !== existingLink.username) {
      await prisma.customerChannel.update({
        where: { id: existingLink.id },
        data: { username: input.username },
      });
    }
    return {
      customerId: existingLink.customerId,
      channelLink: existingLink,
      user: existingLink.customer,
    };
  }

  const phone = input.phoneNumber ? normalizePhone(input.phoneNumber) : null;
  if (phone) {
    const variants = phoneLookupVariants(phone);
    const user = await prisma.user.findFirst({
      where: { phone: { in: variants }, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });
    if (user) {
      const link = await prisma.customerChannel.upsert({
        where: {
          channel_externalUserId: {
            channel: input.channel,
            externalUserId: input.externalUserId,
          },
        },
        create: {
          customerId: user.id,
          channel: input.channel,
          externalUserId: input.externalUserId,
          phoneNumber: phone,
          username: input.username ?? null,
        },
        update: {
          customerId: user.id,
          phoneNumber: phone,
          username: input.username ?? undefined,
        },
      });
      return { customerId: user.id, channelLink: link, user };
    }
  }

  return { customerId: null, channelLink: null, user: null };
}

/** Link after checkout collected a phone that matches (or creates) a User. */
export async function linkCustomerChannel(input: {
  channel: MessagingChannelKind;
  externalUserId: string;
  customerId: string;
  phoneNumber?: string | null;
  username?: string | null;
}): Promise<CustomerChannel> {
  return prisma.customerChannel.upsert({
    where: {
      channel_externalUserId: {
        channel: input.channel,
        externalUserId: input.externalUserId,
      },
    },
    create: {
      customerId: input.customerId,
      channel: input.channel,
      externalUserId: input.externalUserId,
      phoneNumber: input.phoneNumber ? normalizePhone(input.phoneNumber) : null,
      username: input.username ?? null,
    },
    update: {
      customerId: input.customerId,
      phoneNumber: input.phoneNumber ? normalizePhone(input.phoneNumber) : undefined,
      username: input.username ?? undefined,
    },
  });
}

export async function findOrCreateUserByPhone(input: {
  phone: string;
  name: string;
}): Promise<User> {
  const phone = normalizePhone(input.phone);
  const variants = phoneLookupVariants(phone);
  const existing = await prisma.user.findFirst({
    where: { phone: { in: variants }, deletedAt: null },
  });
  if (existing) {
    if (input.name && existing.name !== input.name && /^customer|user|guest$/i.test(existing.name)) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { name: input.name },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      name: input.name.trim() || 'Customer',
      phone,
      isPhoneVerified: true,
    },
  });
}
