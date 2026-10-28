import { Router } from 'express';

const router = Router();

// TODO(migration): mount real routes as controllers move from backend/src/controllers:
//   messagingWebhookController, messagingAdminController -> /whatsapp, /telegram
//   customerNotificationController, adminNotificationController -> /notifications
//   fcmTokenController -> /fcm-tokens
// Until migrated, bc-core keeps serving these paths directly (DELIVERY_SERVICE_ENABLED-style
// flag recommended: NOTIFICATION_SERVICE_ENABLED, default false).

router.get('/status', (_req, res) => {
  res.json({ success: true, data: { service: 'notification', migrated: [] } });
});

export default router;
