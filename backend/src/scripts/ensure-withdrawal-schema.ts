import 'dotenv/config';
import { connectDb } from '../lib/prisma';
import { ensureWithdrawalSchema } from '../lib/withdrawalSchema';

async function main() {
  await connectDb();
  await ensureWithdrawalSchema();
  console.log('Withdrawal schema migration OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
