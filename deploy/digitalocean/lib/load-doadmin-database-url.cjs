/**
 * Resolve doadmin (or explicit AUDIT/DOADMIN) Postgres URL for laptop → bingchun-pg.
 * Never falls back to bingchun_app DATABASE_URL in secrets.env.
 */
const fs = require('fs');
const path = require('path');

const deployDir = path.join(__dirname, '..');
const secretsPath = path.join(deployDir, 'secrets.env');
const doadminUrlPath = path.join(deployDir, 'audit-doadmin.url');

function normalizeDbUrl(raw) {
  const parsed = new URL(raw.trim());
  if (parsed.hostname.startsWith('private-')) {
    parsed.hostname = parsed.hostname.slice('private-'.length);
  }
  return parsed.toString();
}

function readDoadminFromSecretsFile() {
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^DOADMIN_DATABASE_URL\s*=\s*(.+)$/);
    if (!m) continue;
    let url = m[1].trim();
    if (
      (url.startsWith('"') && url.endsWith('"')) ||
      (url.startsWith("'") && url.endsWith("'"))
    ) {
      url = url.slice(1, -1);
    }
    return normalizeDbUrl(url);
  }
  return null;
}

function readDoadminUrlFile() {
  if (!fs.existsSync(doadminUrlPath)) return null;
  const line = fs
    .readFileSync(doadminUrlPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (!line) return null;
  return normalizeDbUrl(line);
}

function loadDoadminDatabaseUrl() {
  if (process.env.AUDIT_DATABASE_URL?.trim()) {
    return normalizeDbUrl(process.env.AUDIT_DATABASE_URL.trim());
  }
  if (process.env.DOADMIN_DATABASE_URL?.trim()) {
    return normalizeDbUrl(process.env.DOADMIN_DATABASE_URL.trim());
  }
  const fromSecrets = readDoadminFromSecretsFile();
  if (fromSecrets) return fromSecrets;
  const fromFile = readDoadminUrlFile();
  if (fromFile) return fromFile;
  return null;
}

function requireDoadminDatabaseUrl() {
  const url = loadDoadminDatabaseUrl();
  if (!url) {
    const msg = [
      'Missing doadmin URL for live bingchun-pg (bingchun_app in secrets.env cannot access stores from laptop).',
      'Add one of:',
      '  - DOADMIN_DATABASE_URL=postgresql://doadmin:...@bingchun-pg-....ondigitalocean.com:25060/defaultdb?sslmode=require',
      '    in deploy/digitalocean/secrets.env (uncommented)',
      '  - deploy/digitalocean/audit-doadmin.url (one line, gitignored)',
      '  - AUDIT_DATABASE_URL or DOADMIN_DATABASE_URL in the shell',
    ].join('\n');
    const err = new Error(msg);
    err.code = 'DOADMIN_URL_MISSING';
    throw err;
  }
  return url;
}

module.exports = {
  loadDoadminDatabaseUrl,
  requireDoadminDatabaseUrl,
  normalizeDbUrl,
  secretsPath,
  doadminUrlPath,
};
