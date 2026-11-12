'use client';

import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { verifyWalletPin } from '@/lib/verifyWalletPin';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after the PIN passes the pre-check. Receives the trimmed password. */
  onVerified: (pin: string) => void | Promise<void>;
  description: string;
  apiBase: string;
  /** When true, stacks above full-screen delivery modals (z-10000) and below confirm (z-11000). */
  elevated?: boolean;
  /** Parent action in progress — disables inputs and dismiss. */
  busy?: boolean;
  titleId?: string;
  inputId?: string;
};

export default function AdminPinGateModal({
  open,
  onClose,
  onVerified,
  description,
  apiBase,
  elevated = false,
  busy = false,
  titleId,
  inputId,
}: Props) {
  const reactId = useId();
  const resolvedTitleId = titleId ?? `admin-pin-gate-title-${reactId}`;
  const resolvedInputId = inputId ?? `admin-pin-gate-input-${reactId}`;

  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const locked = verifying || busy;

  useEffect(() => {
    if (!open) {
      setPin('');
      setShowPin(false);
      setPinError('');
      setVerifying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || locked) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, locked, onClose]);

  const handleVerify = async () => {
    const value = pin.trim();
    if (!value) {
      setPinError('Enter your PIN to continue');
      return;
    }
    if (locked) return;

    setVerifying(true);
    setPinError('');
    try {
      await verifyWalletPin(apiBase, value);
      onClose();
      await onVerified(value);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid PIN');
    } finally {
      setVerifying(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm',
          elevated ? 'z-[10500]' : 'z-[1300]',
        )}
        onClick={() => !locked && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={resolvedTitleId}
        className={cn(
          'fixed inset-0 flex items-center justify-center p-4',
          elevated ? 'z-[10501]' : 'z-[1301]',
        )}
        onClick={() => !locked && onClose()}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center gap-2">
            <Lock size={20} className="text-[#2563eb]" />
            <h3
              id={resolvedTitleId}
              className="text-lg font-bold text-[#1e293b] dark:text-slate-100"
            >
              Enter PIN
            </h3>
          </div>
          <p className="text-sm text-[#64748b] dark:text-slate-400">{description}</p>
          <div className="mt-4">
            <label
              htmlFor={resolvedInputId}
              className="mb-1.5 block text-xs font-medium text-[#64748b] dark:text-slate-400"
            >
              Admin password
            </label>
            <div className="relative">
              <input
                id={resolvedInputId}
                type={showPin ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                className="w-full rounded-lg border border-[#cbd5e1] bg-white px-3 py-2.5 pr-10 text-sm text-[#1e293b] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Enter your password"
                value={pin}
                disabled={locked}
                onChange={(e) => {
                  setPin(e.target.value);
                  setPinError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleVerify();
                  }
                }}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#1e293b] dark:hover:text-slate-200"
                onClick={() => setShowPin((value) => !value)}
                aria-label={showPin ? 'Hide password' : 'Show password'}
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pinError && (
              <p className="mt-2 text-xs text-red-500" role="alert">
                {pinError}
              </p>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm font-semibold text-[#1e293b] hover:bg-[#f8fafc] disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              disabled={locked}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
              disabled={locked || !pin.trim()}
              onClick={() => void handleVerify()}
            >
              {verifying ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Verifying…
                </span>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
