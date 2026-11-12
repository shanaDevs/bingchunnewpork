import dotenv from 'dotenv';
import { resolveApiSurface, resolveRunBackgroundJobs } from '../lib/apiSurface';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  timezone: process.env.TZ || 'Asia/Colombo',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'bingchun-dev-secret-change-in-prod',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'bingchun-refresh-secret-change-in-prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  /**
   * Customer access token TTL (short-lived). Keep-alive + /auth/refresh rotate
   * a new access token so shoppers stay signed in like Facebook.
   */
  jwtUserExpiresIn: process.env.JWT_USER_EXPIRES_IN || '1d',
  /**
   * Admin/cashier refresh TTL — ~10y so staff (especially cashiers) stay signed
   * in via keep-alive refresh, Facebook-style. Access tokens still rotate every
   * JWT_EXPIRES_IN (default 15m).
   */
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '3650d',
  /** Customer refresh TTL — ~10y so sessions effectively never idle-expire. */
  jwtUserRefreshExpiresIn: process.env.JWT_USER_REFRESH_EXPIRES_IN || '3650d',
  frontendUrl: (() => {
    const fromEnv = process.env.FRONTEND_URL?.trim();
    if (fromEnv && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(fromEnv)) return fromEnv;
    // Legacy mp-server fallback only — set FRONTEND_URL explicitly on new deployments.
    const apiBase = process.env.API_BASE_URL || process.env.FAPI_BASE_URL || '';
    if (/bing-chung-b\.mp\.dartcodes\.com/i.test(apiBase)) {
      return 'https://bing-chung.mp.dartcodes.com';
    }
    return fromEnv || 'http://localhost:3000';
  })(),
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
  apiBaseUrl:
    process.env.API_BASE_URL ||
    process.env.FAPI_BASE_URL ||
    `http://localhost:${process.env.PORT || '4000'}`,

  payhere: {
    merchantId: process.env.PAYHERE_MERCHANT_ID || 'mock_merchant',
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || 'mock_secret',
    mode: process.env.PAYHERE_MODE || 'sandbox',
  },

  webxpay: {
    publicKey: process.env.WEBXPAY_PUBLIC_KEY || '',
    secretKey: process.env.WEBXPAY_SECRET_KEY || '',
    apiUsername: process.env.WEBXPAY_API_USERNAME || '',
    apiPassword: process.env.WEBXPAY_API_PASSWORD || '',
    mode: process.env.WEBXPAY_MODE || 'sandbox',
    returnUrl: process.env.WEBXPAY_RETURN_URL || '',
  },

  google: {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
  },

  sms: {
    provider: process.env.SMS_PROVIDER || (process.env.SMSLENZ_API_KEY ? 'smslenz' : 'mock'),
    apiKey: process.env.SMSLENZ_API_KEY || process.env.SMS_API_KEY || '',
    senderId: process.env.SMSLENZ_SENDER_ID || process.env.SMS_SENDER_ID || 'BingChun',
    smslenz: {
      baseUrl: process.env.SMSLENZ_BASE_URL || 'https://smslenz.lk',
      userId: process.env.SMSLENZ_USER_ID || '',
      apiKey: process.env.SMSLENZ_API_KEY || process.env.SMS_API_KEY || '',
      senderId: process.env.SMSLENZ_SENDER_ID || process.env.SMS_SENDER_ID || 'BingChun',
      connectionTimeoutMs: parseInt(process.env.SMSLENZ_CONNECTION_TIMEOUT_MS || '30000', 10),
      readTimeoutMs: parseInt(process.env.SMSLENZ_READ_TIMEOUT_MS || '30000', 10),
    },
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || 'mock',
    from: process.env.EMAIL_FROM || 'noreply@bingchunsrilanka.lk',
    apiKey: process.env.SENDGRID_API_KEY || '',
  },

  fcm: {
    serverKey: process.env.FCM_SERVER_KEY || '',
  },

  loyalty: {
    pointsPerLkr: parseFloat(process.env.LOYALTY_POINTS_PER_LKR || '0.01'),
    redeemValue: parseFloat(process.env.LOYALTY_REDEEM_VALUE || '1.0'),
    maxRedeemPct: parseInt(process.env.LOYALTY_MAX_REDEEM_PCT || '100', 10),
  },

  doSpaces: {
    key: process.env.DO_SPACES_KEY || '',
    secret: process.env.DO_SPACES_SECRET || '',
    bucket: process.env.DO_SPACES_BUCKET || '',
    region: process.env.DO_SPACES_REGION || 'sgp1',
    endpoint: process.env.DO_SPACES_ENDPOINT || '',
    prefix: process.env.DO_SPACES_PREFIX || 'bingchun',
    /** Presigned GET TTL for settlement/payout proof objects (seconds). */
    proofUrlTtlSeconds: Math.min(
      3600,
      Math.max(60, parseInt(process.env.SPACES_PROOF_URL_TTL_SECONDS || '600', 10) || 600),
    ),
  },

  /** When true, legacy /api/delivery* and admin delivery routes proxy to the delivery service. */
  deliveryServiceEnabled: process.env.DELIVERY_SERVICE_ENABLED === 'true',
  deliveryAdminServiceEnabled: process.env.DELIVERY_ADMIN_SERVICE_ENABLED === 'true',
  deliveryServiceUrl: process.env.DELIVERY_SERVICE_URL || 'http://localhost:4100',
  /** Dual-write driver ops fields to delivery.rider_profiles (requires migration + backfill). */
  deliveryRiderProfileEnabled: process.env.DELIVERY_RIDER_PROFILE_ENABLED === 'true',
  /** Redis stream consumer for delivery.order_status (replaces HTTP outbox relay on delivery side). */
  deliveryIntegrationEventsEnabled: process.env.DELIVERY_INTEGRATION_EVENTS_ENABLED === 'true',
  /** Fetch live tracking payload from delivery-service internal API in GET /orders/:id. */
  deliveryTrackingViaService: process.env.DELIVERY_TRACKING_VIA_SERVICE === 'true',
  /**
   * Strangler-pattern flags for the in-progress micro-service extraction (docs/28).
   * Flip each to true only after that service's routes are actually mounted and its
   * nginx location block is live — see services/{orders,payment,notification}/src/routes.
   * Until then bc-core keeps serving those paths itself (safe default: all false).
   */
  orderServiceEnabled: process.env.ORDER_SERVICE_ENABLED === 'true',
  orderServiceUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:4200',
  /** When true, platform provider receivable is computed via payment service HTTP API. */
  paymentServiceEnabled: process.env.PAYMENT_SERVICE_ENABLED === 'true',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4300',
  notificationServiceEnabled: process.env.NOTIFICATION_SERVICE_ENABLED === 'true',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4400',
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || 'bingchun-internal-dev-secret',
  redisUrl: process.env.REDIS_URL || '',
  /**
   * Which route set this process serves. Unset or `core` keeps the full API
   * so the existing bing-chun-core app does not change behavior.
   */
  apiSurface: resolveApiSurface(),
  /** When false, cron/interval background jobs are skipped (use on secondary API replicas). */
  runBackgroundJobs: resolveRunBackgroundJobs(),
  gpsRetentionDays: parseInt(process.env.GPS_RETENTION_DAYS || '30', 10),
  /**
   * When true, joinUser/joinAdmin require a matching JWT in the socket handshake.
   * Defaults to true in production; set SOCKET_AUTH_ENFORCED=false only during client rollout.
   */
  socketAuthEnforced:
    process.env.SOCKET_AUTH_ENFORCED !== undefined
      ? process.env.SOCKET_AUTH_ENFORCED === 'true'
      : (process.env.NODE_ENV || 'development') === 'production',
  /**
   * When false, skip boot-time ensure*() ALTER TABLE patches (use Prisma Migrate instead).
   * Default true for backward compatibility with environments not yet on migrate deploy.
   */
  runtimeSchemaPatches: process.env.RUNTIME_SCHEMA_PATCHES !== 'false',

  /**
   * When true, branch admins can submit payout requests (legacy flow).
   * Super Admin currently initiates every 15-day payout; flip to true to restore
   * the Branch Admin "Request Payout" path without deleting that code.
   */
  ENABLE_BRANCH_PAYOUT_REQUESTS: process.env.ENABLE_BRANCH_PAYOUT_REQUESTS === 'true',

  /** Pepper + TTL for hashed delivery OTPs (Store.deliveryOtpRequired). */
  otpPepper: process.env.DELIVERY_OTP_PEPPER || 'bingchun-otp-pepper-change-in-prod',
  otpTtlMinutes: parseInt(process.env.DELIVERY_OTP_TTL_MINUTES || '15', 10),
  /**
   * Dedicated pepper for driver PIN HMAC lookups. Falls back to JWT_SECRET so existing
   * pinLookup rows keep working until DRIVER_PIN_PEPPER is set and dual-read rehashes them.
   */
  driverPinPepper: process.env.DRIVER_PIN_PEPPER || '',
  /**
   * Baseline for every branch: drivers must enter the customer code before DELIVERED.
   * Store.deliveryOtpRequired can only add the requirement, never remove it.
   * Set DELIVERY_OTP_REQUIRED=false to fall back to the per-branch flag only.
   */
  deliveryOtpRequiredDefault: process.env.DELIVERY_OTP_REQUIRED !== 'false',

  /**
   * Google Play review login for the driver app: this rider number always gets this fixed
   * 6-digit code and no SMS is sent. Off unless both PLAY_REVIEW_DRIVER_PHONE and a
   * 6-digit PLAY_REVIEW_DRIVER_OTP are set.
   */
  playReviewDriver: {
    phone: process.env.PLAY_REVIEW_DRIVER_PHONE || '',
    otp: /^\d{6}$/.test(process.env.PLAY_REVIEW_DRIVER_OTP || '') ? process.env.PLAY_REVIEW_DRIVER_OTP! : '',
  },

  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  },
};
