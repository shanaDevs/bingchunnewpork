const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function main() {
  const users = await p.$queryRawUnsafe(`SELECT id, role FROM admin_users`);
  fs.writeFileSync('roles-backup.json', JSON.stringify(users, null, 2));
  console.log('Backed up roles for ' + users.length + ' users');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
