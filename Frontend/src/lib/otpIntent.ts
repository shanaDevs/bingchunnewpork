import { api } from '@/lib/api';

export type OtpIntent = 'login' | 'recover' | 'create_new';

export async function requestCustomerOtp(
  phone: string,
  opts?: { intent?: OtpIntent; referralCode?: string },
): Promise<void> {
  await api.post<{ message: string }>('/auth/otp/request', {
    phone,
    ...(opts?.intent ? { intent: opts.intent } : {}),
    ...(opts?.referralCode ? { referralCode: opts.referralCode } : {}),
  });
}
