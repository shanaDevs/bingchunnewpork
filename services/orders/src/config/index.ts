import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const localEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../../../backend/.env');

dotenv.config({ path: localEnv });
if (!process.env.DATABASE_URL && fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
}

export const config = {
  port: parseInt(process.env.ORDER_PORT || process.env.PORT || '4200', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || '',
  coreApiUrl: process.env.CORE_API_URL || 'http://localhost:4000',
  redisUrl: process.env.REDIS_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4200',
  jwtSecret: process.env.JWT_SECRET || 'bingchun-dev-secret-change-in-prod',
  otpPepper: process.env.DELIVERY_OTP_PEPPER || 'bingchun-otp-pepper-change-in-prod',
  otpTtlMinutes: parseInt(process.env.DELIVERY_OTP_TTL_MINUTES || '15', 10),
  deliveryOtpRequiredDefault: process.env.DELIVERY_OTP_REQUIRED !== 'false',
};
