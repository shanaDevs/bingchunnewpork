/**
 * Patch live bing-chun App Platform env values for custom-domain WebXPay returns.
 * Usage:
 *   node deploy/digitalocean/patch-shop-payment-envs.cjs <in-spec.json> <out-spec.json>
 */
const fs = require('fs');

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('Usage: node patch-shop-payment-envs.cjs <in.json> <out.json>');
  process.exit(1);
}

const SHOP = 'https://bingchunsrilanka.com';
const WEBXPAY_RETURN =
  'https://bingchunsrilanka.com/api/payments/webxpay-return?returnOrigin=https%3A%2F%2Fbingchunsrilanka.com';

const PATCHES = {
  FRONTEND_URL: SHOP,
  LIVE_SHOP_URL: SHOP,
  API_BASE_URL: SHOP,
  WEBXPAY_RETURN_URL: WEBXPAY_RETURN,
  NEXT_PUBLIC_SITE_URL: SHOP,
  NEXT_PUBLIC_SOCKET_URL: SHOP,
};

function patchEnvs(envs) {
  if (!Array.isArray(envs)) return envs;
  return envs.map((env) => {
    if (PATCHES[env.key] === undefined) return env;
    return { ...env, value: PATCHES[env.key] };
  });
}

const spec = JSON.parse(fs.readFileSync(inPath, 'utf8'));
for (const svc of spec.services || []) {
  svc.envs = patchEnvs(svc.envs);
}
for (const worker of spec.workers || []) {
  worker.envs = patchEnvs(worker.envs);
}

fs.writeFileSync(outPath, JSON.stringify(spec, null, 2), 'utf8');
console.log(`Patched ${outPath}`);
for (const [k, v] of Object.entries(PATCHES)) {
  console.log(`  ${k}=${v}`);
}
