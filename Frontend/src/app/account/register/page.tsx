'use client';
import { useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Phone, ShieldCheck, User } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import DeletedAccountChoiceModal, {
  type DeletedAccountChoice,
} from '@/components/auth/DeletedAccountChoiceModal';
import { formatPhoneInput, isValidSriLankanPhone, normalizePhone } from '@/lib/phone';
import { requestCustomerOtp, type OtpIntent } from '@/lib/otpIntent';
import toast from 'react-hot-toast';
import type { User as UserType } from '@/types';
import BrandLogo from '@/components/ui/BrandLogo';

type RegisterStep = 'details' | 'otp';

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = (searchParams.get('ref') || '').trim().toUpperCase() || undefined;
  const { login, updateUser } = useAuthStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<RegisterStep>('details');
  const [loading, setLoading] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const [otpIntent, setOtpIntent] = useState<OtpIntent>('login');
  const [showDeletedChoice, setShowDeletedChoice] = useState(false);

  async function sendOtp(intent: OtpIntent) {
    const normalizedPhone = normalizePhone(phone);
    await requestCustomerOtp(normalizedPhone, {
      intent,
      referralCode,
    });
    setOtpIntent(intent);
    setOtpCode('');
    setStep('otp');
    toast.success(
      intent === 'recover'
        ? 'OTP sent — verify to recover your account'
        : 'OTP sent — verify to create your new account',
    );
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      toast.error('Please enter your full name');
      return;
    }
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

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const code = otpCode.trim();
    if (code.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const normalizedPhone = normalizePhone(phone);
      const profileEmail = email.trim() || undefined;
      const res = await api.post<{ user: UserType; accessExpiresAt?: number }>('/auth/otp/verify', {
        phone: normalizedPhone,
        code,
        ...(otpIntent === 'recover' ? { intent: 'recover' } : otpIntent === 'create_new' ? { intent: 'create_new' } : {}),
        name: name.trim(),
        ...(profileEmail ? { email: profileEmail } : {}),
        ...(referralCode ? { referralCode } : {}),
      });

      login(res.user, { accessExpiresAt: res.accessExpiresAt });

      if (otpIntent === 'recover') {
        toast.success('Welcome back — your account has been restored!');
        router.push('/account');
        return;
      }

      const updated = await api.put<UserType>(
        '/auth/me',
        {
          name: name.trim(),
          ...(profileEmail ? { email: profileEmail } : {}),
          ...(referralCode ? { referralCode } : {}),
        },
        true,
      );
      updateUser(updated);

      toast.success('Account created! Welcome 🧋');
      router.push('/account');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid or expired OTP');
      setOtpCode('');
      requestAnimationFrame(() => otpInputRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setLoading(true);
    try {
      await requestCustomerOtp(normalizePhone(phone), {
        intent: otpIntent === 'login' ? undefined : otpIntent,
        referralCode,
      });
      setOtpCode('');
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
          <div className="flex justify-center mb-3">
            <BrandLogo size={52} showText={false} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-fg">Create Account</h1>
          <p className="text-muted text-sm mt-1">
            {step === 'details'
              ? referralCode
                ? 'You were invited — create an account to unlock referral offers'
                : 'Join Bing Chun for exclusive rewards'
              : `Enter the 6-digit code sent to ${normalizePhone(phone)}`}
          </p>
        </div>

        {step === 'details' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="input-icon-wrap">
              <User size={15} className="input-icon" aria-hidden />
              <input
                className="input-field w-full"
                placeholder="Full Name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>
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
            <input
              className="input-field w-full"
              type="email"
              placeholder="Email (optional)"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

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
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="btn-primary w-full py-3.5"
            >
              {loading ? 'Creating account...' : 'Verify & Create Account'}
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
                setStep('details');
                setOtpCode('');
                setOtpIntent('login');
              }}
              className="text-sm text-muted hover:text-fg font-medium w-full text-center"
            >
              ← Back
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted mt-6">
          Already have an account?{' '}
          <Link href="/account/login" className="text-brand hover:text-brand-light font-medium">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4">
          <p className="text-muted text-sm">Loading…</p>
        </div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
