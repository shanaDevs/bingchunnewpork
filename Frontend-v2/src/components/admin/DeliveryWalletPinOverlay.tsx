'use client';

import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';

type Props = {
  password: string;
  showPassword: boolean;
  error: string;
  submitting: boolean;
  onPasswordChange: (value: string) => void;
  onToggleShow: () => void;
  onSubmit: () => void;
  onBack: () => void;
  title?: string;
  description?: string;
};

export default function DeliveryWalletPinOverlay({
  password,
  showPassword,
  error,
  submitting,
  onPasswordChange,
  onToggleShow,
  onSubmit,
  onBack,
  title = 'Enter admin password',
  description = 'Enter your admin password to open Delivery Wallet. This is required every time you visit.',
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-3 flex items-center gap-2">
          <Lock size={20} className="text-brand" />
          <h2 className="text-lg font-bold text-fg">{title}</h2>
        </div>
        <p className="text-sm text-muted">{description}</p>
        <div className="mt-4">
          <label htmlFor="delivery-wallet-password" className="mb-1.5 block text-xs font-medium text-muted">
            Admin password
          </label>
          <div className="relative">
            <input
              id="delivery-wallet-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              className="input-field w-full pr-10 text-sm"
              placeholder="Enter your password"
              value={password}
              disabled={submitting}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit();
              }}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              onClick={onToggleShow}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="btn-outline px-4 py-2 text-sm"
            disabled={submitting}
            onClick={onBack}
          >
            Back
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            disabled={submitting || !password.trim()}
            onClick={onSubmit}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking…
              </span>
            ) : (
              'Unlock'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
