'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Phone, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import DeletedAccountChoiceModal, {
  type DeletedAccountChoice,
} from '@/components/auth/DeletedAccountChoiceModal';
import { formatPhoneInput, isValidSriLankanPhone, normalizePhone } from '@/lib/phone';
import { requestCustomerOtp, type OtpIntent } from '@/lib/otpIntent';
import toast from 'react-hot-toast';
import type { User } from '@/types';
import BrandLogo from '@/components/ui/BrandLogo';

type LoginStep = 'phone' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<LoginStep>('phone');
  const [loading, setLoading] = useState(false);
  const [otpIntent, setOtpIntent] = useState<OtpIntent>('login');
  const [showDeletedChoice, setShowDeletedChoice] = useState(false);
  const verifyingRef = useRef(false);
  const lastAutoVerifiedCodeRef = useRef('');
  const otpInputRef = useRef<HTMLInputElement>(null);

  async function sendOtp(intent: OtpIntent) {
    const normalizedPhone = normalizePhone(phone);
    await requestCustomerOtp(normalizedPhone, { intent });
    setOtpIntent(intent);
    setOtpCode('');
    lastAutoVerifiedCodeRef.current = '';
    setStep('otp');
    toast.success(
      intent === 'recover'
        ? 'OTP sent — verify to recover your account'
        : intent === 'create_new'
          ? 'OTP sent — verify to create your new account'
          : 'OTP sent to your phone',
    );
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidSriLankanPhone(phone)) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      await sendOtp('login');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_DELETED') {
        setShowDeletedChoice(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletedChoice(choice: DeletedAccountChoice) {
    setShowDeletedChoice(false);
    setLoading(true);
    try {
      await sendOtp(choice === 'recover' ? 'recover' : 'create_new');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  const verifyOtp = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (code.length !== 6 || verifyingRef.current) return;

      verifyingRef.current = true;
      setLoading(true);
      try {
        const res = await api.post<{ user: User; accessExpiresAt?: number }>('/auth/otp/verify', {
          phone: normalizePhone(phone),
          code,
          intent: otpIntent === 'login' ? undefined : otpIntent,
        });
        login(res.user, { accessExpiresAt: res.accessExpiresAt });
        toast.success(
          otpIntent === 'recover'
            ? 'Welcome back — your account has been restored!'
            : otpIntent === 'create_new'
              ? 'New account created! Welcome 🧋'
              : 'Welcome back! 🧋',
        );
        router.push('/');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Invalid or expired OTP');
        setOtpCode('');
        lastAutoVerifiedCodeRef.current = '';
        // Focus after clear so the shopper can re-enter immediately.
        requestAnimationFrame(() => otpInputRef.current?.focus());
      } finally {
        verifyingRef.current = false;
        setLoading(false);
      }
    },
    [phone, otpIntent, login, router],
  );

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const code = otpCode.trim();
    if (code.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }
    await verifyOtp(code);
  }

  useEffect(() => {
    if (step !== 'otp') return;
    const code = otpCode.trim();
    if (code.length !== 6) return;
    if (loading || verifyingRef.current) return;
    if (lastAutoVerifiedCodeRef.current === code) return;

    lastAutoVerifiedCodeRef.current = code;
    void verifyOtp(code);
  }, [otpCode, step, loading, verifyOtp]);

  async function handleResendOtp() {
    setLoading(true);
    try {
      await requestCustomerOtp(normalizePhone(phone), {
        intent: otpIntent === 'login' ? undefined : otpIntent,
      });
      setOtpCode('');
      lastAutoVerifiedCodeRef.current = '';
      toast.success('OTP resent');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <DeletedAccountChoiceModal
        open={showDeletedChoice}
        phone={phone}
        onChoose={handleDeletedChoice}
        onClose={() => setShowDeletedChoice(false)}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 sm:p-8 w-full max-w-sm"
      >
        <div className="text-center mb-6 sm:mb-8">
          <div
            className="flex justify-center mb-3 select-none"
            onDoubleClick={() => router.push('/admin/login')}
            role="presentation"
          >
            <BrandLogo size={52} showText={false} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-fg">Welcome Back</h1>
          <p className="text-muted text-sm mt-1">
            {step === 'phone'
              ? "We'll text you a one-time code to sign in"
              : `Enter the 6-digit code sent to ${normalizePhone(phone)}`}
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="input-icon-wrap">
              <Phone size={15} className="input-icon" aria-hidden />
              <input
                className="input-field w-full"
                placeholder="07X XXX XXXX"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                required
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5"
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </motion.button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="input-icon-wrap">
              <ShieldCheck size={15} className="input-icon" aria-hidden />
              <input
                ref={otpInputRef}
                className="input-field w-full text-center tracking-[0.35em] font-semibold"
                placeholder="6-digit OTP"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="btn-primary w-full py-3.5"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </motion.button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={loading}
              className="btn-outline w-full py-3"
            >
              {loading ? 'Sending…' : 'Resend OTP'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtpCode('');
                lastAutoVerifiedCodeRef.current = '';
                setOtpIntent('login');
              }}
              className="text-sm text-muted hover:text-fg font-medium w-full text-center"
            >
              ← Change number
            </button>
          </form>
        )}

        {step === 'phone' && (
          <SocialLoginButtons onSuccess={() => router.push('/')} />
        )}
      </motion.div>
    </div>
  );
}
