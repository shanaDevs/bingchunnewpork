import 'dotenv/config';
import { configureAppTimezone } from './lib/datetime';
configureAppTimezone();
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { generalRateLimiter, getRateLimitStoreKind, initRateLimitStore } from './middleware/rateLimiter';
import { getSocketAdapterMode } from './lib/socket';
import { WEBXPAY_FORM_ACTIONS } from './lib/webxpayPayment';
import { isCorsAllowedOrigin } from './lib/resolveFrontendUrl';
import { errorHandler, notFound } from './middleware/errorHandler';
import { createApiRouter } from './routes/surfaces';
import { connectDb, disconnectDb } from './lib/prisma';
import { initSocket, closeSocket } from './lib/socket';
import { ensureStoreInventoryReady } from './lib/storeInventory';
import { ensureOrderDeliveryColumns } from './lib/orderSchema';
import { ensureMessagingSchema } from './lib/messagingSchema';
import { ensureWhatsAppSettingsColumns } from './lib/messagingSettings';
import { ensureSmsSettingsColumns } from './lib/smsSettings';
import { ensureStoreOrderingHoursColumns } from './lib/storeOrderingSchema';
import { ensureTakeawayQueueColumns, processPickupReminders, renumberTodayTokens } from './lib/takeawayQueue';
import { logBackgroundJobDbError } from './utils/prismaErrors';
import { ensurePaymentSettingsTables } from './lib/paymentSettings';
import {
  ensureAdminRoles,
  ensureAdminTokenVersionColumn,
  ensureDeliveryDriverRole,
  ensureDriverPinColumn,
} from './lib/adminSchema';
import {
  ensureDeliveryJobsTables,
  ensureDeliveryOutboxSchema,
  ensureDriverLocationsSchema,
  ensureDriverComplaintsSchema,
  ensureDriverBranchRequestsSchema,
  ensureRiderRatingsSchema,
} from './lib/deliverySchema';
import { ensureDeliveryPayoutSchema } from './lib/deliveryPayoutSchema';
import { ensureDriverProfileSchema } from './lib/driverProfileSchema';
import { ensureAdminUserAccessibleStoresTable } from './lib/adminUserStoresSchema';
import { ensureWalletSettlementColumns } from './lib/walletSchema';
import { ensureAdminMoneyDecimalColumns } from './lib/moneyDecimalSchema';
import { ensureWithdrawalSchema } from './lib/withdrawalSchema';
import { ensureCommissionSettlementTable } from './lib/settlementSchema';
import { ensureAppSchema } from './lib/appSchema';
import { ensureProductRatingsTables } from './lib/productRatingsSchema';
import { ensureInventoryReservationSchema } from './lib/inventoryReservationSchema';
import { ensureProductCostColumn, ensureProductImageUrlsColumn } from './lib/productSchema';
import { ensureBatchStockSchema } from './lib/batchStockSchema';
import { ensurePlatformPaybackSchema } from './lib/platformPaybackSchema';
import { ensureJasonLedgerSchema } from './lib/jasonLedgerSchema';
import { ensureCustomerProfileSchema } from './lib/customerProfileSchema';
import { ensureWalletSecurityAuditLogTable } from './lib/walletSecurityAuditSchema';
import { startReservationExpiryJob } from './jobs/reservationExpiryJob';
import { startGpsRetentionJob } from './jobs/gpsRetentionJob';
import {
  startIntegrationStreamConsumer,
  stopIntegrationStreamConsumer,
} from './jobs/integrationStreamConsumer';
import { config } from './config';
import { logger } from './utils/logger';
import { assertProductionRuntimeConfig, assertProductionSecrets } from './lib/productionSecrets';

const app = express();
const server = http.createServer(app);

