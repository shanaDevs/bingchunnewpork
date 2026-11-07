'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  Crown,
  Dices,
  Gem,
  Gift,
  History,
  LockKeyhole,
  Percent,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  LOYALTY_TIERS,
  formatLoyaltyEarnRate,
  formatLoyaltySpend,
  getLoyaltyTier,
  isCheckoutRedeemUnlocked,
  normalizeLoyaltySettings,
  type CustomerLoyaltyJourneyStep,
  type CustomerLoyaltyJourneyStepKey,
  type LoyaltySummary,
  type LoyaltyTier,
} from '@/lib/loyalty';
import { fetchSpinEligibility, SPIN_ELIGIBILITY_QUERY_KEY } from '@/lib/spinEligibility';
import { useSpinStore } from '@/store/spinStore';
import LoyaltyJourneyTutorialModal from '@/components/loyalty/LoyaltyJourneyTutorialModal';

type TierTone = 'bronze' | 'silver' | 'gold' | 'neutral';

interface RewardsDashboardProps {
  data: LoyaltySummary;
  isRefreshing?: boolean;
  isStale?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}

const reveal = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function tierTone(index: number, hasTierData: boolean): TierTone {
  if (!hasTierData) return 'neutral';
  if (index <= 0) return 'bronze';
  if (index === 1) return 'silver';
  return 'gold';
}

function TierEmblem({ tone }: { tone: TierTone }) {
  const Icon = tone === 'gold' ? Crown : tone === 'silver' ? Gem : Star;
  return (
    <div className="rewards-page__emblem" aria-hidden>
      <span className="rewards-page__emblem-ring" />
      <Icon className="rewards-page__emblem-icon" strokeWidth={1.7} />
      <span className="rewards-page__emblem-shine" />
    </div>
  );
}

function JourneyStepIcon({ step }: { step: CustomerLoyaltyJourneyStep }) {
  if (step.status === 'completed') return <Check strokeWidth={2.4} />;
  if (step.status === 'locked' || step.status === 'disabled') return <LockKeyhole strokeWidth={2} />;
  if (step.key === 'OFFER_3') return <Dices strokeWidth={2} />;
  if (step.key === 'OFFER_2') return <Gift strokeWidth={2} />;
  return <Percent strokeWidth={2} />;
}

function normaliseTiers(data: LoyaltySummary): LoyaltyTier[] {
  const source = data.tiers ?? LOYALTY_TIERS;
  return source
    .filter(
      (tier) =>
        Boolean(tier?.id) &&
        Boolean(tier?.name) &&
        Number.isFinite(tier?.minSpendLkr) &&
        tier.minSpendLkr >= 0,
    )
    .slice()
    .sort((a, b) => a.minSpendLkr - b.minSpendLkr);
}

