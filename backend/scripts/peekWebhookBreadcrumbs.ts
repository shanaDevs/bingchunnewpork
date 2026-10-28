import { prisma } from '../src/lib/prisma';

async function main() {
  const breadcrumbs = await prisma.channelMessage.findMany({
    where: {
      channel: 'WHATSAPP',
      createdAt: { gte: new Date('2026-08-12T08:00:00Z') },
      OR: [
        { externalMessageId: { startsWith: 'webhook:' } },
        { messageType: { startsWith: 'webhook_' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, messageType: true, externalUserId: true, bodyText: true },
  });
  console.log('Webhook breadcrumbs since 08:00:', breadcrumbs.length);
  console.log(JSON.stringify(breadcrumbs, null, 2));
}

main().finally(() => prisma.$disconnect());
