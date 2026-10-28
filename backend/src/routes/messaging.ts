import { Router } from 'express';
import * as messagingWebhookController from '../controllers/messagingWebhookController';

const router = Router();

router.post('/telegram/webhook', messagingWebhookController.receiveTelegramWebhook);

export default router;
