/**
 * Bing Chun k6 load test entry point.
 *
 * Usage:
 *   k6 run -e ENV=local -e PROFILE=smoke -e SCENARIOS=browse load-tests/main.js
 *
 * Or use load-tests/run.ps1 (recommended on Windows).
 */
import { buildConfig } from './lib/env.js';
import { buildAuthPool } from './lib/auth.js';
import { loginUser } from './lib/auth.js';
import { hydrateCatalog } from './lib/catalog.js';
import { handleSummary } from './lib/report.js';
import { ensureUsers, softDeleteUsers, churnRegisterPhone, WRITE_USER_PASSWORD } from './lib/testUsers.js';
import browse from './scenarios/browse.js';
import order from './scenarios/order.js';
import socketScenario from './scenarios/socket.js';
import driverGps from './scenarios/driver-gps.js';
import cart from './scenarios/cart.js';
import account from './scenarios/account.js';
import authchurn from './scenarios/authchurn.js';
import validate from './scenarios/validate.js';

const config = buildConfig();

export const options = config.options;

const WRITE_AUTH_SCENARIOS = ['cart', 'account', 'authchurn'];
const LEGACY_AUTH_SCENARIOS = ['order', 'socket'];

export function setup() {
  config.runtimeData = hydrateCatalog(config);

  const needsWriteAuth = config.enabledScenarios.some((s) => WRITE_AUTH_SCENARIOS.includes(s));
  const needsLegacyAuth = config.enabledScenarios.some((s) => LEGACY_AUTH_SCENARIOS.includes(s));

  let authPool = [];

  if (needsWriteAuth) {
    const { pool } = ensureUsers(config, config.writeUserCount);
    authPool = pool;
    if (authPool.length === 0) {
      throw new Error(
        'Write auth pool is empty — register/login failed. Check LOAD_TEST_KEY and that /api/auth/register works.',
      );
    }
  } else if (needsLegacyAuth) {
    authPool = buildAuthPool(config);
    if (authPool.length === 0) {
      throw new Error(
        'Auth pool is empty — ensure backend is running and load-test users exist in the database.',
      );
    }
  }

  // Pre-plan churn register phones so teardown can soft-delete them
  // (VU mutations of setup data are not visible to teardown in k6).
  const churnPlan = [];
  if (config.enabledScenarios.includes('authchurn') && config.registerCount > 0) {
    for (let i = 1; i <= config.registerCount; i++) {
      const phone = churnRegisterPhone(i, 0);
      churnPlan.push({
        phone,
        password: WRITE_USER_PASSWORD,
        name: `Churn User ${String(i).padStart(3, '0')}`,
      });
    }
    console.log(`Churn register plan: ${churnPlan.length} phones (${churnPlan[0]?.phone}…)`);
  }

  return { config, authPool, churnPlan };
}

export function teardown(data) {
  const { config, churnPlan } = data || {};
  if (!config || !churnPlan || churnPlan.length === 0) return;

  const sessions = [];
  for (const planned of churnPlan) {
    const session = loginUser(config, planned.phone, planned.password);
    if (session) sessions.push(session);
  }
  softDeleteUsers(config, sessions);
}

export { handleSummary };

export {
  browse,
  order,
  socketScenario as socket,
  driverGps as driver,
  cart,
  account,
  authchurn,
  validate,
};
