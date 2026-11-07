'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api';
import { isValidSriLankanPhone, normalizePhone } from '@/lib/phone';
import { requestCustomerOtp, type OtpIntent } from '@/lib/otpIntent';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type CheckoutPhoneAuthStatus =
  | 'idle'
  | 'checking'
  | 'new_account'
  | 'deleted_account'
  | 'sending_otp'
  | 'otp_sent'
  | 'verifying_otp';

interface UseCheckoutPhoneAuthOptions {
  phone: string;
  name: string;
  email: string;
  enabled: boolean;
  /** Link a real phone to an already signed-in social account. */
  mode?: 'guest' | 'link';
  onProfileFilled?: (profile: { name: string; phone: string; email?: string }) => void;
}

export function useCheckoutPhoneAuth({
  phone,
  name,
  email,
  enabled,
  mode = 'guest',
  onProfileFilled,
}: UseCheckoutPhoneAuthOptions) {
  const login = useAuthStore((s) => s.login);
  const updateUser = useAuthStore((s) => s.updateUser);

  const debouncedPhone = useDebouncedValue(phone, 400);
  const normalizedPhone = normalizePhone(debouncedPhone);
  const validPhone = isValidSriLankanPhone(debouncedPhone);

  const [status, setStatus] = useState<CheckoutPhoneAuthStatus>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [otpIntent, setOtpIntent] = useState<OtpIntent>('login');
  const checkedPhoneRef = useRef('');

  useEffect(() => {
    if (!enabled || mode === 'link') {
      if (!enabled) {
        setStatus('idle');
        checkedPhoneRef.current = '';
      }
      return;
    }

    if (!validPhone) {
      setStatus('idle');
      checkedPhoneRef.current = '';
      setOtpCode('');
      return;
    }

    if (checkedPhoneRef.current === normalizedPhone) return;

    if (checkedPhoneRef.current && checkedPhoneRef.current !== normalizedPhone) {
      setOtpCode('');
    }

    checkedPhoneRef.current = normalizedPhone;
    setStatus('new_account');
  }, [enabled, mode, validPhone, normalizedPhone]);

  const sendOtp = useCallback(async (intent: OtpIntent = otpIntent) => {
    if (!validPhone) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    const trimmedName = name.trim();
    if (mode === 'guest' && trimmedName.length < 2) {
      toast.error('Please enter your full name before sending OTP');
      return;
    }

    setStatus('sending_otp');
    try {
      if (mode === 'link') {
        await api.post<{ message: string }>('/auth/phone/link/request', { phone: normalizedPhone }, true);
      } else {
        await requestCustomerOtp(normalizedPhone, {
          intent: intent === 'login' ? undefined : intent,
        });
      }
      setOtpIntent(intent);
      setOtpCode('');
      setStatus('otp_sent');
      toast.success('OTP sent to your phone');
    } catch (err: unknown) {
      if (mode !== 'link' && err instanceof ApiError && err.code === 'ACCOUNT_DELETED') {
        setStatus('deleted_account');
        return;
      }
      setStatus(
        mode === 'link'
          ? 'idle'
          : status === 'deleted_account'
            ? 'deleted_account'
            : 'new_account',
      );
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP');
    }
  }, [validPhone, normalizedPhone, name, mode, otpIntent, status]);

  const verifyOtp = useCallback(async () => {
    if (!validPhone) return;
    const code = otpCode.trim();
    if (code.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }
    const trimmedName = name.trim();
    if (mode === 'guest' && trimmedName.length < 2) {
      toast.error('Please enter your full name');
      return;
    }

    setStatus('verifying_otp');
    try {
      if (mode === 'link') {
        const updated = await api.post<User>(
          '/auth/phone/link/verify',
          { phone: normalizedPhone, code },
          true,
        );
        updateUser(updated);
        onProfileFilled?.({
          name: updated.name,
          phone: updated.phone,
          email: updated.email ?? undefined,
        });
      } else {
        const res = await api.post<{ user: User; accessExpiresAt?: number }>('/auth/otp/verify', {
          phone: normalizedPhone,
          code,
          ...(otpIntent === 'recover' ? { intent: 'recover' } : otpIntent === 'create_new' ? { intent: 'create_new' } : {}),
          name: trimmedName,
          ...(email.trim() ? { email: email.trim() } : {}),
        });

        login(res.user, { keepCurrentCart: true, accessExpiresAt: res.accessExpiresAt });

        const profileEmail = email.trim() || undefined;
        const updated = await api.put<User>(
          '/auth/me',
          { name: trimmedName, ...(profileEmail ? { email: profileEmail } : {}) },
          true,
        );

        updateUser(updated);
        onProfileFilled?.({
          name: updated.name,
          phone: updated.phone,
          email: updated.email ?? undefined,
        });
      }

      setStatus('idle');
      toast.success('Phone verified — you can place your order');
    } catch (err: unknown) {
      setStatus('otp_sent');
      toast.error(err instanceof Error ? err.message : 'Invalid or expired OTP');
    }
  }, [validPhone, normalizedPhone, otpCode, name, email, mode, login, updateUser, onProfileFilled, otpIntent]);

  return {
    status,
    otpCode,
    setOtpCode,
    sendOtp,
    verifyOtp,
    otpIntent,
    setOtpIntent,
    showSendOtp:
      enabled &&
      validPhone &&
      (mode === 'link'
        ? status === 'idle'
        : status === 'new_account'),
    showDeletedChoice: enabled && validPhone && status === 'deleted_account',
    showOtpInput: enabled && (status === 'otp_sent' || status === 'verifying_otp'),
    isChecking: enabled && status === 'checking',
    isSendingOtp: status === 'sending_otp',
    isVerifyingOtp: status === 'verifying_otp',
  };
}
