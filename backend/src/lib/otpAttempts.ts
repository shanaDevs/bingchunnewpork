import { createClient, type RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

/** OTP verify attempt tracking (per phone). Resets on successful verify or OTP re-issue. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const REDIS_KEY_PREFIX = 'otp:attempts:';

export const OTP_LOCKOUT_MESSAGE =
  'Too many failed OTP attempts. Request a new code and try again later.';

type AttemptState = { count: number; lockedUntil: number | null };

const attemptsByPhone = new Map<string, AttemptState>();

let redisClient: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

let recordFailScriptSha: string | null = null;

const RECORD_FAIL_LUA = `
local raw = redis.call('GET', KEYS[1])
local count = 0
local lockedUntil = nil
if raw then
  local state = cjson.decode(raw)
  count = tonumber(state.count) or 0
  if state.lockedUntil then lockedUntil = tonumber(state.lockedUntil) end
end
local now = tonumber(ARGV[3])
if lockedUntil and now < lockedUntil then
  return raw
end
if lockedUntil and now >= lockedUntil then
  count = 0
  lockedUntil = nil
end
count = count + 1
local maxAttempts = tonumber(ARGV[1])
local lockoutMs = tonumber(ARGV[2])
if count >= maxAttempts then
  lockedUntil = now + lockoutMs
  count = 0
  local payload = cjson.encode({ count = count, lockedUntil = lockedUntil })
  redis.call('SET', KEYS[1], payload, 'PX', lockoutMs)
  return payload
end
local payload = cjson.encode({ count = count, lockedUntil = lockedUntil })
redis.call('SET', KEYS[1], payload)
return payload
`;

async function getOtpAttemptsRedis(): Promise<RedisClientType | null> {
  const url = config.redisUrl?.trim();
  if (!url) return null;
  if (redisClient?.isOpen) return redisClient;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const client = createClient({ url });
      client.on('error', (err) => logger.warn('OTP attempts Redis error', err));
      await client.connect();
      redisClient = client as RedisClientType;
      return redisClient;
    } catch (err) {
      logger.warn('OTP attempts Redis unavailable — using in-memory state', err);
      redisClient = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

function redisKey(phone: string): string {
  return `${REDIS_KEY_PREFIX}${phone}`;
}

function parseAttemptState(raw: string | null): AttemptState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AttemptState;
    return {
      count: Number(parsed.count) || 0,
      lockedUntil: parsed.lockedUntil != null ? Number(parsed.lockedUntil) : null,
    };
  } catch {
    return null;
  }
}

function stateFor(phone: string): AttemptState {
  let state = attemptsByPhone.get(phone);
  if (!state) {
    state = { count: 0, lockedUntil: null };
    attemptsByPhone.set(phone, state);
  }
  return state;
}

function assertMemoryAllowed(phone: string): void {
  const state = stateFor(phone);
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    throw new Error(OTP_LOCKOUT_MESSAGE);
  }
  if (state.lockedUntil && Date.now() >= state.lockedUntil) {
    state.count = 0;
    state.lockedUntil = null;
  }
}

function recordMemoryFailed(phone: string): void {
  const state = stateFor(phone);
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCKOUT_MS;
    state.count = 0;
  }
}

async function assertRedisAllowed(redis: RedisClientType, phone: string): Promise<void> {
  const key = redisKey(phone);
  const raw = await redis.get(key);
  const state = parseAttemptState(raw);
  if (!state) return;

  const now = Date.now();
  if (state.lockedUntil && now < state.lockedUntil) {
    throw new Error(OTP_LOCKOUT_MESSAGE);
  }
  if (state.lockedUntil && now >= state.lockedUntil) {
    if (state.count === 0) {
      await redis.del(key);
    } else {
      await redis.set(key, JSON.stringify({ count: 0, lockedUntil: null }));
    }
  }
}

async function ensureRecordFailScript(redis: RedisClientType): Promise<string> {
  if (recordFailScriptSha) return recordFailScriptSha;
  recordFailScriptSha = await redis.scriptLoad(RECORD_FAIL_LUA);
  return recordFailScriptSha;
}

async function recordRedisFailed(redis: RedisClientType, phone: string): Promise<void> {
  const key = redisKey(phone);
  const sha = await ensureRecordFailScript(redis);
  await redis.evalSha(sha, {
    keys: [key],
    arguments: [String(MAX_ATTEMPTS), String(LOCKOUT_MS), String(Date.now())],
  });
}

/** Clears in-memory attempt state (tests only). */
export function clearOtpAttemptsMemoryForTests(): void {
  attemptsByPhone.clear();
}

export async function resetOtpAttempts(phone: string): Promise<void> {
  const redis = await getOtpAttemptsRedis();
  if (redis) {
    await redis.del(redisKey(phone));
    return;
  }
  attemptsByPhone.delete(phone);
}

export async function assertOtpAttemptsAllowed(phone: string): Promise<void> {
  const redis = await getOtpAttemptsRedis();
  if (redis) {
    await assertRedisAllowed(redis, phone);
    return;
  }
  assertMemoryAllowed(phone);
}

export async function recordFailedOtpAttempt(phone: string): Promise<void> {
  const redis = await getOtpAttemptsRedis();
  if (redis) {
    await recordRedisFailed(redis, phone);
    return;
  }
  recordMemoryFailed(phone);
}
