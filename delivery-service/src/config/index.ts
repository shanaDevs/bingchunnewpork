import dotenv from 'dotenv';
import path from 'path';

const localEnv = path.resolve(__dirname, '../../.env');

dotenv.config({ path: localEnv });

/** Local dev only: set DELIVERY_LOAD_BACKEND_ENV=true to merge backend/.env (not used in production). */
if (process.env.NODE_ENV !== 'production' && process.env.DELIVERY_LOAD_BACKEND_ENV === 'true') {
  const backendEnv = path.resolve(__dirname, '../../../backend/.env');
  dotenv.config({ path: backendEnv });
}

export const config = {
  // Prefer DELIVERY_PORT so a shared backend .env (PORT=4000) cannot steal this bind.
  port: parseInt(process.env.DELIVERY_PORT || process.env.PORT || '4100', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'bingchun-dev-secret-change-in-prod',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'bingchun-refresh-secret-change-in-prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  /** Driver access token lifetime (M7 raises this from the legacy 7d token). */
  jwtDeliveryAccessExpiresIn: process.env.JWT_DELIVERY_ACCESS_EXPIRES_IN || '12h',
  /** Driver refresh token lifetime. */
  jwtDeliveryRefreshExpiresIn: process.env.JWT_DELIVERY_REFRESH_EXPIRES_IN || '30d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
  coreApiUrl: process.env.CORE_API_URL || 'http://localhost:4000',
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || '',
  osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
  gpsRetentionDays: parseInt(process.env.GPS_RETENTION_DAYS || '30', 10),
  redisUrl: process.env.REDIS_URL || '',
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  /** Auto-approve unknown driver devices on first login (MVP — flip off once branch-manager approval UI exists). */
  autoApproveDriverDevices:
    process.env.NODE_ENV === 'production'
      ? process.env.DRIVER_DEVICE_AUTO_APPROVE === 'true'
      : process.env.DRIVER_DEVICE_AUTO_APPROVE !== 'false',
  otpPepper: process.env.DELIVERY_OTP_PEPPER || 'bingchun-otp-pepper-change-in-prod',
  otpTtlMinutes: parseInt(process.env.DELIVERY_OTP_TTL_MINUTES || '15', 10),
  /**
   * Baseline for every branch: drivers must enter the customer code before DELIVERED.
   * Store.deliveryOtpRequired can only add the requirement, never remove it.
   */
  deliveryOtpRequiredDefault: process.env.DELIVERY_OTP_REQUIRED !== 'false',
  /** Must match backend DRIVER_PIN_PEPPER (empty → fall back to JWT_SECRET for dual-read). */
  driverPinPepper: process.env.DRIVER_PIN_PEPPER || '',
  deliveryRiderProfileEnabled: process.env.DELIVERY_RIDER_PROFILE_ENABLED === 'true',
  deliveryIntegrationEventsEnabled: process.env.DELIVERY_INTEGRATION_EVENTS_ENABLED === 'true',
};
