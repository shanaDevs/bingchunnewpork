'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, UserPlus, UserX } from 'lucide-react';
import { normalizePhone } from '@/lib/phone';

export type DeletedAccountChoice = 'recover' | 'create_new';

type Props = {
  open: boolean;
  phone: string;
  onChoose: (choice: DeletedAccountChoice) => void;
  onClose: () => void;
};

export default function DeletedAccountChoiceModal({ open, phone, onChoose, onClose }: Props) {
  const displayPhone = phone ? normalizePhone(phone) : '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/55 p-4"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleted-account-choice-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="card w-full max-w-md p-6 sm:p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
                <UserX size={22} strokeWidth={2.25} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="deleted-account-choice-title" className="text-lg font-bold text-fg">
                  Account previously deleted
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  <span className="font-semibold text-fg">{displayPhone}</span> was linked to a deleted
                  account. Recover your old profile and history, or start fresh with a new account.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={() => onChoose('recover')}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3.5"
              >
                <RotateCcw size={16} aria-hidden />
                Recover my account
              </button>
              <button
                type="button"
                onClick={() => onChoose('create_new')}
                className="btn-outline flex w-full items-center justify-center gap-2 py-3.5"
              >
                <UserPlus size={16} aria-hidden />
                Create new account
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm font-medium text-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted">
              Creating a new account keeps your old orders and rewards archived. You will not see
              duplicate deleted profiles.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
