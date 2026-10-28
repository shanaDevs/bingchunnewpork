import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

function formatMetric(value, digits = 2) {
  if (value === undefined || value === null) return 'n/a';
  if (typeof value === 'number') return value.toFixed(digits);
  return String(value);
}

function buildMarkdownDigest(data, meta) {
  const lines = [
    '# Bing Chun Load Test Report',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Environment | ${meta.envName} |`,
    `| Profile | ${meta.profileName} |`,
    `| Scenarios | ${meta.scenarios} |`,
    `| Target | ${meta.httpBase} |`,
    `| Timestamp | ${meta.stamp} |`,
    '',
    '## Key Metrics',
    '',
  ];

  const m = data.metrics || {};
  const rows = [
    ['http_reqs', m.http_reqs?.values?.count, 'total requests'],
    ['http_req_failed', m.http_req_failed?.values?.rate, 'failure rate'],
    ['http_req_duration p(95)', m.http_req_duration?.values?.['p(95)'], 'ms'],
    ['http_req_duration p(99)', m.http_req_duration?.values?.['p(99)'], 'ms'],
    ['checks', m.checks?.values?.rate, 'pass rate'],
    ['order_success_rate', m.order_success_rate?.values?.rate, ''],
    ['cart_success_rate', m.cart_success_rate?.values?.rate, ''],
    ['account_success_rate', m.account_success_rate?.values?.rate, ''],
    ['auth_churn_success_rate', m.auth_churn_success_rate?.values?.rate, ''],
    ['write_errors', m.write_errors?.values?.count, ''],
    ['ws_connect_success', m.ws_connect_success?.values?.rate, ''],
    ['iterations', m.iterations?.values?.count, ''],
    ['dropped_iterations', m.dropped_iterations?.values?.count, ''],
    ['vus_max', m.vus_max?.values?.max, ''],
  ];

  for (const [name, value, note] of rows) {
    if (value !== undefined) {
      lines.push(`- **${name}**: ${formatMetric(value)}${note ? ` (${note})` : ''}`);
    }
  }

  lines.push('', '## Thresholds', '');
  const metrics = data.metrics || {};
  let anyThreshold = false;
  for (const [metricName, metric] of Object.entries(metrics)) {
    const th = metric?.thresholds;
    if (!th || typeof th !== 'object') continue;
    for (const [expr, result] of Object.entries(th)) {
      anyThreshold = true;
      const ok = result?.ok === true;
      lines.push(`- ${ok ? 'PASS' : 'FAIL'} \`${metricName}\`: ${expr}`);
    }
  }
  if (!anyThreshold) {
    lines.push('- (no thresholds recorded)');
  }

  return lines.join('\n');
}

/**
 * k6 handleSummary — writes JSON, text, and markdown alongside dashboard HTML.
 */
export function handleSummary(data) {
  const stamp =
    __ENV.REPORT_STAMP ||
    new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const envName = __ENV.ENV || 'local';
  const profileName = __ENV.PROFILE || 'smoke';
  const scenarios = __ENV.SCENARIOS || 'browse';
  const httpBase =
    envName === 'production'
      ? 'https://bing-chun-core.bc.dartcodes.com'
      : 'http://localhost:4000';

  const meta = { stamp, envName, profileName, scenarios, httpBase };
  const prefix = `load-tests/reports/${envName}-${profileName}-${stamp}`;

  return {
    [`${prefix}.json`]: JSON.stringify(data, null, 2),
    [`${prefix}.txt`]: textSummary(data, { indent: ' ', enableColors: false }),
    [`${prefix}.md`]: buildMarkdownDigest(data, meta),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
