import { prisma } from '../src/lib/prisma';

async function main() {
  const dupes = await prisma.$queryRaw<
    Array<{ channel: string; externalMessageId: string; cnt: bigint }>
  >`
    SELECT channel, externalMessageId, COUNT(*) AS cnt
    FROM channel_messages
    GROUP BY channel, externalMessageId
    HAVING COUNT(*) > 1
    LIMIT 20
  `;
  console.log('Duplicate message IDs:', dupes);

  const unprocessed = await prisma.channelMessage.count({
    where: {
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      processed: false,
      NOT: { externalMessageId: { startsWith: 'webhook:' } },
    },
  });
  console.log('Unprocessed inbound:', unprocessed);

  const recent = await prisma.channelMessage.findMany({
    where: { channel: 'WHATSAPP', externalUserId: '94759065140' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      direction: true,
      messageType: true,
      bodyText: true,
      createdAt: true,
      externalMessageId: true,
      processed: true,
    },
  });
  console.log('Recent for 94759065140:', recent);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
