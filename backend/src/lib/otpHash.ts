import crypto from 'crypto';
import { config } from '../config';

/** HMAC hash for login OTP codes stored in otp_records.code */
export function hashLoginOtp(code: string, phone: string): string {
  return crypto.createHmac('sha256', config.otpPepper).update(`${phone}:${code}`).digest('hex');
}

/** Verify OTP against stored hash (supports legacy plaintext rows during migration). */
export function verifyLoginOtp(code: string, phone: string, stored: string): boolean {
  if (/^\d{6}$/.test(stored)) {
    return stored === code;
  }
  const expected = hashLoginOtp(code, phone);
  if (stored.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(expected));
}
