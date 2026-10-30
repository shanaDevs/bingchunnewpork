/**
 * Run Nugegoda app-logic seed against live DO Postgres (bingchun-pg / doadmin).
 *
 *   node deploy/digitalocean/run-nugegoda-seed-local.cjs
 *   node deploy/digitalocean/run-nugegoda-seed-local.cjs --dry-run
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { requireDoadminDatabaseUrl, secretsPath } = require('./lib/load-doadmin-database-url.cjs');

function loadSecretsEnv() {
  if (!fs.existsSync(secretsPath)) {
    throw new Error(`Missing ${secretsPath}`);
  }
  const env = { ...process.env };
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }

  try {
    env.DATABASE_URL = requireDoadminDatabaseUrl();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  env.ALLOW_NUGEGODA_APP_SEED = 'true';
  env.ALLOW_SEED_ON_LIVE = 'true';
  env.NODE_ENV = 'production';
  env.TZ = 'Asia/Colombo';
  env.SEED_TARGET_STORE_NAME = env.SEED_TARGET_STORE_NAME || 'Nugegoda';
  env.RUNTIME_SCHEMA_PATCHES = env.RUNTIME_SCHEMA_PATCHES || 'false';
  try {
    const u = new URL(env.DATABASE_URL);
    console.log(`[run-nugegoda-seed-local] DATABASE_URL user=${u.username} host=${u.hostname}`);
  } catch {
    /* ignore */
  }
  return env;
}

const passthrough = process.argv.slice(2).filter((a) => a !== '--');
const backendDir = path.join(__dirname, '../../backend');
const npmArgs = ['run', 'seed:nugegoda-app', '--', ...passthrough];

const child = spawn('npm', npmArgs, {
  cwd: backendDir,
  env: loadSecretsEnv(),
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
