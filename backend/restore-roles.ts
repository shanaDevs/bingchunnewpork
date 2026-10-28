const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function main() {
  const rolesBackup = JSON.parse(fs.readFileSync('roles-backup.json', 'utf8'));
  
  // Define default roles
  const defaultRoles = ['SYSTEM_ADMIN', 'STORE_MANAGER', 'CASHIER', 'DELIVERY_ADMIN', 'REPORT_VIEWER', 'DELIVERY_DRIVER'];
  
  // Insert roles
  for (const roleName of defaultRoles) {
    await p.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName }
    });
  }
  
  console.log('Roles created.');

  // Restore user roles
  for (const user of rolesBackup) {
    if (user.role) {
      const roleRecord = await p.role.findUnique({ where: { name: user.role } });
      if (roleRecord) {
        await p.adminUser.update({
          where: { id: user.id },
          data: { roleId: roleRecord.id }
        });
        console.log(`Updated user ${user.id} to role ${roleRecord.name}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
