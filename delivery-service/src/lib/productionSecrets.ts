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
export function assertProductionSecrets(nodeEnv: string, secrets: {
  jwtSecret: string;
  jwtRefreshSecret: string;
  internalServiceSecret: string;
  otpPepper: string;
  databaseUrl: string;
}): void {
  if (nodeEnv !== 'production') return;

  assertSecret('JWT_SECRET', secrets.jwtSecret);
  assertSecret('JWT_REFRESH_SECRET', secrets.jwtRefreshSecret);
  assertSecret('INTERNAL_SERVICE_SECRET', secrets.internalServiceSecret);
  assertSecret('DELIVERY_OTP_PEPPER', secrets.otpPepper);

  if (!secrets.databaseUrl) {
    throw new Error('DATABASE_URL must be set in production');
  }
}
