/**
 * Merge deploy/digitalocean/app.delivery.yaml with secrets.env (REPLACE_ME → live values)
 * and print instructions to apply ingress to the live bingchun-delivery app.
 *
 * Does not call the DigitalOcean API (needs doctl + token on your machine).
 *
 *   node deploy/digitalocean/apply-delivery-app-spec.cjs
 *   doctl apps list
 *   doctl apps update <APP_ID> --spec deploy/digitalocean/.generated-app.delivery.yaml
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const specPath = path.join(root, 'app.delivery.yaml');
const secretsPath = path.join(root, 'secrets.env');
const outPath = path.join(root, '.generated-app.delivery.yaml');

function loadSecrets() {
  if (!fs.existsSync(secretsPath)) {
    console.error('Missing secrets.env — copy from team vault or create from README.');
    process.exit(1);
  }
  const map = {};
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map[m[1]] = v;
  }
  return map;
}

const secretKeys = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'INTERNAL_SERVICE_SECRET',
  'DELIVERY_OTP_PEPPER',
  'DRIVER_PIN_PEPPER',
];

let yaml = fs.readFileSync(specPath, 'utf8');
const secrets = loadSecrets();
for (const key of secretKeys) {
  const val = secrets[key];
  if (!val) {
    console.warn(`Warning: ${key} not in secrets.env — REPLACE_ME left in output`);
    continue;
  }
  yaml = yaml.replace(new RegExp(`(key: ${key}[\\s\\S]*?value: )REPLACE_ME`, 'm'), `$1${val}`);
}

fs.writeFileSync(outPath, yaml, 'utf8');
console.log(`Wrote ${outPath}`);
console.log('');
console.log('Verify ingress in the generated file (order matters):');
console.log('  1. /delivery-api → delivery (preserve_path_prefix: true)');
console.log('  2. /socket.io → delivery-web');
console.log('  3. / → delivery-web');
console.log('');
console.log('Apply (requires doctl authenticated):');
console.log('  doctl apps list');
console.log(`  doctl apps update <bingchun-delivery-app-id> --spec ${outPath}`);
