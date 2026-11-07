import rateLimit, { type RateLimitRequestHandler, type Store } from 'express-rate-limit';
import { config } from '../config';
import { logger } from '../utils/logger';

const isDev = process.env.NODE_ENV !== 'production';

const OTP_REQUEST_WINDOW_MS = 3 * 60 * 1000;
const OTP_REQUEST_LIMIT_MESSAGE =
  'Too many OTP requests. Please try again after 3 minutes.';

/** Per-limiter Redis store factory — never share one Store across limiters. */
type StoreFactory = ((prefix: string) => Store) | undefined;
let storeFactory: StoreFactory;

type LimiterBundle = {
  otpRateLimiter: RateLimitRequestHandler;
  authRateLimiter: RateLimitRequestHandler;
  refreshRateLimiter: RateLimitRequestHandler;
  deliveryAuthRateLimiter: RateLimitRequestHandler;
  orderTrackRateLimiter: RateLimitRequestHandler;
  orderPlacementRateLimiter: RateLimitRequestHandler;
  reservationCheckoutRateLimiter: RateLimitRequestHandler;
  spinPlayRateLimiter: RateLimitRequestHandler;
  adminReportsRateLimiter: RateLimitRequestHandler;
  generalRateLimiter: RateLimitRequestHandler;
};

let rateLimitStoreKind: 'redis' | 'memory' = 'memory';

export function getRateLimitStoreKind(): 'redis' | 'memory' {
  return rateLimitStoreKind;
}

function buildLimiter(
  prefix: string,
  options: Parameters<typeof rateLimit>[0],
): RateLimitRequestHandler {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...(storeFactory ? { store: storeFactory(prefix) } : {}),
    ...options,
  });
}

function buildLimiters(): LimiterBundle {
  return {
    otpRateLimiter: buildLimiter('rl:otp:', {
      windowMs: OTP_REQUEST_WINDOW_MS,
      max: isDev ? 1000 : 5,
      message: { success: false, message: OTP_REQUEST_LIMIT_MESSAGE },
    }),
    // Count failed auth only — successful login/refresh must not burn the budget.
    authRateLimiter: buildLimiter('rl:auth:', {
      windowMs: 15 * 60 * 1000,
      max: isDev ? 1000 : 40,
      skipSuccessfulRequests: true,
      message: { success: false, message: 'Too many login attempts. Please try again later.' },
    }),
    refreshRateLimiter: buildLimiter('rl:refresh:', {
      windowMs: 15 * 60 * 1000,
      max: isDev ? 1000 : 60,
      skipSuccessfulRequests: true,
      message: { success: false, message: 'Too many refresh attempts. Please try again later.' },
    }),
    deliveryAuthRateLimiter: buildLimiter('rl:delivery-auth:', {
      windowMs: 15 * 60 * 1000,
      max: isDev ? 1000 : 30,
      skipSuccessfulRequests: true,
      message: { success: false, message: 'Too many login attempts. Please try again later.' },
    }),
    orderTrackRateLimiter: buildLimiter('rl:order-track:', {
      windowMs: 15 * 60 * 1000,
      max: isDev ? 10000 : 60,
      message: { success: false, message: 'Too many order lookup attempts. Please try again later.' },
    }),
    orderPlacementRateLimiter: buildLimiter('rl:order-place:', {
      windowMs: 15 * 60 * 1000,
      max: isDev ? 10000 : 30,
      message: { success: false, message: 'Too many checkout attempts. Please try again later.' },
    }),
    reservationCheckoutRateLimiter: buildLimiter('rl:reservation:', {
      windowMs: 10 * 60 * 1000,
      max: isDev ? 10000 : 20,
      message: { success: false, message: 'Too many reservation attempts. Please try again later.' },
    }),
    spinPlayRateLimiter: buildLimiter('rl:spin:', {
      windowMs: 60 * 60 * 1000,
      max: isDev ? 10000 : 40,
      message: { success: false, message: 'Too many spin attempts. Please try again later.' },
    }),
    adminReportsRateLimiter: buildLimiter('rl:admin-reports:', {
      windowMs: 60 * 1000,
      max: isDev ? 10000 : 20,
      message: { success: false, message: 'Too many report requests. Please slow down.' },
    }),
    generalRateLimiter: buildLimiter('rl:general:', {
      windowMs: 60 * 1000,
      max: isDev ? 10000 : 200,
      message: { success: false, message: 'Too many requests. Please slow down.' },
      skip: (req) => {
        const path = req.path || '';
        return (
          path.includes('/whatsapp/webhook') ||
          path.includes('/telegram/webhook') ||
          path === '/health'
        );
      },
    }),
  };
}

