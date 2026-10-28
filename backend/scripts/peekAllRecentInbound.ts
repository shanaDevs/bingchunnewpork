import { prisma } from '../src/lib/prisma';

async function main() {
  const since = new Date('2026-08-12T08:00:00Z');
  const inbound = await prisma.channelMessage.findMany({
    where: {
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      createdAt: { gte: since },
      NOT: { externalMessageId: { startsWith: 'webhook:' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      externalUserId: true,
      externalMessageId: true,
      messageType: true,
      bodyText: true,
      processed: true,
      createdAt: true,
    },
  });
  console.log('Inbound since 08:00 UTC:', inbound.length);
  console.log(JSON.stringify(inbound, null, 2));

  const realMeta = inbound.filter(
    (m) => m.externalMessageId.startsWith('wamid.HBg') || m.externalMessageId.startsWith('wamid.HB'),
  );
  console.log('\nReal Meta wamid inbound:', realMeta.length);

  const session = await prisma.conversationSession.findUnique({
    where: {
      channel_externalUserId: { channel: 'WHATSAPP', externalUserId: '94759065140' },
    },
  });
  console.log('\nSession:', session?.state, session?.storeId, session?.expiresAt);
}

main().finally(() => prisma.$disconnect());