export default function RewardsDashboard({
  data,
  isRefreshing = false,
  isStale = false,
  updatedAt,
  onRefresh,
}: RewardsDashboardProps) {
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialOfferKey, setTutorialOfferKey] = useState<CustomerLoyaltyJourneyStepKey>('OFFER_1');
  const { data: spinEligibility } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, 'auth', 'loyalty-page'],
    queryFn: () => fetchSpinEligibility(true),
    staleTime: 30_000,
  });
  const points = Math.floor(safeNumber(data.points));
  const totalSpendLkr = safeNumber(data.totalSpendLkr);
  const settings = useMemo(() => normalizeLoyaltySettings(data.settings), [data.settings]);
  const tiers = useMemo(() => normaliseTiers(data), [data]);
  const rewards = useMemo(
    () =>
      (data.redeemRewards ?? []).filter(
        (reward) =>
          reward.isActive !== false &&
          Boolean(reward.id) &&
          Boolean(reward.title) &&
          Number.isFinite(reward.cost) &&
          reward.cost >= 0,
      ),
    [data.redeemRewards],
  );
  const offers = useMemo(
    () => (data.upcomingOffers ?? []).filter((offer) => offer.isActive !== false && Boolean(offer.id)),
    [data.upcomingOffers],
  );

  const currentTier = getLoyaltyTier(totalSpendLkr, tiers);
  const currentTierIndex = currentTier ? tiers.findIndex((tier) => tier.id === currentTier.id) : -1;
  const displayTierIndex = currentTierIndex >= 0 ? currentTierIndex : 0;
  const tone = tierTone(displayTierIndex, currentTier !== null);
  const nextTier = tiers.find((tier) => tier.minSpendLkr > totalSpendLkr) ?? null;
  const currentFloor = currentTier?.minSpendLkr ?? 0;
  const target = nextTier?.minSpendLkr ?? currentTier?.minSpendLkr ?? 0;
  const span = Math.max(0, target - currentFloor);
  const tierProgress = nextTier
    ? span > 0
      ? Math.min(100, Math.max(0, ((totalSpendLkr - currentFloor) / span) * 100))
      : 100
    : tiers.length > 0
      ? 100
      : 0;
  const remaining = nextTier ? Math.max(0, nextTier.minSpendLkr - totalSpendLkr) : 0;
  const customerRedeemEnabled = settings.customerRedeemEnabled !== false;
  const checkoutRedeemEnabled = customerRedeemEnabled && settings.checkoutRedeemEnabled !== false;
  const minPointsToRedeem = settings.minPointsToRedeem ?? 100;
  const lifetimePointsEarned = data.lifetimePointsEarned ?? 0;
  const checkoutRedeemUnlocked =
    data.checkoutRedeemUnlocked ??
    isCheckoutRedeemUnlocked({ lifetimePointsEarned, minPointsToRedeem });
  const balanceValue = points * settings.redeemValue;
  const canUseAtCheckout = checkoutRedeemEnabled && checkoutRedeemUnlocked && points > 0;
  const journey = data.journey?.active && data.journey.steps.length > 0 ? data.journey : null;
  const currentJourneyStep = journey?.steps.find((s) => s.key === journey.currentStepKey) ?? null;
  const offer3Step = journey?.steps.find((s) => s.key === 'OFFER_3') ?? null;
  const spinUnlocked =
    offer3Step?.status === 'completed' ||
    (offer3Step?.status === 'current' && offer3Step.statusLabel === 'Ready');
  const journeyComplete =
    !!journey &&
    journey.steps
      .filter((step) => step.status !== 'disabled')
      .every((step) => step.status === 'completed' || step.status === 'expired');
  const showSpinCta = spinUnlocked && spinEligibility?.canSpin !== false;
  const journeyProgressPct = useMemo(() => {
    if (!journey) return 0;
    const enabledSteps = journey.steps.filter((step) => step.status !== 'disabled');
    if (enabledSteps.length === 0) return 0;
    // Only real progress: completed offers, or Offer 3 order count.
    // "Available" / current with 0 orders must stay at 0%.
    const progressScore = enabledSteps.reduce((score, step) => {
      if (step.status === 'completed') return score + 1;
      if (step.status === 'expired') return score + 1;
      if (step.progress && step.progress.current > 0) {
        return score + Math.min(1, step.progress.current / Math.max(1, step.progress.required));
      }
      return score;
    }, 0);
    return Math.min(100, Math.round((progressScore / enabledSteps.length) * 100));
  }, [journey]);
  const focusJourneyStep =
    journey?.steps.find((step) => step.status === 'current') ?? null;

  const updatedLabel =
    updatedAt && updatedAt > 0
      ? new Date(updatedAt).toLocaleTimeString('en-LK', { hour: 'numeric', minute: '2-digit' })
      : null;

  return (
    <main className={`rewards-page rewards-page--${tone}`}>
      <header className="rewards-page__header">
        <Link href="/account" className="rewards-page__icon-button" aria-label="Back to account">
          <ChevronLeft size={22} strokeWidth={2.2} />
        </Link>
        <div className="rewards-page__header-title">
          <p>Rewards</p>
        </div>
        <Link href="/account/loyalty/history" className="rewards-page__history-link">
          <History size={16} strokeWidth={2.1} aria-hidden />
          <span>History</span>
        </Link>
      </header>

      {(isStale || isRefreshing) && (
        <div
          className={`rewards-page__sync ${isStale ? 'rewards-page__sync--stale' : ''}`}
          role={isStale ? 'status' : undefined}
        >
          <span>
            {isStale
              ? `Showing last loaded rewards${updatedLabel ? ` from ${updatedLabel}` : ''}.`
              : 'Refreshing…'}
          </span>
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={isRefreshing}>
              <RefreshCw size={14} className={isRefreshing ? 'rewards-page__spin' : undefined} />
              Refresh
            </button>
          )}
        </div>
      )}

      {/* 1. Primary: balance + progress */}
      <motion.section
        className="rewards-page__hero"
        {...reveal}
        transition={{ duration: 0.4 }}
        aria-labelledby="rewards-balance-heading"
      >
        <div className="rewards-page__hero-copy">
          <div className="rewards-page__tier-label">
            <BadgeCheck size={15} aria-hidden />
            {currentTier ? `${currentTier.name} Member` : 'Rewards Member'}
          </div>
          <p id="rewards-balance-heading" className="rewards-page__balance-label">
            Available balance
          </p>
          <p className="rewards-page__points">
            {points.toLocaleString()}
            <span>pts</span>
          </p>
          <p className="rewards-page__earn-rate">{formatLoyaltyEarnRate(settings)}</p>

          {tiers.length > 0 && (
            <div className="rewards-page__hero-progress">
              <div className="rewards-page__progress-copy">
                <span>
                  {nextTier
                    ? `${formatLoyaltySpend(remaining)} to ${nextTier.name}`
                    : 'Highest tier unlocked'}
                </span>
                <strong>{Math.round(tierProgress)}%</strong>
              </div>
              <div
                className="rewards-page__progress-track"
                role="progressbar"
                aria-label={nextTier ? `Progress to ${nextTier.name}` : 'Tier progress'}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(tierProgress)}
              >
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${tierProgress}%` }}
                  transition={{ duration: 0.8, ease: [0.33, 0, 0.2, 1] }}
                />
              </div>
            </div>
          )}

          {canUseAtCheckout ? (
            <Link href="/checkout" className="rewards-page__hero-button">
              Use at checkout
              <ArrowRight size={15} aria-hidden />
            </Link>
          ) : (
            <Link href="/menu" className="rewards-page__hero-button">
              Order to earn
              <ArrowRight size={15} aria-hidden />
            </Link>
          )}
        </div>
        <TierEmblem tone={tone} />
        <span className="rewards-page__hero-orb rewards-page__hero-orb--one" aria-hidden />
        <span className="rewards-page__hero-orb rewards-page__hero-orb--two" aria-hidden />
      </motion.section>

      {/* 2. New customer journey — one-row progress */}
      {journey && (
        <motion.section
          id="customer-journey"
          className="rewards-page__panel rewards-page__customer-journey"
          {...reveal}
          transition={{ duration: 0.4, delay: 0.03 }}
          aria-labelledby="customer-journey-heading"
        >
          <div className="rewards-page__panel-heading rewards-page__panel-heading--compact">
            <div>
              <h2 id="customer-journey-heading">Loyalty journey</h2>
              {!journeyComplete && journey.headline ? <p>{journey.headline}</p> : null}
            </div>
            <strong className="rewards-page__customer-journey-pct">{journeyProgressPct}%</strong>
          </div>

          <div
            className="rewards-page__offer-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={journeyProgressPct}
            aria-label="Loyalty journey progress"
          >
            <div className="rewards-page__offer-track-rail" aria-hidden>
              <span className="rewards-page__offer-track-line" />
              <motion.span
                className="rewards-page__offer-track-fill"
                initial={{ width: 0 }}
                animate={{ width: `${journeyProgressPct}%` }}
                transition={{ duration: 0.75, ease: [0.33, 0, 0.2, 1] }}
              />
            </div>
            <ol className="rewards-page__offer-steps">
              {journey.steps.map((step) => (
                <li key={step.key}>
                  <button
                    type="button"
                    className={`rewards-page__offer-step rewards-page__offer-step--${step.status}${
                      journey.currentStepKey === step.key ? ' is-focus' : ''
                    }`}
                    onClick={() => {
                      setTutorialOfferKey(step.key);
                      setTutorialOpen(true);
                    }}
                    aria-label={`Offer ${step.stepNumber} tutorial, ${step.statusLabel}`}
                  >
                    <span className="rewards-page__offer-step-badge" aria-hidden>
                      <JourneyStepIcon step={step} />
                    </span>
                    <h3>Offer {step.stepNumber}</h3>
                    <strong>{step.statusLabel}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {focusJourneyStep?.detail && (
            <p className="rewards-page__customer-journey-focus">{focusJourneyStep.detail}</p>
          )}

          {(showSpinCta ||
            (!journeyComplete &&
              (currentJourneyStep?.status === 'current' ||
                currentJourneyStep?.status === 'locked'))) && (
            <div className="rewards-page__customer-journey-cta">
              {showSpinCta ? (
                <button type="button" onClick={() => requestOpenSpin()}>
                  Spin the wheel
                  <Dices size={15} aria-hidden />
                </button>
              ) : (
                <Link href="/menu">
                  {currentJourneyStep?.key === 'OFFER_3' &&
                  currentJourneyStep.statusLabel !== 'Ready'
                    ? 'Order to unlock'
                    : 'Order now'}
                  <ArrowRight size={15} aria-hidden />
                </Link>
              )}
            </div>
          )}

          <LoyaltyJourneyTutorialModal
            open={tutorialOpen}
            onOpenChange={setTutorialOpen}
            journey={journey}
            focusKey={tutorialOfferKey}
          />
        </motion.section>
      )}

      {/* 3. Tier path — icons only */}
      {tiers.length > 0 && (
        <motion.section
          id="membership-journey"
          className="rewards-page__panel rewards-page__journey"
          {...reveal}
          transition={{ duration: 0.4, delay: 0.04 }}
          aria-labelledby="membership-journey-heading"
        >
          <div className="rewards-page__panel-heading rewards-page__panel-heading--compact">
            <div>
              <h2 id="membership-journey-heading">Membership</h2>
            </div>
          </div>
          <div className="rewards-page__tier-journey">
            <span className="rewards-page__tier-line" aria-hidden />
            {tiers.map((tier, index) => {
              const isCurrent = currentTier?.id === tier.id;
              const isUnlocked = totalSpendLkr >= tier.minSpendLkr;
              const nodeTone = tierTone(index, true);
              return (
                <article
                  key={tier.id}
                  className={`rewards-page__tier-node rewards-page__tier-node--${nodeTone} ${
                    isCurrent ? 'is-current' : ''
                  } ${isUnlocked ? 'is-unlocked' : ''}`}
                  aria-label={`${tier.name}, ${formatLoyaltySpend(tier.minSpendLkr)}${
                    isCurrent ? ', current' : ''
                  }`}
                >
                  <span className="rewards-page__tier-circle" aria-hidden>
                    {nodeTone === 'gold' ? <Crown /> : nodeTone === 'silver' ? <Gem /> : <Star />}
                  </span>
                  <h3>{tier.name}</h3>
                  <p>{formatLoyaltySpend(tier.minSpendLkr)}</p>
                  {isCurrent && <strong>Current</strong>}
                </article>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* 3. How to redeem — one clear status, no balance repeat */}
      <motion.section
        className="rewards-page__panel rewards-page__redeem-strip"
        {...reveal}
        transition={{ duration: 0.4, delay: 0.06 }}
        aria-labelledby="redeem-heading"
      >
        <div className="rewards-page__redeem-strip-row">
          <span
            id="redeem-heading"
            className={`rewards-page__redeem-status ${canUseAtCheckout ? 'is-ready' : ''}`}
          >
            {canUseAtCheckout ? (
              <BadgeCheck size={16} aria-hidden />
            ) : (
              <LockKeyhole size={16} aria-hidden />
            )}
            {!checkoutRedeemEnabled
              ? 'Redemption paused'
              : checkoutRedeemUnlocked
                ? `Redeem · ${formatLoyaltySpend(balanceValue)}`
                : `${lifetimePointsEarned.toLocaleString()}/${minPointsToRedeem.toLocaleString()} pts to unlock`}
          </span>
          <Link href={canUseAtCheckout ? '/checkout' : '/menu'} className="rewards-page__redeem-link">
            {canUseAtCheckout ? 'Checkout' : 'Menu'}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </motion.section>

      {/* 4. Rewards catalogue — only when items exist */}
      {rewards.length > 0 && (
        <motion.section
          className="rewards-page__section"
          {...reveal}
          transition={{ duration: 0.4, delay: 0.08 }}
          aria-labelledby="rewards-for-you-heading"
        >
          <div className="rewards-page__section-heading">
            <div>
              <h2 id="rewards-for-you-heading">Catalogue</h2>
            </div>
            <Link href="/promotions">
              Offers <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="rewards-page__reward-grid">
            {rewards.map((reward) => {
              const affordable = points >= reward.cost;
              return (
                <article
                  key={reward.id}
                  className={`rewards-page__reward-card ${affordable ? 'is-affordable' : ''}`}
                >
                  <div className="rewards-page__reward-top">
                    <span className="rewards-page__reward-icon" aria-hidden>
                      {reward.emoji || '🎁'}
                    </span>
                  </div>
                  <h3>{reward.title}</h3>
                  <div className="rewards-page__reward-cost">
                    <Star size={14} fill="currentColor" aria-hidden />
                    {reward.cost.toLocaleString()} pts
                  </div>
                </article>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* 5. Earn — compact */}
      <motion.section
        className="rewards-page__panel rewards-page__earn"
        {...reveal}
        transition={{ duration: 0.4, delay: 0.1 }}
        aria-labelledby="earn-more-heading"
      >
        <div className="rewards-page__panel-heading rewards-page__panel-heading--compact">
          <div>
            <h2 id="earn-more-heading">Earn</h2>
          </div>
          <Sparkles size={18} aria-hidden />
        </div>
        <ul className="rewards-page__earn-list">
          <li>
            <span className="rewards-page__earn-icon">
              <ShoppingBag size={17} aria-hidden />
            </span>
            <div>
              <h3>Orders</h3>
              <p>Min {formatLoyaltySpend(settings.minOrderToEarn)}</p>
            </div>
            <strong>{formatLoyaltyEarnRate(settings)}</strong>
          </li>
          {offers.slice(0, 2).map((offer) => (
            <li key={offer.id}>
              <span className="rewards-page__earn-icon" aria-hidden>
                {offer.emoji || '✨'}
              </span>
              <div>
                <h3>{offer.title}</h3>
              </div>
              {offer.date ? <strong>{offer.date}</strong> : null}
            </li>
          ))}
        </ul>
      </motion.section>

      <motion.section
        className="rewards-page__bottom-cta"
        {...reveal}
        transition={{ duration: 0.4, delay: 0.12 }}
        aria-label="Order and earn"
      >
        <div>
          <h2>Order &amp; earn</h2>
        </div>
        <Link href="/menu">
          Menu <ArrowRight size={16} aria-hidden />
        </Link>
      </motion.section>
    </main>
  );
}
