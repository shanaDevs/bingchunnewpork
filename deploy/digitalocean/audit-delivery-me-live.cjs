/**
 * Read-only live probe for driver GET /api/delivery/me (504 / 503 investigations).
 *
 *   node deploy/digitalocean/audit-delivery-me-live.cjs
 *   set BEARER=eyJ... && node deploy/digitalocean/audit-delivery-me-live.cjs
 */
const SHOP_ORIGIN = process.env.SHOP_ORIGIN || 'https://bingchunsrilanka.com';
const BEARER = process.env.BEARER || '';

async function probe(label, url, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, redirect: 'follow' });
    const text = await res.text();
    const ms = Date.now() - started;
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawPrefix: text.slice(0, 120), contentType: res.headers.get('content-type') };
    }
    return {
      label,
      url,
      status: res.status,
      ms,
      xDoOrigStatus: res.headers.get('x-do-orig-status'),
      server: res.headers.get('server'),
      body:
        typeof body === 'object' && body !== null && !body.rawPrefix
          ? body
          : body,
    };
  } catch (err) {
    return { label, url, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}

async function burstDeliveryMe(n = 8) {
  const url = `${SHOP_ORIGIN}/api/delivery/me`;
  const headers = BEARER ? { Authorization: `Bearer ${BEARER}` } : {};
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(await probe(`burst_${i + 1}`, url, headers));
  }
  return results;
}

async function main() {
  const checkedAt = new Date().toISOString();
  const health = await probe('health', `${SHOP_ORIGIN}/health`);
  const meNoAuth = await probe('delivery_me_no_auth', `${SHOP_ORIGIN}/api/delivery/me`);
  const meBearer = BEARER
    ? await probe('delivery_me_bearer', `${SHOP_ORIGIN}/api/delivery/me`, {
        Authorization: `Bearer ${BEARER}`,
      })
    : { skipped: true, reason: 'Set BEARER env for authenticated probe' };
  const burst = await burstDeliveryMe(8);

  const statuses = burst.map((b) => b.status).filter(Boolean);
  const slow = burst.filter((b) => (b.ms || 0) > 5000);
  const errors504 = burst.filter((b) => b.status === 504 || b.status === 503);

  const report = {
    checkedAt,
    shopOrigin: SHOP_ORIGIN,
    health,
    deliveryMe: { noAuth: meNoAuth, bearer: meBearer },
    burst: { samples: burst, statusCounts: countStatuses(statuses), slowOver5s: slow.length, count503504: errors504.length },
    interpretation: [],
    deployDecision: {},
  };

  if (health.body?.surface === 'core') {
    report.interpretation.push(
      'Live API reports API_SURFACE=core — /api/delivery/* is mounted without local shop-surface changes.',
    );
  }
  if (meNoAuth.status === 401 && (meNoAuth.ms || 0) < 3000) {
    report.interpretation.push(
      'Route responds quickly with 401 when unauthenticated — not a missing-route 404 and not a gateway timeout in this run.',
    );
  }
  if (errors504.length === 0) {
    report.interpretation.push(
      'No 503/504 in burst — origin was healthy at check time; earlier 504 was likely transient DO 503 (x-do-orig-status).',
    );
  } else {
    report.interpretation.push('503/504 reproduced in burst — check DO shop-api logs and instance health immediately.');
  }
  if (BEARER && meBearer.status === 401) {
    report.interpretation.push(
      'Bearer token returned 401 — re-run OTP login on device; JWT may be expired or JWT_SECRET/session version changed.',
    );
  }
  if (BEARER && meBearer.status === 200) {
    report.interpretation.push('Authenticated getMe OK — driver app should work after fresh login with same API host.');
  }

  report.deployDecision = {
    localChangesRequiredFor504Fix: false,
    reason:
      '504 was origin 503; live core surface already serves /delivery/me. Local shop-surface + URL edits are not deployed and are only needed if shop-api uses API_SURFACE=shop.',
    localChangesStillWorthwhile:
      'Yes when you deploy bingchun-shop with API_SURFACE=shop from app.shop.yaml — mount /delivery + DELIVERY_SERVICE_ENABLED=false.',
    userActionNoPush:
      'Re-login driver app on device; monitor DO shop-api; do not rely on uncommitted local files for production.',
  };

  const outPath = `${__dirname}/.live-delivery-me-audit.json`;
  require('fs').writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

function countStatuses(statuses) {
  const m = {};
  for (const s of statuses) m[s] = (m[s] || 0) + 1;
  return m;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
