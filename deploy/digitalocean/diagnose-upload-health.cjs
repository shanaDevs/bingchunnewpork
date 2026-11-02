/**
 * Read-only checks for multipart upload failures (driver register, initiate payout).
 *
 *   node deploy/digitalocean/diagnose-upload-health.cjs
 */
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || 'https://bingchun-admin-a4ndy.ondigitalocean.app';
const DELIVERY_ORIGIN = process.env.DELIVERY_ORIGIN || 'https://bingchun-delivery-6mgs2.ondigitalocean.app';

async function getJson(url) {
  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { url, status: res.status, ms: Date.now() - started, body };
}

async function main() {
  const checks = [
    `${ADMIN_ORIGIN}/api/health/spaces`,
    `${ADMIN_ORIGIN}/health/spaces`,
    `${DELIVERY_ORIGIN}/api/admin/health`,
  ];

  console.log('Upload failure diagnostics\n');
  for (const url of checks) {
    try {
      const result = await getJson(url);
      console.log(JSON.stringify(result, null, 2));
      console.log('');
    } catch (err) {
      console.error(url, err instanceof Error ? err.message : err);
    }
  }

  console.log('Interpretation:');
  console.log('- /health/spaces configured:false → set DO_SPACES_* on bingchun-admin admin-api');
  console.log('- configured:true reachable:false → fix Spaces keys/endpoint or network');
  console.log('- delivery /api/admin/health 504 while admin /health ok → delivery-web proxy issue');
}

main();
