import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const localEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../../../../backend/.env');

dotenv.config({ path: localEnv });
if (!process.env.DATABASE_URL && fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
}

export const config = {
  port: parseInt(process.env.PAYMENT_PORT || process.env.PORT || '4300', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || '',
  coreApiUrl: process.env.CORE_API_URL || 'http://localhost:4000',
  redisUrl: process.env.REDIS_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4300',
  jwtSecret: process.env.JWT_SECRET || 'bingchun-dev-secret-change-in-prod',
  payhere: {
    merchantId: process.env.PAYHERE_MERCHANT_ID || '',
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || '',
    mode: process.env.PAYHERE_MODE || 'sandbox',
  },
  webxpay: {
    merchantId: process.env.WEBXPAY_MERCHANT_ID || '',
    publicKey: process.env.WEBXPAY_PUBLIC_KEY || '',
    privateKey: process.env.WEBXPAY_PRIVATE_KEY || '',
    mode: process.env.WEBXPAY_MODE || 'sandbox',
  },
};