// CapRover/nginx sit in front in production; required for express-rate-limit IP detection.
if (process.env.TRUST_PROXY !== undefined) {
  const raw = process.env.TRUST_PROXY.trim().toLowerCase();
  app.set('trust proxy', raw === 'true' ? true : raw === 'false' ? false : Number(raw) || 1);
} else if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security (allow PayHere + WebXPay checkout form POST + inline script on payment redirect page)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'", 'https://sandbox.payhere.lk', 'https://www.payhere.lk', ...WEBXPAY_FORM_ACTIONS],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        ...(config.nodeEnv !== 'production' ? { upgradeInsecureRequests: null } : {}),
      },
    },
  })
);
app.use(cors({
  origin: (origin, callback) => {
    callback(null, isCorsAllowedOrigin(origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());

// Rate limiting
app.use(generalRateLimiter);

// Health check — `/` as well so opening the API host in a browser is not a 404
app.get(['/', '/health'], (_req, res) =>
  res.json({
    status: 'ok',
    surface: config.apiSurface,
    timestamp: new Date().toISOString(),
    rateLimitStore: getRateLimitStoreKind(),
    socketAdapter: getSocketAdapterMode(),
    backgroundJobs: config.runBackgroundJobs,
    // Bumped when CORS allowlist for admin-web/pos-web ships — safe to remove later.
    buildTag: 'cors-surface-web-2026-10-26',
  }),
);

// Static assets (mascots, product photos for mobile + web)
const publicDir = path.join(__dirname, '..', 'public');
app.use('/mascots', express.static(path.join(publicDir, 'mascots')));

function resolveProductImagesDir(): string | null {
  const candidates = [
    path.join(publicDir, 'products'),
    path.join(__dirname, '..', '..', 'frontend', 'public', 'products'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

const productImagesDir = resolveProductImagesDir();
if (productImagesDir) {
  app.use('/products', express.static(productImagesDir));
  logger.info(`Serving product images from ${productImagesDir}`);
} else if (config.doSpaces.key && config.doSpaces.bucket) {
  logger.info('Product images are served from DigitalOcean Spaces (no local /products directory)');
} else {
  logger.warn('Product images directory not found — /products will 404');
}

const settlementsDir = path.join(publicDir, 'settlements');
if (!fs.existsSync(settlementsDir)) {
  fs.mkdirSync(settlementsDir, { recursive: true });
}

const invoicesDir = path.join(publicDir, 'invoices');
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

// API routes. core mounts everything; shop, pos, and admin mount an allowlist.
app.use('/api', createApiRouter(config.apiSurface));

// 404 & error handling
app.use(notFound);
app.use(errorHandler);

// Socket.io — initialised during server start (async Redis adapter).
let socketReady: Promise<unknown> | null = null;
let pickupInterval: ReturnType<typeof setInterval> | null = null;

function ensureSocketInit(): Promise<unknown> {
  if (!socketReady) {
    socketReady = initSocket(server);
  }
  return socketReady;
}

// Start
function assertRoleSurfaceRuntime(): void {
  if (config.apiSurface === 'core') return;
  if (process.env.COOKIE_DOMAIN?.trim()) {
    throw new Error('COOKIE_DOMAIN must be unset on shop, pos, and admin so staff cookies stay on their own host');
  }
  if (config.nodeEnv === 'production' && !config.redisUrl.trim()) {
    throw new Error('REDIS_URL is required when API_SURFACE is shop, pos, or admin');
  }
}

async function start() {
  assertProductionSecrets();
  assertRoleSurfaceRuntime();
  await initRateLimitStore({ requireRedis: config.apiSurface !== 'core' && config.nodeEnv === 'production' });
  await connectDb();
  await assertProductionRuntimeConfig();

  // Only core runs DDL/seed patches. Shop/admin/pos/delivery used to run the same
  // suite when RUN_BACKGROUND_JOBS=true and deadlocked each other on promo_codes /
  // permissions during CapRover rolling deploys (pool timeout → nginx 502).
  const runSchemaPatches = config.apiSurface === 'core' && config.runtimeSchemaPatches;

  if (runSchemaPatches) {
    const { prisma } = await import('./lib/prisma');
    const lockRows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT pg_try_advisory_lock(872314002) AS ok`,
    );
    const gotLock = Boolean(lockRows[0]?.ok);
    if (!gotLock) {
      logger.info('Runtime schema patches skipped (another core instance holds the advisory lock)');
    } else {
      logger.info('Running runtime schema patches…');
      const { withSchemaPatchRetry } = await import('./lib/schemaPatch');
      const runPatch = (name: string, fn: () => Promise<void>) => withSchemaPatchRetry(name, fn);

      try {
    await runPatch('storeInventory', ensureStoreInventoryReady);
    await runPatch('batchStock', ensureBatchStockSchema);
    await runPatch('orderDelivery', ensureOrderDeliveryColumns);
    await runPatch('takeawayQueue', ensureTakeawayQueueColumns);
    await runPatch('paymentSettings', ensurePaymentSettingsTables);
    await runPatch('deliveryDriverRole', ensureDeliveryDriverRole);
    await runPatch('driverPin', ensureDriverPinColumn);
    await runPatch('adminTokenVersion', ensureAdminTokenVersionColumn);
    await runPatch('adminRoles', ensureAdminRoles);
    await runPatch('deliveryJobs', ensureDeliveryJobsTables);
    await runPatch('driverLocations', ensureDriverLocationsSchema);
    await runPatch('deliveryOutbox', ensureDeliveryOutboxSchema);
    await runPatch('deliveryPayouts', ensureDeliveryPayoutSchema);
    await runPatch('driverComplaints', ensureDriverComplaintsSchema);
    await runPatch('driverBranchRequests', ensureDriverBranchRequestsSchema);
    await runPatch('riderRatings', ensureRiderRatingsSchema);
    await runPatch('driverProfile', ensureDriverProfileSchema);
    await runPatch('adminUserAccessibleStores', ensureAdminUserAccessibleStoresTable);
    await runPatch('walletSettlement', ensureWalletSettlementColumns);
    await runPatch('withdrawal', ensureWithdrawalSchema);
    await runPatch('platformPayback', ensurePlatformPaybackSchema);
    await runPatch('commissionSettlement', ensureCommissionSettlementTable);
    await runPatch('appSchema', ensureAppSchema);
    await runPatch('productRatings', ensureProductRatingsTables);
    await runPatch('inventoryReservation', ensureInventoryReservationSchema);
    await runPatch('productCost', ensureProductCostColumn);
    await runPatch('productImageUrls', ensureProductImageUrlsColumn);
    await runPatch('messaging', ensureMessagingSchema);
    await runPatch('whatsAppSettings', ensureWhatsAppSettingsColumns);
    await runPatch('smsSettings', ensureSmsSettingsColumns);
    await runPatch('storeOrderingHours', ensureStoreOrderingHoursColumns);
    await runPatch('jasonLedger', ensureJasonLedgerSchema);
    await runPatch('customerProfile', ensureCustomerProfileSchema);
    await runPatch('walletSecurityAudit', ensureWalletSecurityAuditLogTable);
    await runPatch('adminMoneyDecimal', ensureAdminMoneyDecimalColumns);
    logger.info('Runtime schema patches completed');
    } finally {
      await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(872314002)`).catch(() => undefined);
    }
    }
  } else {
    logger.info(
      config.apiSurface === 'core'
        ? 'Runtime schema patches skipped (RUNTIME_SCHEMA_PATCHES=false)'
        : `Runtime schema patches skipped on API_SURFACE=${config.apiSurface || 'default'} (core-only)`,
    );
  }

  await renumberTodayTokens();
  await ensureSocketInit();
  if (config.apiSurface !== 'core' && config.nodeEnv === 'production' && getSocketAdapterMode() !== 'redis') {
    throw new Error('Socket.io Redis adapter is required when API_SURFACE is shop, pos, or admin');
  }

  if (config.runBackgroundJobs) {
    pickupInterval = setInterval(() => {
      processPickupReminders().catch((err) => logBackgroundJobDbError('Pickup reminder job', err));
    }, 60_000);

    startReservationExpiryJob();
    startGpsRetentionJob();
    startIntegrationStreamConsumer();
    logger.info('Background jobs started on this replica');
  } else {
    logger.info('Background jobs skipped (RUN_BACKGROUND_JOBS=false)');
  }

  function lanIpv4(): string | null {
    const addresses: string[] = [];
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
      }
    }
    return addresses.find((ip) => ip.startsWith('192.168.')) ?? addresses[0] ?? null;
  }

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Bing Chun API running on http://localhost:${config.port}`);
    const lan = lanIpv4();
    logger.info(
      lan
        ? `Local network: http://${lan}:${config.port}`
        : 'Local network: no LAN IPv4 address found',
    );
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`API surface: ${config.apiSurface}`);

  });
}

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);
  stopIntegrationStreamConsumer();
  if (pickupInterval) clearInterval(pickupInterval);
  server.close(async () => {
    await closeSocket().catch((err) => logger.warn('Socket shutdown failed', err));
    await disconnectDb().catch((err) => logger.warn('Database disconnect failed', err));
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', err);
  shutdown('uncaughtException');
});

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
