import { prisma } from '../lib/prisma';
import { getPaymentSettings } from '../lib/paymentSettings';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { id: 'default' } });
  console.log("DB system_settings row:", row);
  const settings = await getPaymentSettings();
  console.log("Resolved payment settings:", settings);
}

main().catch(console.error).finally(() => prisma.$disconnect());
