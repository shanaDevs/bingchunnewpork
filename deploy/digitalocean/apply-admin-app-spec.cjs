/**
 * Merge deploy/digitalocean/app.admin.yaml with secrets.env (REPLACE_ME → live values)
 * and write deploy/digitalocean/.generated-app.admin.yaml.
 *
 *   node deploy/digitalocean/apply-admin-app-spec.cjs
 *   doctl apps list
 *   doctl apps update <bingchun-admin-app-id> --spec deploy/digitalocean/.generated-app.admin.yaml
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const specPath = path.join(root, 'app.admin.yaml');
const secretsPath = path.join(root, 'secrets.env');
const outPath = path.join(root, '.generated-app.admin.yaml');

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
  'DO_SPACES_KEY',
  'DO_SPACES_SECRET',
  'DO_SPACES_BUCKET',
  'DO_SPACES_ENDPOINT',
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
console.log('After apply, verify uploads:');
console.log('  curl -s https://bingchun-admin-a4ndy.ondigitalocean.app/api/health/spaces');
