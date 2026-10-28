import { Request, Response, NextFunction } from 'express';
import { success } from '../utils/apiResponse';
import { handleDriverLocation } from '../sockets';
import { locationBatchSchema } from '../schemas/locationBatch';

/** Offline flush — mobile app buffers points while unreachable and replays them here. */
export async function batchLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const storeId = req.user!.storeId;
    const locations = locationBatchSchema.parse(req.body);

    const ordered = [...locations].sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''));
    for (const loc of ordered) {
      await handleDriverLocation(driverId, storeId, loc);
    }

    return success(res, { recorded: locations.length });
  } catch (err) {
    next(err);
  }
}
