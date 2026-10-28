import http from 'k6/http';
import { check, sleep } from 'k6';
import { apiUrl, baseHeaders } from '../lib/env.js';
import { pickSession, loginUser } from '../lib/auth.js';
import { registerUser, WRITE_USER_PASSWORD } from '../lib/testUsers.js';
import { authChurnSuccessRate, writeErrors } from '../lib/metrics.js';

function ok2xx(res) {
  return res.status >= 200 && res.status < 300;
}

/**
 * Auth churn: login + refresh (default).
 * When setup provides `churnPlan`, each VU may register one planned phone
 * on its first iteration (bounded by REGISTER_COUNT). Teardown soft-deletes
 * those phones by re-logging in — VU mutations are not visible to teardown.
 */
export default function authchurn(data) {
  const { config, authPool, churnPlan } = data;
  const plan = churnPlan || [];
  const planSlot = plan[(__VU - 1) % Math.max(plan.length, 1)];
  const shouldRegister = plan.length > 0 && __ITER === 0 && __VU <= plan.length;

  let iterationOk = true;

  if (shouldRegister && planSlot) {
    const session = registerUser(config, {
      phone: planSlot.phone,
      password: planSlot.password,
      name: planSlot.name,
    });
    if (!session) {
      // Already exists from a prior run — login instead
      const existing = loginUser(config, planSlot.phone, planSlot.password);
      if (!existing) {
        iterationOk = false;
      } else {
        const refreshRes = http.post(
          apiUrl(config, '/api/auth/refresh'),
          JSON.stringify({ refreshToken: existing.refreshToken }),
          { headers: baseHeaders(config), tags: { name: 'auth_refresh' } },
        );
        if (!check(refreshRes, { 'auth_refresh status 2xx': ok2xx })) iterationOk = false;
      }
    } else {
      const refreshRes = http.post(
        apiUrl(config, '/api/auth/refresh'),
        JSON.stringify({ refreshToken: session.refreshToken }),
        { headers: baseHeaders(config), tags: { name: 'auth_refresh' } },
      );
      if (!check(refreshRes, { 'auth_refresh status 2xx': ok2xx })) iterationOk = false;
    }
  } else {
    const session = pickSession(authPool);
    if (!session) {
      console.error('No auth sessions in pool');
      writeErrors.add(1);
      authChurnSuccessRate.add(false);
      return;
    }

    const loginSession = loginUser(config, session.phone, session.password || WRITE_USER_PASSWORD);
    if (!loginSession) {
      iterationOk = false;
    } else {
      const refreshRes = http.post(
        apiUrl(config, '/api/auth/refresh'),
        JSON.stringify({ refreshToken: loginSession.refreshToken }),
        { headers: baseHeaders(config), tags: { name: 'auth_refresh' } },
      );
      if (!check(refreshRes, { 'auth_refresh status 2xx': ok2xx })) iterationOk = false;
    }
  }

  authChurnSuccessRate.add(iterationOk);
  if (!iterationOk) writeErrors.add(1);

  sleep(config.thinkTimeMs / 1000);
}
