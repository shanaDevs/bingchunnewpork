import { config } from './config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { shouldSkipRateLimit } from './middleware/loadTestBypass';
import { connectDb, disconnectDb } from '@bingchun/db';
import { logger } from './utils/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import routes from './routes';
import { initDeliverySocket } from './sockets';
import { startOutboxWorker, stopOutboxWorker } from './jobs/outboxWorker';
import { ensureDeliveryBootSchema } from './lib/deliveryBootSchema';
import { startRetentionJob, stopRetentionJob } from './jobs/retentionJob';
import {
  startCoreIntegrationConsumer,
  stopCoreIntegrationConsumer,
} from './jobs/coreIntegrationConsumer';
import { assertProductionSecrets } from './lib/productionSecrets';
import { isReady, runReadinessChecks } from './lib/readiness';

const app = express();
const server = http.createServer(app);

// CapRover/nginx sit in front in production; required for express-rate-limit IP detection.
if (process.env.TRUST_PROXY !== undefined) {
  const raw = process.env.TRUST_PROXY.trim().toLowerCase();
  app.set('trust proxy', raw === 'true' ? true : raw === 'false' ? false : Number(raw) || 1);
} else if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
} else {
  // Next.js /delivery-api proxy forwards X-Forwarded-For in local dev.
  app.set('trust proxy', 1);
}

const deliveryFrontendOrigin =
  process.env.DELIVERY_FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3100';

const corsAllowlist = Array.from(
  new Set(
    [
      config.frontendUrl,
      config.adminUrl,
      deliveryFrontendOrigin,
      process.env.LIVE_SHOP_URL,
      ...(process.env.CORS_EXTRA_ORIGINS || '').split(','),
      'https://bingchunsrilanka.com',
      'https://www.bingchunsrilanka.com',
      'https://bing-chun.bc.dartcodes.com',
      'https://bing-chun-admin-web.bc.dartcodes.com',
      'https://bing-chun-pos-web.bc.dartcodes.com',
      'https://bing-chun-delivery-frontend.bc.dartcodes.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3100',
    ]
      .map((value) => (value || '').trim().replace(/\/$/, ''))
      .filter(Boolean),
  ),
);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || corsAllowlist.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipRateLimit,
  })
);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'delivery', timestamp: new Date().toISOString() })
);

app.get('/ready', async (_req, res) => {
  const checks = await runReadinessChecks();
  const ready = isReady(checks);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    service: 'delivery',
    checks,
    timestamp: new Date().toISOString(),
  });
});

app.use('/delivery-api', routes);

app.use(notFound);
app.use(errorHandler);

// Socket.IO — namespace `/delivery`, JWT handshake auth (ADR 0004)
initDeliverySocket(server);

async function start() {
  assertProductionSecrets(config.nodeEnv, {
    jwtSecret: config.jwtSecret,
    jwtRefreshSecret: config.jwtRefreshSecret,
    internalServiceSecret: config.internalServiceSecret,
    otpPepper: config.otpPepper,
    databaseUrl: config.databaseUrl,
  });
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Copy delivery-service/env.example to delivery-service/.env (or set DELIVERY_LOAD_BACKEND_ENV=true in development only).',
    );
  }
  await connectDb();
  await ensureDeliveryBootSchema();

  if (process.env.RUN_BACKGROUND_JOBS !== 'false') {
    startOutboxWorker();
    startRetentionJob();
    startCoreIntegrationConsumer();
    logger.info('Delivery background jobs started on this replica');
  } else {
    logger.info('Delivery background jobs skipped (RUN_BACKGROUND_JOBS=false)');
  }

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Delivery service listening on 0.0.0.0:${config.port}`);
  });
}

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down`);
  stopOutboxWorker();
  stopRetentionJob();
  stopCoreIntegrationConsumer();
  server.close(async () => {
    await disconnectDb().catch((err) => logger.warn('Database disconnect failed', err));
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
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
  logger.error('Failed to start delivery service', err);
  process.exit(1);
});
