import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const localEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../../../backend/.env');

dotenv.config({ path: localEnv });
// Share DATABASE_URL / secrets with core when no services/notification/.env exists yet.
if (!process.env.DATABASE_URL && fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
}

export const config = {
  port: parseInt(process.env.NOTIFY_PORT || process.env.PORT || '4400', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || '',
  coreApiUrl: process.env.CORE_API_URL || 'http://localhost:4000',
  redisUrl: process.env.REDIS_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4400',
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  },
  sms: {
    provider: process.env.SMS_PROVIDER || 'mock',
    baseUrl: process.env.SMSLENZ_BASE_URL || 'https://smslenz.lk',
    userId: process.env.SMSLENZ_USER_ID || '',
    apiKey: process.env.SMSLENZ_API_KEY || '',
    senderId: process.env.SMSLENZ_SENDER_ID || 'BingChun',
  },
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
};