let limiters = buildLimiters();

export const otpRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.otpRateLimiter(...args)) as RateLimitRequestHandler;
export const authRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.authRateLimiter(...args)) as RateLimitRequestHandler;
export const refreshRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.refreshRateLimiter(...args)) as RateLimitRequestHandler;
export const deliveryAuthRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.deliveryAuthRateLimiter(...args)) as RateLimitRequestHandler;
export const orderTrackRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.orderTrackRateLimiter(...args)) as RateLimitRequestHandler;
export const orderPlacementRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.orderPlacementRateLimiter(...args)) as RateLimitRequestHandler;
export const reservationCheckoutRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.reservationCheckoutRateLimiter(...args)) as RateLimitRequestHandler;
export const spinPlayRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.spinPlayRateLimiter(...args)) as RateLimitRequestHandler;
export const adminReportsRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.adminReportsRateLimiter(...args)) as RateLimitRequestHandler;
export const generalRateLimiter = ((...args: Parameters<RateLimitRequestHandler>) =>
  limiters.generalRateLimiter(...args)) as RateLimitRequestHandler;

/** Optional Redis-backed store — call before mounting routes when REDIS_URL is set. */
export async function initRateLimitStore(options?: { requireRedis?: boolean }): Promise<void> {
  const url = config.redisUrl?.trim();
  if (!url) {
    if (options?.requireRedis) {
      throw new Error('REDIS_URL is required so shop, cashier, and admin share rate limits');
    }
    return;
  }

  try {
    const { RedisStore } = await import('rate-limit-redis');
    const { createClient } = await import('redis');
    const client = createClient({ url });
    client.on('error', (err: Error) => logger.warn('Rate-limit Redis client error', err));
    await client.connect();

    // Clear legacy shared-store keys (single prefix "rl:") that collided across
    // every limiter. New keys use "rl:<name>:" and must not be wiped on restart.
    try {
      let cursor = 0;
      let removed = 0;
      do {
        const result = await client.scan(cursor, { MATCH: 'rl:*', COUNT: 200 });
        cursor = Number(result.cursor);
        const legacy = result.keys.filter((key) => !/^rl:[a-z0-9-]+:/i.test(key));
        if (legacy.length > 0) {
          await client.del(legacy);
          removed += legacy.length;
        }
      } while (cursor !== 0);
      if (removed > 0) {
        logger.info(`Cleared ${removed} legacy rate-limit Redis key(s)`);
      }
    } catch (flushErr) {
      logger.warn('Could not clear legacy rate-limit keys', flushErr);
    }

    storeFactory = (prefix: string) =>
      new RedisStore({
        prefix,
        sendCommand: (...args: string[]) => client.sendCommand(args),
      });

    limiters = buildLimiters();
    rateLimitStoreKind = 'redis';
    logger.info('Rate limiters using Redis store (unique prefixes per limiter)');
  } catch (err) {
    rateLimitStoreKind = 'memory';
    if (options?.requireRedis) {
      throw new Error('Rate-limit Redis store is required when API_SURFACE is shop, pos, or admin');
    }
    logger.warn('Rate-limit Redis store unavailable — using in-memory limits', err);
  }
}
