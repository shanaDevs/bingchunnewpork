import { config } from '../config';
import { logger } from '../utils/logger';
import { deleteExpiredDriverLocations } from '@bingchun/delivery-domain';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runRetentionOnce(): Promise<void> {
  try {
    const deleted = await deleteExpiredDriverLocations(config.gpsRetentionDays);
    if (deleted > 0) {
      logger.info(`GPS retention: deleted ${deleted} driver_locations row(s) older than ${config.gpsRetentionDays}d`);
    }
  } catch (err) {
    logger.error('GPS retention job failed', err);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startRetentionJob(): void {
  if (timer) return;
  runRetentionOnce().catch(() => {});
  timer = setInterval(() => {
    runRetentionOnce().catch(() => {});
  }, DAY_MS);
  logger.info(`GPS retention job started (daily, retention=${config.gpsRetentionDays}d)`);
}

export function stopRetentionJob(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
