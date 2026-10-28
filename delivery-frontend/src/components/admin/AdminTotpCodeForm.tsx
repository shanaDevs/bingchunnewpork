'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

type Props = {
  totpCode: string;
  onTotpCodeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  submitLabel: string;
  loadingLabel?: string;
  onBack: () => void;
  backLabel: string;
};

export function sanitizeTotpInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export default function AdminTotpCodeForm({
  totpCode,
  onTotpCodeChange,
  onSubmit,
  loading,
  submitLabel,
  loadingLabel = 'Verifying...',
  onBack,
  backLabel,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        className="input-field text-center tracking-widest font-mono text-lg"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        value={totpCode}
        onChange={(e) => onTotpCodeChange(sanitizeTotpInput(e.target.value))}
        required
        autoComplete="one-time-code"
      />
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="submit"
        disabled={loading || totpCode.length !== 6}
        className="btn-primary w-full py-3.5"
      >
        {loading ? loadingLabel : submitLabel}
      </motion.button>
      <button
        type="button"
        onClick={onBack}
        className="btn-outline w-full py-3.5 flex items-center justify-center gap-2"
      >
        <ArrowLeft size={16} />
        {backLabel}
      </button>
    </form>
  );
}
