import { expect, vi } from 'vitest';
import { hashLoginOtp } from '../../src/lib/otpHash';
import { findUserByPhone } from '../../src/lib/userAccount';
import { prisma } from '../../src/lib/prisma';

/** Shared prisma/user stubs for a successful OTP verify (or deprecated phone login). */
export function stubSuccessfulCustomerOtpVerify(phone = '0771234567', code = '123456') {
  vi.mocked(findUserByPhone).mockResolvedValue({
    id: 'user-1',
    name: 'Guest',
    phone,
    email: null,
    deletedAt: null,
  } as never);
  vi.mocked(prisma.otpRecord.findFirst).mockResolvedValue({
    id: 'otp-1',
    code: hashLoginOtp(code, phone),
  } as never);
  vi.mocked(prisma.otpRecord.update).mockResolvedValue({ id: 'otp-1' } as never);
  vi.mocked(prisma.user.update).mockResolvedValue({
    id: 'user-1',
    name: 'Guest',
    phone,
    email: null,
    deletedAt: null,
    isPhoneVerified: true,
  } as never);
}

/** Call from inside an `it()` block so vitest `expect` is available. */
export function expectedBearerOtpAuthJson() {
  return {
    success: true,
    data: {
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: expect.objectContaining({
        id: 'user-1',
        name: 'Guest',
        phone: '0771234567',
        isDeleted: false,
      }),
    },
  };
}
