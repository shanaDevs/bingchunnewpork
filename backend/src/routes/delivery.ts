import { Router } from 'express';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import * as deliveryController from '../controllers/deliveryController';
import * as deliveryJobController from '../controllers/deliveryJobController';
import * as driverSelfController from '../controllers/driverSelfController';
import * as driverNotificationController from '../controllers/driverNotificationController';
import * as deliveryLocationsController from '../controllers/deliveryLocationsController';
import { deliveryProxy } from '../middleware/deliveryProxy';

const router = Router();

// Feature flag: when DELIVERY_SERVICE_ENABLED=true, every /api/delivery/* request is
// forwarded to the delivery microservice's /delivery-api/* and the legacy handlers
// below never run. Default (flag off) behaviour is unchanged.
router.use(deliveryProxy);

router.get('/me', authenticate, requireDeliveryDriver, driverSelfController.getMe);
router.get('/me/license-image', authenticate, requireDeliveryDriver, driverSelfController.getMyLicenseImage);
router.patch('/me/duty', authenticate, requireDeliveryDriver, driverSelfController.updateDuty);
router.post('/me/vehicle-fixed', authenticate, requireDeliveryDriver, driverSelfController.markMyVehicleFixed);
router.post('/me/fcm-token', authenticate, requireDeliveryDriver, driverSelfController.updateFcmToken);
router.delete('/me/fcm-token', authenticate, requireDeliveryDriver, driverSelfController.deleteFcmToken);
router.get('/me/merit-history', authenticate, requireDeliveryDriver, driverSelfController.getMeritHistory);
router.get('/me/stats', authenticate, requireDeliveryDriver, driverSelfController.getMyStats);
router.get('/me/ratings', authenticate, requireDeliveryDriver, driverSelfController.getRatings);
router.get('/me/shifts', authenticate, requireDeliveryDriver, driverSelfController.listMyShifts);
router.post('/me/complaints', authenticate, requireDeliveryDriver, driverSelfController.createComplaint);
router.get('/me/complaints', authenticate, requireDeliveryDriver, driverSelfController.listMyComplaints);
router.post('/me/branch-requests', authenticate, requireDeliveryDriver, driverSelfController.createBranchRequest);
router.get('/me/branch-requests', authenticate, requireDeliveryDriver, driverSelfController.listMyBranchRequests);
router.get('/me/notifications', authenticate, requireDeliveryDriver, driverNotificationController.listMyNotifications);
router.patch(
  '/me/notifications/:id/read',
  authenticate,
  requireDeliveryDriver,
  driverNotificationController.markNotificationRead,
);
router.post(
  '/me/notifications/read-all',
  authenticate,
  requireDeliveryDriver,
  driverNotificationController.markAllNotificationsRead,
);

router.post('/locations/batch', authenticate, requireDeliveryDriver, deliveryLocationsController.batchLocations);

router.get('/route', authenticate, requireDeliveryDriver, deliveryController.getOptimizedRoute);

router.get('/jobs', authenticate, requireDeliveryDriver, deliveryJobController.listJobs);
router.get('/jobs/active', authenticate, requireDeliveryDriver, deliveryJobController.getActiveJob);
router.get('/jobs/history', authenticate, requireDeliveryDriver, deliveryJobController.getMyJobHistory);
router.get('/jobs/:id/route', authenticate, requireDeliveryDriver, deliveryJobController.getJobRoute);
router.get('/jobs/:id/handover', authenticate, requireDeliveryDriver, deliveryJobController.getJobHandover);
router.post(
  '/jobs/:id/handover/back-on-road',
  authenticate,
  requireDeliveryDriver,
  deliveryJobController.confirmHandoverBackOnRoad,
);
router.get('/jobs/:id', authenticate, requireDeliveryDriver, deliveryJobController.getJob);
router.post('/jobs/:id/assign', authenticate, requireDeliveryDriver, deliveryJobController.assignJob);
router.post('/jobs/:id/claim', authenticate, requireDeliveryDriver, deliveryJobController.claimJob);
router.post('/jobs/:id/reject', authenticate, requireDeliveryDriver, deliveryJobController.rejectJob);
router.post('/jobs/:id/pickup', authenticate, requireDeliveryDriver, deliveryJobController.pickupJob);
router.post('/jobs/:id/start', authenticate, requireDeliveryDriver, deliveryJobController.startJob);
router.post('/jobs/:id/complete', authenticate, requireDeliveryDriver, deliveryJobController.completeJob);
// Mounted under /jobs to mirror the delivery service, whose jobs router owns
// `/vehicle-failure` — keeps the driver app on one path either side of the proxy.
router.post('/jobs/vehicle-failure', authenticate, requireDeliveryDriver, deliveryJobController.reportVehicleFailure);
router.get('/orders/:orderId', authenticate, requireDeliveryDriver, deliveryJobController.getOrder);
router.post('/orders/:orderId/otp/resend', authenticate, requireDeliveryDriver, deliveryJobController.resendOrderOtp);
router.put('/orders/:orderId/status', authenticate, requireDeliveryDriver, deliveryJobController.updateJobOrderStatus);

export default router;
