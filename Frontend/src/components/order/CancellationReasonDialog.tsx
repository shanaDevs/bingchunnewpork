'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MessageSquare,
  RotateCcw,
  Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCancellationReasonStore } from '@/store/cancellationReasonStore';
import {
  fetchActiveCancelReasons,
  OTHER_CANCEL_REASON_VALUE,
  type CancelReasonOption,
} from '@/lib/cancellationReasons';

const REASON_ICONS: Record<string, typeof RotateCcw> = {
  CHANGED_MIND: RotateCcw,
  ORDERED_BY_MISTAKE: AlertCircle,
  TAKING_TOO_LONG: Clock,
  FOUND_CHEAPER_ELSEWHERE: Tag,
  PAYMENT_ISSUES: CreditCard,
  OTHER: MessageSquare,
};

function reasonIcon(value: string) {
  return REASON_ICONS[value] ?? MessageSquare;
}

export default function CancellationReasonDialog() {
  const { isOpen, close } = useCancellationReasonStore();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');

  const { data: reasons = [], isLoading } = useQuery({
    queryKey: ['cancel-reasons'],
    queryFn: fetchActiveCancelReasons,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelectedReason(null);
    setCustomText('');
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSubmit = () => {
    if (!selectedReason) {
      toast.error('Please select a cancellation reason');
      return;
    }
    if (selectedReason === OTHER_CANCEL_REASON_VALUE && !customText.trim()) {
      toast.error('Please tell us why you are cancelling');
      return;
    }
    close({ reason: selectedReason, customText: customText.trim() || undefined });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cancel-reason-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="confirm-dialog-backdrop fixed inset-0 z-[11000] flex items-center justify-center p-4 sm:p-6"
          onClick={() => close(null)}
        >
          <motion.div
            key="cancel-reason-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-reason-title"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="confirm-dialog card w-full max-w-md p-0 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog__accent" aria-hidden />

            <div className="p-6 sm:p-7">
              <div className="mb-4">
                <h2 id="cancel-reason-title" className="text-lg font-bold text-fg leading-snug">
                  Why are you cancelling?
                </h2>
                <p className="text-muted text-sm mt-2">Select a reason below</p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  Loading reasons...
                </div>
              ) : (
                <div className="space-y-2 max-h-[min(52vh,420px)] overflow-y-auto pr-0.5">
                  {reasons.map((reason: CancelReasonOption) => {
                    const Icon = reasonIcon(reason.value);
                    const isSelected = selectedReason === reason.value;

                    return (
                      <button
                        key={reason.value}
                        type="button"
                        onClick={() => {
                          setSelectedReason(reason.value);
                          if (reason.value !== OTHER_CANCEL_REASON_VALUE) {
                            setCustomText('');
                          }
                        }}
                        className={`order-branch-card w-full text-left transition-all ${
                          isSelected ? 'order-branch-card--selected' : ''
                        }`}
                      >
                        <div className="order-branch-card__icon">
                          <Icon size={18} className="text-brand" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-fg text-sm">{reason.label}</p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedReason === OTHER_CANCEL_REASON_VALUE && (
                <div className="mt-4">
                  <label htmlFor="custom-reason" className="block text-sm font-medium text-fg mb-2">
                    Please specify
                  </label>
                  <textarea
                    id="custom-reason"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Tell us more..."
                    className="input-field w-full resize-none min-h-[88px]"
                  />
                  <p className="text-xs text-muted mt-1">{customText.length}/500 characters</p>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => close(null)}
                  className="btn-outline flex-1 py-3 text-sm font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selectedReason || isLoading}
                  className="btn-primary flex-1 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
