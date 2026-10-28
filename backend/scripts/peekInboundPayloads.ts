import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const rows = await p.channelMessage.findMany({
    where: {
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      createdAt: true,
      messageType: true,
      externalUserId: true,
      externalMessageId: true,
      bodyText: true,
      payload: true,
      processed: true,
    },
  });

  for (const m of rows) {
    console.log('---');
    console.log({
      at: m.createdAt.toISOString(),
      type: m.messageType,
      from: m.externalUserId,
      id: m.externalMessageId,
      body: m.bodyText,
      processed: m.processed,
    });
    console.log('payload', JSON.stringify(m.payload, null, 2).slice(0, 1200));
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
