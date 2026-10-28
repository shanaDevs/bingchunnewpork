import { prisma } from '../src/lib/prisma';

async function main() {
  const recent = await prisma.channelMessage.findMany({
    where: {
      channel: 'WHATSAPP',
      externalUserId: '94759065140',
      createdAt: { gte: new Date('2026-08-12T08:00:00Z') },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      direction: true,
      messageType: true,
      bodyText: true,
      createdAt: true,
      externalMessageId: true,
      processed: true,
    },
  });
  console.log(JSON.stringify(recent, null, 2));

  const unprocessed = await prisma.channelMessage.findMany({
    where: {
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      processed: false,
      externalUserId: '94759065140',
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('\nUnprocessed for user:', unprocessed.length, unprocessed);
}

main().finally(() => prisma.$disconnect());
