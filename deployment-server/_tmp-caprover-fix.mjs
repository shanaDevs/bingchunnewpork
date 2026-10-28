const BASE = process.env.CAPROVER_URL || 'https://captain.bc.dartcodes.com';
const PASSWORD = process.env.CAPROVER_PASSWORD;

async function login() {
  const res = await fetch(`${BASE}/api/v2/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const json = await res.json();
  if (json.status !== 100) throw new Error(`login failed: ${json.description || res.status}`);
  return json.data.token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api/v2${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-captain-auth': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function upsertEnv(envVars, key, value) {
  const i = envVars.findIndex((e) => e.key === key);
  if (i >= 0) envVars[i] = { key, value };
  else envVars.push({ key, value });
}

async function getApp(token, appName) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const defs = await api(token, 'GET', '/user/apps/appDefinitions');
    if (defs.status !== 100) throw new Error(defs.description || 'list failed');
    const app = (defs.data.appDefinitions || []).find((a) => a.appName === appName);
    if (!app) throw new Error(`${appName} not found`);
    return app;
  }
}

async function updateApp(token, appName, { instanceCount, mutator }) {
  for (let attempt = 1; attempt <= 36; attempt++) {
    const app = await getApp(token, appName);
    const envVars = [...(app.envVars || [])];
    if (mutator) mutator(envVars);
    const payload = {
      appName: app.appName,
      instanceCount: instanceCount ?? app.instanceCount ?? 1,
      captainDefinitionRelativeFilePath: app.captainDefinitionRelativeFilePath || 'captain-definition',
      volumes: app.volumes || [],
      ports: app.ports || [],
      envVars,
      notExposeAsWebApp: !!app.notExposeAsWebApp,
      forceSsl: !!app.forceSsl,
      websocketSupport: !!app.websocketSupport,
      containerHttpPort: app.containerHttpPort || 80,
      description: app.description || '',
      nodeId: app.nodeId || '',
      customNginxConfig: app.customNginxConfig || '',
      redirectDomain: app.redirectDomain || '',
      httpAuth: app.httpAuth,
      appPushWebhook: app.appPushWebhook,
      appDeployTokenConfig: app.appDeployTokenConfig,
      tags: app.tags || [],
      serviceUpdateOverride: app.serviceUpdateOverride || '',
      preDeployFunction: app.preDeployFunction || '',
    };
    const result = await api(token, 'POST', '/user/apps/appDefinitions/update', payload);
    if (result.status === 100) {
      console.log(`updated ${appName} instanceCount=${payload.instanceCount}`);
      return;
    }
    const msg = result.description || '';
    if (/build in-progress|please wait/i.test(msg)) {
      console.log(`${appName}: ${msg} (retry ${attempt}/36)`);
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }
    throw new Error(`${appName}: ${msg || JSON.stringify(result)}`);
  }
  throw new Error(`${appName}: timed out`);
}

async function main() {
  const token = await login();
  const phase = process.argv[2] || 'all';

  if (phase === 'stop' || phase === 'all') {
    // Scale to 0 so DDL can run without concurrent schema patches.
    for (const name of ['bing-chun-core', 'bing-chun-shop', 'bing-chun-delivery']) {
      await updateApp(token, name, { instanceCount: 0 });
    }
  }

  if (phase === 'start' || phase === 'all') {
    await updateApp(token, 'bing-chun-core', {
      instanceCount: 1,
      mutator: (env) => {
        upsertEnv(env, 'API_SURFACE', 'core');
        upsertEnv(env, 'RUNTIME_SCHEMA_PATCHES', 'true');
        upsertEnv(env, 'PRISMA_CONNECTION_LIMIT', '4');
        upsertEnv(env, 'PRISMA_POOL_TIMEOUT', '15');
        upsertEnv(env, 'PRISMA_CONNECT_TIMEOUT', '8');
      },
    });
    await updateApp(token, 'bing-chun-shop', {
      instanceCount: 1,
      mutator: (env) => {
        upsertEnv(env, 'API_SURFACE', 'shop');
        upsertEnv(env, 'RUNTIME_SCHEMA_PATCHES', 'false');
        upsertEnv(env, 'PRISMA_CONNECTION_LIMIT', '3');
        upsertEnv(env, 'PRISMA_POOL_TIMEOUT', '15');
        upsertEnv(env, 'PRISMA_CONNECT_TIMEOUT', '8');
      },
    });
    await updateApp(token, 'bing-chun-delivery', {
      instanceCount: 1,
      mutator: (env) => {
        upsertEnv(env, 'RUNTIME_SCHEMA_PATCHES', 'false');
        upsertEnv(env, 'PRISMA_CONNECTION_LIMIT', '3');
        upsertEnv(env, 'PRISMA_POOL_TIMEOUT', '15');
      },
    });
  }

  console.log('OK phase', phase);
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exitCode = 1;
});
