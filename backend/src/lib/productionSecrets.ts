import { config } from '../config';
import { logger } from '../utils/logger';

const INSECURE_DEFAULTS = new Set([
  'bingchun-dev-secret-change-in-prod',
  'bingchun-refresh-secret-change-in-prod',
  'bingchun-internal-dev-secret',
  'bingchun-otp-pepper-change-in-prod',
]);

function assertSecret(name: string, value: string, minLength = 32): void {
  if (!value || value.length < minLength || INSECURE_DEFAULTS.has(value)) {
    throw new Error(
      `${name} must be set to a strong random value (>= ${minLength} chars) in production`,
    );
  }
}

/** Crash at startup if production is running with known or missing secrets. */
export function assertProductionSecrets(): void {
  if (config.nodeEnv !== 'production') return;

  assertSecret('JWT_SECRET', config.jwtSecret);
  assertSecret('JWT_REFRESH_SECRET', config.jwtRefreshSecret);
  assertSecret('INTERNAL_SERVICE_SECRET', config.internalServiceSecret);
  assertSecret('DELIVERY_OTP_PEPPER', config.otpPepper);

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL must be set in production');
  }

  assertSecret('DRIVER_PIN_PEPPER', config.driverPinPepper);
  if (config.driverPinPepper === config.jwtSecret) {
    throw new Error('DRIVER_PIN_PEPPER must be different from JWT_SECRET in production');
  }

  if (process.env.SOCKET_AUTH_ENFORCED === 'false') {
    throw new Error('SOCKET_AUTH_ENFORCED=false is not allowed in production');
  }

  const requireRedis =
    process.env.REQUIRE_REDIS === 'true'
    || (Number.parseInt(process.env.API_REPLICA_COUNT || '0', 10) || 0) >= 2;
  if (requireRedis && !process.env.REDIS_URL?.trim()) {
    throw new Error(
      'REDIS_URL must be set in production when REQUIRE_REDIS=true or API_REPLICA_COUNT>=2',
    );
  }

  if (!process.env.REDIS_URL?.trim()) {
    logger.warn('REDIS_URL is unset — rate limits and sockets are not shared across API replicas');
  }
}

/** After DB is up: report missing SMS without taking the API down. */
export async function assertProductionRuntimeConfig(): Promise<void> {
  if (config.nodeEnv !== 'production') return;

  const { getSmsRuntimeConfig } = await import('./smsSettings');
  const sms = await getSmsRuntimeConfig();
  if (sms.provider !== 'smslenz' || !sms.enabled || !sms.configured) {
    logger.error(
      'Production SMS is not configured. The API will stay up, but OTP and SMS will not send until SMSlenz credentials are set in admin Settings.',
    );
  }
}
