import { config } from './config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { connectDb, disconnectDb } from '@bingchun/db';
import { logger } from './utils/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import routes from './routes';
import { buildMicroserviceCorsAllowlist, isCorsOriginAllowed } from '@bingchun/cors';

const app = express();
const server = http.createServer(app);

if (process.env.TRUST_PROXY !== undefined) {
  const raw = process.env.TRUST_PROXY.trim().toLowerCase();
  app.set('trust proxy', raw === 'true' ? true : raw === 'false' ? false : Number(raw) || 1);
} else if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// PayHere/WebXPay checkout redirects post a form back — CSP must allow their form actions once
// the checkout return pages are migrated here (mirrors backend/src/index.ts helmet config).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://sandbox.payhere.lk', 'https://www.payhere.lk'],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      },
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin, buildMicroserviceCorsAllowlist(config), config.nodeEnv));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'payment', timestamp: new Date().toISOString() })
);

app.use('/payment-api', routes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDb();
  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Payment service listening on 0.0.0.0:${config.port}`);
  });
}

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await disconnectDb().catch((err) => logger.warn('Database disconnect failed', err));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', err);
  shutdown('uncaughtException');
});

start().catch((err) => {
  logger.error('Failed to start payment service', err);
  process.exit(1);
});
