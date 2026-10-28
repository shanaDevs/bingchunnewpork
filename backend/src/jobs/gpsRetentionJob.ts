import { deleteExpiredDriverLocations } from '@bingchun/delivery-domain';
import { config } from '../config';
import { logger } from '../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runGpsRetentionOnce(): Promise<void> {
  try {
    const deleted = await deleteExpiredDriverLocations(config.gpsRetentionDays);
    if (deleted > 0) {
      logger.info(
        `GPS retention: deleted ${deleted} driver_locations row(s) older than ${config.gpsRetentionDays}d`,
      );
    }
  } catch (err) {
    logger.error('GPS retention job failed', err);
  }
}

let timer: NodeJS.Timeout | null = null;

/** Purge raw GPS points older than GPS_RETENTION_DAYS — runs daily. */
export function startGpsRetentionJob(): void {
  if (timer) return;
  runGpsRetentionOnce().catch(() => {});
  timer = setInterval(() => {
    runGpsRetentionOnce().catch(() => {});
  }, DAY_MS);
  logger.info(`GPS retention job started (daily, retention=${config.gpsRetentionDays}d)`);
}

export function stopGpsRetentionJob(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
