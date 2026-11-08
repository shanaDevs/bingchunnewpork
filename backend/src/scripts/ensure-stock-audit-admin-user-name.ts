/**
 * One-off / CI: add stock_audit_logs.adminUserName when migrate deploy is not baselined.
 *
 *   npm run ensure:stock-audit-admin-name -w @bingchun/backend
 */
import path from 'path';
import dotenv from 'dotenv';
import { ensureStockAuditAdminUserNameColumn } from '../lib/stockAuditSchema';

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function main() {
  await ensureStockAuditAdminUserNameColumn();
  console.log('stock_audit_logs.adminUserName is present.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../lib/prisma');
    await prisma.$disconnect();
  });
