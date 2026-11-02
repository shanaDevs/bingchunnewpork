'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { OrderModeSelector } from './OrderModeSelector';
import AnimatedMascot from '@/components/mascot/AnimatedMascot';
import type { MascotPose } from '@/components/mascot/mascotAnimations';
import { runDeferredOrderSetupAction } from '@/lib/postOrderSetupAction';
import type { OrderMode } from '@/store/cartStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete?: () => void;
  onSkip?: () => void;
  required?: boolean;
  initialMode?: OrderMode;
  startAtSetup?: boolean;
}

function modeToPose(mode: OrderMode): MascotPose {
  return mode === 'DELIVERY' ? 'delivery' : 'takeaway';
}

export default function OrderModeModal({
  isOpen,
  onClose,
  onSetupComplete,
  onSkip,
  required = false,
  initialMode,
  startAtSetup = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [brandHovered, setBrandHovered] = useState(false);
  const [orderMode, setOrderMode] = useState<OrderMode>(() => initialMode ?? 'DELIVERY');
  const [step, setStep] = useState<'choose' | 'setup'>(() => (startAtSetup ? 'setup' : 'choose'));

  // Setup step uses edge-to-edge map for both delivery and pickup.
  const mapStage = step === 'setup';
  const expanded = step === 'setup';

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !required) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, required]);

  const handleComplete = useCallback(() => {
    (onSetupComplete ?? onClose)();
    runDeferredOrderSetupAction();
    // Stay on the current page when order setup was triggered from an ordering flow page.
    if (
      pathname.startsWith('/cart') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/menu') ||
      pathname.startsWith('/order/') ||
      pathname.startsWith('/wishlist')
    ) {
      return;
    }
    router.push('/menu');
  }, [onSetupComplete, onClose, pathname, router]);

  const handleBackToHome = useCallback(() => {
    onClose();
    if (pathname !== '/') {
      router.push('/');
    }
  }, [onClose, pathname, router]);

  const handleBackdropClick = useCallback(() => {
    if (!required) onClose();
  }, [onClose, required]);

  const mascotPose: MascotPose = brandHovered ? 'cup-offer' : modeToPose(orderMode);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="order-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`order-mode-modal-backdrop fixed inset-0 z-[10000] flex ${
            mapStage
              ? 'order-mode-modal-backdrop--map items-stretch justify-stretch p-0'
              : 'items-center justify-center p-3 sm:p-6'
          }`}
          onClick={handleBackdropClick}
        >
          <motion.div
            key="order-modal-panel"
            layout
            initial={{ opacity: 0, scale: mapStage ? 1 : 0.94, y: mapStage ? 0 : 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: mapStage ? 1 : 0.94, y: mapStage ? 0 : 28 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={`order-mode-modal relative w-full ${
              mapStage
                ? 'order-mode-modal--map h-full max-w-none'
                : expanded
                  ? 'order-mode-modal--expanded max-w-[1500px]'
                  : 'max-w-2xl lg:max-w-3xl'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`order-mode-modal__card flex overflow-hidden ${
                mapStage
                  ? 'order-mode-modal__card--map h-full flex-col shadow-none'
                  : 'card shadow-2xl flex-col lg:flex-row'
              }`}
            >
              {!mapStage && (
                <div className="order-mode-modal__accent absolute top-0 left-0 right-0 z-10" aria-hidden />
              )}

              {!required && (
                <button
                  type="button"
                  onClick={onClose}
                  className={`order-mode-modal__close absolute z-30 w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                    mapStage ? 'top-3 right-3' : 'top-4 right-4'
                  }`}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              )}

              {!mapStage && (
                <div
                  className="order-mode-modal__brand hidden lg:flex lg:w-[200px] xl:w-[220px] shrink-0 flex-col items-center p-5 pt-8 relative"
                  onMouseEnter={() => setBrandHovered(true)}
                  onMouseLeave={() => setBrandHovered(false)}
                  onTouchStart={() => setBrandHovered(true)}
                >
                  <div className="order-mode-modal__brand-glow" aria-hidden />

                  <div className="relative z-[1] w-full flex flex-col items-center">
                    <AnimatedMascot
                      pose={mascotPose}
                      visible
                      size="md"
                      showCup={false}
                      showBubble={brandHovered}
                      className="order-mode-modal__brand-mascot"
                    />

                    <p className="text-xs font-semibold uppercase tracking-widest text-brand-light mt-3 text-center">
                      Order your way
                    </p>
                    <p className="text-[11px] text-muted mt-2 leading-relaxed text-center px-1">
                      {brandHovered
                        ? 'Stitch is ready with your cup!'
                        : 'Hover here to say hi to Stitch'}
                    </p>
                    <Sparkles size={14} className="text-accent mt-3 opacity-80" />
                  </div>
                </div>
              )}

              <div
                className={`order-mode-modal__body flex-1 min-w-0 min-h-0 ${
                  mapStage
                    ? 'order-mode-modal__body--map overflow-hidden'
                    : expanded
                      ? 'overflow-y-auto overflow-x-hidden max-h-[94vh]'
                      : 'overflow-y-auto overflow-x-hidden max-h-[min(92vh,820px)]'
                }`}
              >
                <div
                  className={
                    mapStage
                      ? 'order-mode-modal__body-inner--map h-full'
                      : 'p-5 sm:p-7 lg:p-8 pt-12 sm:pt-14 lg:pt-8'
                  }
                >
                  <OrderModeSelector
                    modalOpen={isOpen}
                    onComplete={handleComplete}
                    onBackToHome={pathname !== '/' && !pathname.startsWith('/menu') ? handleBackToHome : undefined}
                    onModeChange={setOrderMode}
                    onStepChange={setStep}
                    initialMode={initialMode}
                    startAtSetup={startAtSetup}
                  />
                </div>

                {onSkip && !mapStage && (
                  <div className="px-5 sm:px-7 lg:px-8 pb-5 sm:pb-7 lg:pb-8 -mt-2">
                    <button
                      type="button"
                      onClick={onSkip}
                      className="order-mode-modal__skip w-full text-center text-sm text-muted hover:text-brand transition-colors py-2"
                    >
                      Skip for now — you can set this later
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
