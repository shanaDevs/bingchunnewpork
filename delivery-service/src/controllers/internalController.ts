import { Request, Response, NextFunction } from 'express';
import { success } from '../utils/apiResponse';
import { getLiveTrackingForOrder } from '../lib/liveTracking';

/** Core backend calls this when DELIVERY_TRACKING_VIA_SERVICE=true. */
export async function getOrderTrackingInternal(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = req.params.orderId as string;
    const tracking = await getLiveTrackingForOrder(orderId);
    return success(res, tracking);
  } catch (err) {
    next(err);
  }
}
