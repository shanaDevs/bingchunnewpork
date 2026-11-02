const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { requireDoadminDatabaseUrl } = require('./lib/load-doadmin-database-url.cjs');

const secretsPath = path.join(__dirname, 'secrets.env');
const secrets = fs.readFileSync(secretsPath, 'utf8');
const jwtSecret = secrets.match(/^JWT_SECRET=(.+)$/m)?.[1]?.trim();
if (!jwtSecret) throw new Error('JWT_SECRET missing');

process.env.DATABASE_URL = requireDoadminDatabaseUrl();
const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

const DRIVER_ID = '36740b1d-78ae-4642-af85-022c821f0f74';
const STORE_ID = 'store-bing-chun---aluthgama';
const ORIGIN = 'https://bingchunsrilanka.com/api';

async function call(label, path, method, token, body) {
  const started = Date.now();
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  return { label, status: res.status, ms: Date.now() - started, json };
}

async function main() {
  const row = await prisma.adminUser.findUnique({
    where: { id: DRIVER_ID },
    select: { sessionVersion: true, dutyStatus: true, name: true },
  });
  const sv = row?.sessionVersion ?? 0;
  const token = jwt.sign(
    { sub: DRIVER_ID, type: 'admin', role: 'DELIVERY_DRIVER', storeId: STORE_ID, sv },
    jwtSecret,
    { expiresIn: '1h' },
  );

  const results = [];
  results.push(await call('getMe', '/delivery/me', 'GET', token));
  results.push(await call('patchOnline', '/delivery/me/duty', 'PATCH', token, { dutyStatus: 'ONLINE' }));
  results.push(await call('getMeAfter', '/delivery/me', 'GET', token));

  console.log(JSON.stringify({ driver: row, results }, null, 2));
}

main().finally(() => prisma.$disconnect());
