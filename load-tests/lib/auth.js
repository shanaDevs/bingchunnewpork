import http from 'k6/http';
import { check } from 'k6';
import { apiUrl, baseHeaders } from './env.js';

/**
 * Login a single user. Returns { token, userId, phone } or null.
 */
export function loginUser(config, phone, password) {
  const res = http.post(
    apiUrl(config, '/api/auth/login'),
    JSON.stringify({ phone, password }),
    { headers: baseHeaders(config), tags: { name: 'auth_login' } },
  );

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login success': (r) => {
      try {
        return r.json('success') === true;
      } catch {
        return false;
      }
    },
    'login token present': (r) => {
      try {
        return !!r.json('data.token');
      } catch {
        return false;
      }
    },
  });

  if (!ok) return null;

  const body = res.json();
  return {
    token: body.data.token,
    refreshToken: body.data.refreshToken,
    userId: body.data.user.id,
    phone,
  };
}

/**
 * Build token pool in setup() — one entry per seeded user (up to maxUsers).
 * Logins are sequential to avoid hammering auth rate limiter during setup.
 */
export function buildAuthPool(config, maxUsers = 100) {
  const users = (config.runtimeData.users || []).slice(0, maxUsers);
  const pool = [];

  for (const user of users) {
    const session = loginUser(config, user.phone, user.password);
    if (session) {
      pool.push({ ...session, index: user.index, name: user.name });
    }
  }

  return pool;
}

/** Pick a session for this VU (round-robin by __VU). */
export function pickSession(pool) {
  if (!pool || pool.length === 0) return null;
  return pool[(__VU - 1) % pool.length];
}
