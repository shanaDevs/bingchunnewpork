import http from 'k6/http';
import { check } from 'k6';
import { apiUrl, baseHeaders } from './env.js';
import { loginUser } from './auth.js';

/** Non-real SL mobile prefix — passes backend regex, never routes to a real handset. */
export const WRITE_PHONE_PREFIX = '0990000';
export const CHURN_PHONE_PREFIX = '0991';
export const WRITE_USER_PASSWORD = 'LoadTest123!';

/** Stop bootstrap after this many consecutive 429s — bypass key is likely missing/wrong. */
const MAX_CONSECUTIVE_429 = 5;

/**
 * Build deterministic write-test user credentials.
 * Phones: 0990000001 … 0990000NNN (10 digits total after leading 0).
 */
export function generateWriteUsers(count = 60) {
  const n = Math.max(1, Math.min(Number(count) || 60, 900));
  const users = [];
  for (let i = 1; i <= n; i++) {
    const suffix = String(i).padStart(3, '0');
    users.push({
      index: i,
      phone: `${WRITE_PHONE_PREFIX}${suffix}`,
      name: `Write Test User ${suffix}`,
      password: WRITE_USER_PASSWORD,
    });
  }
  return users;
}

/**
 * Register a single user. Returns { session, status } — status is HTTP code.
 * Register does NOT send SMS.
 */
export function registerUser(config, { phone, password, name }) {
  const res = http.post(
    apiUrl(config, '/api/auth/register'),
    JSON.stringify({ phone, password, name }),
    { headers: baseHeaders(config), tags: { name: 'auth_register' } },
  );

  const ok = check(res, {
    'register status 2xx': (r) => r.status >= 200 && r.status < 300,
    'register token present': (r) => {
      try {
        return !!r.json('data.token');
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.warn(`register failed for ${phone}: status=${res.status} body=${String(res.body).slice(0, 200)}`);
    return { session: null, status: res.status };
  }

  const body = res.json();
  return {
    session: {
      token: body.data.token,
      refreshToken: body.data.refreshToken,
      userId: body.data.user.id,
      phone,
      name,
      registered: true,
    },
    status: res.status,
  };
}

/**
 * Login if the user exists; otherwise register. Sequential — call from setup().
 * Fails fast on repeated HTTP 429 (rate-limit bypass not working).
 * Returns { pool, registeredPhones }.
 */
export function ensureUsers(config, count) {
  const planned = count ?? config.writeUserCount ?? 60;
  const users = generateWriteUsers(planned);
  const pool = [];
  const registeredPhones = [];
  let consecutive429 = 0;

  const keyHint = config.loadTestKey
    ? `keyLen=${config.loadTestKey.length}`
    : 'NO_LOAD_TEST_KEY';
  console.log(`Write users bootstrap: planned=${users.length} phones=${users[0]?.phone}…${users[users.length - 1]?.phone} (${keyHint})`);

  if (config.envName === 'production' && !config.loadTestKey) {
    throw new Error(
      'Production write bootstrap requires LOAD_TEST_KEY (-LoadTestKey). Without it auth/general rate limits will 429 and setup will hang.',
    );
  }

  for (const user of users) {
    let session = loginUser(config, user.phone, user.password);
    let lastStatus = session ? 200 : 0;

    if (!session) {
      const result = registerUser(config, user);
      session = result.session;
      lastStatus = result.status;
      if (session) registeredPhones.push(user.phone);
    }

    if (lastStatus === 429) {
      consecutive429 += 1;
      if (consecutive429 >= MAX_CONSECUTIVE_429) {
        throw new Error(
          `Bootstrap aborted after ${MAX_CONSECUTIVE_429} consecutive HTTP 429s ` +
            `(ensured ${pool.length}/${users.length}). ` +
            `Rate-limit bypass is not working — check CapRover LOAD_TEST_BYPASS_KEY matches -LoadTestKey ` +
            `(must be ≥32 chars) and that bing-chun-core was restarted after setting it.`,
        );
      }
    } else {
      consecutive429 = 0;
    }

    if (session) {
      pool.push({
        ...session,
        index: user.index,
        name: user.name,
        password: user.password,
      });
    }
  }

  console.log(
    `Write users: ensured=${pool.length}/${users.length} newlyRegistered=${registeredPhones.length}`,
  );

  return { pool, registeredPhones };
}

/**
 * Soft-delete accounts created during this run (churn registers).
 * Best-effort — failures are logged, not thrown.
 */
export function softDeleteUsers(config, sessions) {
  if (!sessions || sessions.length === 0) return 0;
  let deleted = 0;
  for (const session of sessions) {
    if (!session?.token) continue;
    const res = http.del(apiUrl(config, '/api/auth/me'), null, {
      headers: baseHeaders(config, session.token),
      tags: { name: 'auth_soft_delete' },
    });
    if (res.status >= 200 && res.status < 300) deleted += 1;
  }
  console.log(`Teardown: soft-deleted ${deleted}/${sessions.length} churn users`);
  return deleted;
}

/**
 * Deterministic churn-register phone for VU/iteration (0991 + 6 digits).
 * Max 1_000_000 unique phones in this prefix.
 */
export function churnRegisterPhone(vu, iter) {
  const n = ((vu - 1) * 10000 + (iter % 10000)) % 1000000;
  return `${CHURN_PHONE_PREFIX}${String(n).padStart(6, '0')}`;
}
