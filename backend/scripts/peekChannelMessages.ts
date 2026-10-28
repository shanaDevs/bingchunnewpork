import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

async function main() {
  const p = new PrismaClient();
  const recent = await p.channelMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
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

  for (const m of recent) {
    console.log(
      [
        m.createdAt.toISOString(),
        m.direction.padEnd(8),
        (m.messageType || '-').padEnd(16),
        m.externalUserId.padEnd(16),
        (m.externalMessageId || '').slice(0, 36).padEnd(36),
        m.processed ? 'P' : 'U',
        JSON.stringify((m.bodyText || '').slice(0, 50)),
      ].join(' | '),
    );
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
