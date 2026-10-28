/**
 * Load DATABASE_URL for Prisma CLI from common monorepo .env locations.
 */
const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '../../backend/.env'),
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '.env'),
];

for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
  if (process.env.DATABASE_URL) break;
}
