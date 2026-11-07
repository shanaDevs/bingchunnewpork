'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useConfirmStore } from '@/store/confirmStore';
import { playConfirmClickSound } from '@/lib/uiSounds';

export default function ConfirmDialog() {
  const { isOpen, options, close } = useConfirmStore();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => confirmRef.current?.focus(), 80);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [isOpen, close]);

  const variant = options?.variant ?? 'default';
  const isDanger = variant === 'danger';

  function handleConfirm() {
    playConfirmClickSound();
    close(true);
  }

  return (
    <AnimatePresence>
      {isOpen && options && (
        <motion.div
          key="confirm-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="confirm-dialog-backdrop fixed inset-0 z-[11000] flex items-center justify-center p-4 sm:p-6"
          onClick={() => close(false)}
        >
          <motion.div
            key="confirm-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="confirm-dialog card w-full max-w-md p-0 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog__accent" aria-hidden />

            <div className="p-6 sm:p-7">
              <div className="flex gap-4">
                <div
                  className={`confirm-dialog__icon shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${
                    isDanger ? 'confirm-dialog__icon--danger' : 'confirm-dialog__icon--default'
                  }`}
                >
                  {isDanger ? (
                    <AlertTriangle size={22} strokeWidth={2.25} />
                  ) : (
                    <HelpCircle size={22} strokeWidth={2.25} />
                  )}
                </div>

                <div className="min-w-0 pt-0.5">
                  <h2 id="confirm-dialog-title" className="text-lg font-bold text-fg leading-snug">
                    {options.title ?? (isDanger ? 'Are you sure?' : 'Please confirm')}
                  </h2>
                  <div id="confirm-dialog-message" className="text-muted text-sm mt-2 leading-relaxed">
                    {options.message}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 mt-7">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="btn-outline flex-1 py-3 text-sm font-semibold"
                >
                  {options.cancelLabel ?? 'Cancel'}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={handleConfirm}
                  className={`flex-1 py-3 text-sm font-semibold rounded-[var(--radius-btn)] transition-all ${
                    isDanger ? 'confirm-dialog__btn-danger' : 'btn-primary'
                  }`}
                >
                  {options.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
