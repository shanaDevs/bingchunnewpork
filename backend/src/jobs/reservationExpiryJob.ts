import cron from 'node-cron';
import { releaseExpiredReservations } from '../services/inventoryReservationService';
import { logger } from '../utils/logger';
import { logBackgroundJobDbError } from '../utils/prismaErrors';

/** Release ACTIVE reservations past expiresAt — runs every minute. */
export function startReservationExpiryJob(): void {
  cron.schedule('* * * * *', () => {
    releaseExpiredReservations().catch((err) => {
      logBackgroundJobDbError('Reservation expiry job', err);
    });
  });

  logger.info('Inventory reservation expiry cron scheduled (every minute)');
}
