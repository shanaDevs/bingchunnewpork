import { environments } from '../config/environments.js';
import { profiles, parseStages } from '../config/profiles.js';

const ALL_SCENARIOS = [
  'browse',
  'order',
  'socket',
  'driver',
  'cart',
  'account',
  'authchurn',
  'validate',
];

const WRITE_SCENARIOS = ['cart', 'account', 'authchurn', 'order'];

function envStr(key, fallback) {
  const v = __ENV[key];
  return v !== undefined && v !== '' ? v : fallback;
}

function envNum(key, fallback) {
  const raw = __ENV[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key, fallback) {
  const raw = __ENV[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** Build executor block for a scenario from profile + overrides. */
function buildExecutor(profileName, overrides = {}) {
  const profile = profiles[profileName] || profiles.smoke;
  const customStages = parseStages(__ENV.STAGES);

  if (customStages) {
    return {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: customStages,
      gracefulRampDown: '30s',
      ...overrides,
    };
  }

  if (__ENV.VUS || __ENV.DURATION) {
    return {
      executor: 'constant-vus',
      vus: envNum('VUS', profile.vus || 5),
      duration: envStr('DURATION', profile.duration || '1m'),
      ...overrides,
    };
  }

  if (profile.executor === 'constant-vus') {
    return {
      executor: 'constant-vus',
      vus: profile.vus,
      duration: profile.duration,
      ...overrides,
    };
  }

  return {
    executor: profile.executor,
    startVUs: profile.startVUs ?? 0,
    stages: profile.stages,
    gracefulRampDown: '30s',
    ...overrides,
  };
}

/** Scenario-specific tuning — socket holds connections, driver posts slowly. */
const scenarioOverrides = {
  socket: {
    gracefulStop: '35s',
  },
  driver: {
    // ~0.2 Hz per VU (5s sleep in scenario)
  },
};

function defaultP95(profileName, enabledScenarios) {
  if (__ENV.P95_MS) return envNum('P95_MS', 500);
  if (profileName === 'typical') return 4000;
  const hasWrites = enabledScenarios.some((s) => WRITE_SCENARIOS.includes(s));
  if (hasWrites) return 2500;
  return 500;
}

/**
 * Resolve full run configuration from __ENV.
 * @returns {object} config passed through setup() to VUs
 */
export function buildConfig() {
  const envName = envStr('ENV', 'local');
  const target = environments[envName];
  if (!target) {
    throw new Error(`Unknown ENV="${envName}". Use local or production.`);
  }

  const profileName = envStr('PROFILE', 'smoke');
  const scenariosRaw = envStr('SCENARIOS', 'browse');
  const enabledScenarios = scenariosRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ALL_SCENARIOS.includes(s));

  if (enabledScenarios.length === 0) {
    throw new Error(`No valid scenarios in SCENARIOS="${scenariosRaw}". Use: ${ALL_SCENARIOS.join(', ')}`);
  }

  const profile = profiles[profileName] || profiles.smoke;
  const p95Ms = defaultP95(profileName, enabledScenarios);
  const errorRate = envNum('ERROR_RATE', 0.01);
  const thinkTimeMs = envNum('THINK_TIME_MS', profile.thinkTimeMs || 500);
  const loadTestKey = envStr('LOAD_TEST_KEY', '');
  const socketSessionMs = envNum('SOCKET_SESSION_MS', 30000);
  const driverToken = envStr('DRIVER_TOKEN', '');
  const writeUserCount = envNum('WRITE_USER_COUNT', 60);
  const registerCount = envNum('REGISTER_COUNT', 0);
  const includeGeocode = envBool('INCLUDE_GEOCODE', false);

  const runtimeData = JSON.parse(open('./config/runtime-data.json'));

  const config = {
    envName,
    profileName,
    enabledScenarios,
    target,
    p95Ms,
    errorRate,
    thinkTimeMs,
    loadTestKey,
    socketSessionMs,
    driverToken,
    writeUserCount,
    registerCount,
    includeGeocode,
    runtimeData,
    reportStamp: envStr('REPORT_STAMP', ''),
  };

  const scenarioBlocks = {};
  for (const name of enabledScenarios) {
    scenarioBlocks[name] = {
      ...buildExecutor(profileName, scenarioOverrides[name] || {}),
      exec: name,
      tags: { scenario: name },
    };
  }

  const thresholds = {
    http_req_duration: [`p(95)<${p95Ms}`],
    http_req_failed: [`rate<${errorRate}`],
    checks: ['rate>0.95'],
  };
  if (enabledScenarios.includes('order')) {
    thresholds.order_success_rate = ['rate>0.5'];
  }
  if (enabledScenarios.includes('socket')) {
    thresholds.ws_connect_errors = ['count<100'];
    thresholds.ws_connect_success = ['rate>0.9'];
  }
  if (enabledScenarios.includes('driver')) {
    thresholds.driver_gps_success = ['rate>0.9'];
  }
  if (enabledScenarios.includes('cart')) {
    thresholds.cart_success_rate = ['rate>0.95'];
  }
  if (enabledScenarios.includes('account')) {
    thresholds.account_success_rate = ['rate>0.95'];
  }
  if (enabledScenarios.includes('authchurn')) {
    thresholds.auth_churn_success_rate = ['rate>0.95'];
  }

  config.options = {
    scenarios: scenarioBlocks,
    thresholds,
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    setupTimeout: '5m',
    teardownTimeout: '3m',
  };

  return config;
}

/** HTTP headers including optional load-test bypass key. */
export function baseHeaders(config, token) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.loadTestKey) {
    headers['x-load-test-key'] = config.loadTestKey;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function apiUrl(config, path) {
  const base = config.target.httpBase.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function deliveryUrl(config, path) {
  const base = config.target.deliveryBase.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export { ALL_SCENARIOS, WRITE_SCENARIOS };
