import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const rows = await p.channelMessage.findMany({
    where: { createdAt: { gte: since }, channel: 'WHATSAPP' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      createdAt: true,
      direction: true,
      messageType: true,
      externalUserId: true,
      externalMessageId: true,
      bodyText: true,
      processed: true,
    },
  });
  console.log('count', rows.length);
  for (const m of rows) {
    console.log(
      [
        m.createdAt.toISOString(),
        m.direction,
        m.messageType || '-',
        m.externalUserId,
        (m.externalMessageId || '').slice(0, 48),
        m.processed ? 'P' : 'U',
        JSON.stringify((m.bodyText || '').slice(0, 40)),
      ].join(' | '),
    );
  }

  const real = await p.channelMessage.count({
    where: {
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      OR: [
        { externalMessageId: { startsWith: 'wamid.HBg' } },
        { externalMessageId: { startsWith: 'wamid.g' } },
      ],
    },
  });
  console.log('real_meta_inbound_total', real);

  const sessions = await p.$queryRawUnsafe<any[]>(
    `SELECT id, channel, externalUserId, state, storeId, updatedAt FROM conversation_sessions WHERE channel='WHATSAPP' ORDER BY updatedAt DESC LIMIT 10`,
  ).catch(() => []);
  console.log('sessions', sessions);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
