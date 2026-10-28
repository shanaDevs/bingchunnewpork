'use client';

import Link from 'next/link';
import { Check, Dices, Gift, Percent } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  CustomerLoyaltyJourney,
  CustomerLoyaltyJourneyStep,
  CustomerLoyaltyJourneyStepKey,
} from '@/lib/loyalty';

type TutorialGuide = {
  howTitle: string;
  steps: string[];
  tip: string;
};

function guideForStep(step: CustomerLoyaltyJourneyStep): TutorialGuide {
  if (step.key === 'OFFER_1') {
    return {
      howTitle: 'How to get Offer 1',
      steps: [
        'Sign in to your Bing Chun account.',
        'Place your first qualifying order from Menu.',
        'The welcome discount applies automatically at checkout — no code needed.',
      ],
      tip: step.description || 'First-order welcome discount.',
    };
  }

  if (step.key === 'OFFER_2') {
    return {
      howTitle: 'How to get Offer 2',
      steps: [
        'Complete Offer 1 with your first order.',
        'Place your second order within the come-back window.',
        'Your gift or follow-up reward is added automatically when eligible.',
      ],
      tip: step.description || 'Come back soon after your first order.',
    };
  }

  return {
    howTitle: 'How to unlock Offer 3',
    steps: [
      'Keep placing qualifying orders after Offers 1 and 2.',
      'Reach the required order count shown in your journey.',
      'Meet the minimum amount on the unlock order, then Spin & Win opens.',
    ],
    tip: step.description || 'Order enough times to unlock the spin wheel.',
  };
}

function StepGlyph({ offerKey }: { offerKey: CustomerLoyaltyJourneyStepKey }) {
  if (offerKey === 'OFFER_3') return <Dices size={18} aria-hidden />;
  if (offerKey === 'OFFER_2') return <Gift size={18} aria-hidden />;
  return <Percent size={18} aria-hidden />;
}

interface LoyaltyJourneyTutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journey: CustomerLoyaltyJourney;
  focusKey: CustomerLoyaltyJourneyStepKey;
}

export default function LoyaltyJourneyTutorialModal({
  open,
  onOpenChange,
  journey,
  focusKey,
}: LoyaltyJourneyTutorialModalProps) {
  const focusStep =
    journey.steps.find((step) => step.key === focusKey) ?? journey.steps[0] ?? null;
  if (!focusStep) return null;

  const guide = guideForStep(focusStep);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rewards-journey-tutorial sm:max-w-md"
        overlayClassName="z-[1200]"
        style={{ zIndex: 1201 }}
      >
        <DialogHeader>
          <div className="rewards-journey-tutorial__eyebrow">
            <span className="rewards-journey-tutorial__glyph">
              <StepGlyph offerKey={focusStep.key} />
            </span>
            <span>Loyalty journey tutorial</span>
          </div>
          <DialogTitle>
            Offer {focusStep.stepNumber}: {focusStep.title}
          </DialogTitle>
          <DialogDescription>
            Status: {focusStep.statusLabel}
            {focusStep.detail ? ` · ${focusStep.detail}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="rewards-journey-tutorial__body">
          <p className="rewards-journey-tutorial__tip">{guide.tip}</p>

          <h3>{guide.howTitle}</h3>
          <ol>
            {guide.steps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>

          <h3>Full path</h3>
          <ul className="rewards-journey-tutorial__path">
            {journey.steps.map((step) => {
              const isFocus = step.key === focusStep.key;
              return (
                <li
                  key={step.key}
                  className={isFocus ? 'is-focus' : undefined}
                  aria-current={isFocus ? 'step' : undefined}
                >
                  <span className="rewards-journey-tutorial__path-check" aria-hidden>
                    {step.status === 'completed' ? <Check size={14} strokeWidth={2.5} /> : step.stepNumber}
                  </span>
                  <div>
                    <strong>Offer {step.stepNumber}</strong>
                    <span>{step.title}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="rewards-journey-tutorial__footer">
          <button type="button" className="rewards-journey-tutorial__ghost" onClick={() => onOpenChange(false)}>
            Got it
          </button>
          <Link
            href="/menu"
            className="rewards-journey-tutorial__primary"
            onClick={() => onOpenChange(false)}
          >
            Order now
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
