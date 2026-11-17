/**
 * Add GOOGLE_MAPS_API_KEY SECRET to API components on App Platform.
 * Usage:
 *   set DIGITALOCEAN_ACCESS_TOKEN=dop_v1_...
 *   node deploy/digitalocean/set-google-maps-env.mjs
 */
const fs = require('fs');
const path = require('path');

const token = process.env.DIGITALOCEAN_ACCESS_TOKEN || process.env.DIGITALOCEAN_TOKEN || '';
if (!token) {
  console.error('Set DIGITALOCEAN_ACCESS_TOKEN first');
  process.exit(1);
}

function loadSecrets() {
  const p = path.join(__dirname, 'secrets.env');
  const map = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    map[m[1]] = v;
  }
  return map;
}

const secrets = loadSecrets();
const mapsKey = secrets.GOOGLE_MAPS_API_KEY;
const mapsServerKey = secrets.GOOGLE_MAPS_SERVER_API_KEY || mapsKey;
if (!mapsKey) {
  console.error('GOOGLE_MAPS_API_KEY missing from deploy/digitalocean/secrets.env');
  process.exit(1);
}

const APPS = [
  { id: '7b9e870e-84a4-48cd-8d0b-e22e07df76e8', name: 'bing-chun', components: ['shop-api', 'shop-worker'] },
  { id: 'c8b59aec-bb32-4962-b723-392a66ddbd83', name: 'bingchun-admin', components: null },
  { id: 'fc15b457-f941-4793-9c09-ecbad64fc175', name: 'bingchun-pos', components: null },
  { id: 'ff2a8f38-475b-40f0-8dcc-774cf582792b', name: 'bingchun-delivery', components: null },
];

async function api(method, urlPath, body) {
  const res = await fetch(`https://api.digitalocean.com/v2${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json.message || json.error || text.slice(0, 300);
    throw new Error(`${method} ${urlPath} → ${res.status}: ${msg}`);
  }
  return json;
}

function upsertEnv(envs, key, value) {
  const list = Array.isArray(envs) ? [...envs] : [];
  const idx = list.findIndex((e) => e && e.key === key);
  const entry = { key, value, scope: 'RUN_TIME', type: 'SECRET' };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  return list;
}

function ensureMapsEnv(envs) {
  let list = upsertEnv(envs, 'GOOGLE_MAPS_API_KEY', mapsKey);
  if (mapsServerKey && mapsServerKey !== mapsKey) {
    list = upsertEnv(list, 'GOOGLE_MAPS_SERVER_API_KEY', mapsServerKey);
  } else {
    list = upsertEnv(list, 'GOOGLE_MAPS_SERVER_API_KEY', mapsServerKey);
  }
  return list;
}

function patchComponent(comp, force) {
  if (!comp || !comp.name) return false;
  const isApi =
    force ||
    /api$/i.test(comp.name) ||
    /worker$/i.test(comp.name) ||
    comp.name === 'delivery' ||
    (comp.dockerfile_path && String(comp.dockerfile_path).includes('backend'));
  if (!isApi) return false;
  comp.envs = ensureMapsEnv(comp.envs);
  return true;
}

async function updateApp(app) {
  const { app: full } = await api('GET', `/apps/${app.id}`);
  const spec = full.spec;
  let changed = 0;
  const forceNames = app.components ? new Set(app.components) : null;
  for (const group of ['services', 'workers', 'jobs']) {
    for (const comp of spec[group] || []) {
      const force = forceNames ? forceNames.has(comp.name) : false;
      if (forceNames && !force) continue;
      if (patchComponent(comp, force || !forceNames)) {
        changed += 1;
        console.log(`[${app.name}] + GOOGLE_MAPS_API_KEY on ${comp.name}`);
      }
    }
  }
  if (!changed) {
    console.log(`[${app.name}] no API components patched`);
    return;
  }
  await api('PUT', `/apps/${app.id}`, { spec });
  console.log(`[${app.name}] updated`);
}

(async () => {
  for (const app of APPS) {
    await updateApp(app);
  }
  console.log('Done. App Platform will redeploy affected apps.');
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
