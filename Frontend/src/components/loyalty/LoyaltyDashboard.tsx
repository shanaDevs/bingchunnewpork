'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
  Copy,
  Check,
  Users,
  Star,
  Zap,
  Crown,
  Trophy,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AnimatedMascot from '@/components/mascot/AnimatedMascot';
import {
  LOYALTY_TIERS,
  LOYALTY_REDEEM_REWARDS,
  LOYALTY_UPCOMING_REWARDS,
  getLoyaltyTier,
  getLoyaltyTierDisplay,
  loyaltyTierProgress,
  getLoyaltyTierProgressPercent,
  formatLoyaltySpend,
  computeLoyaltyStats,
  computeAchievements,
  formatLoyaltyEarnRate,
  normalizeLoyaltySettings,
  formatReferralCode,
  type LoyaltySummary,
} from '@/lib/loyalty';

interface LoyaltyDashboardProps {
  data: LoyaltySummary;
  userName?: string;
  userId?: string;
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

function LoyaltyRewardsRail({
  points,
  rewards,
}: {
  points: number;
  rewards: typeof LOYALTY_REDEEM_REWARDS;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.loyalty-dash__reward');
    const gap = 12;
    const amount = (card?.offsetWidth ?? 184) + gap;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);

  return (
    <div className="loyalty-dash__rewards-rail">
      <button
        type="button"
        className="loyalty-dash__rewards-arrow loyalty-dash__rewards-arrow--prev"
        aria-label="Previous rewards"
        disabled={!canScrollLeft}
        onClick={() => scroll('left')}
      >
        <ChevronLeft size={20} strokeWidth={2.25} />
      </button>
      <div ref={scrollRef} className="loyalty-dash__rewards-scroll" onScroll={updateScrollState}>
        {rewards.map((reward, i) => {
          const affordable = points >= reward.cost;
          return (
            <motion.article
              key={reward.id}
              className={`loyalty-dash__reward ${affordable ? 'loyalty-dash__reward--ready' : ''}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + i * 0.04 }}
            >
              {reward.tag && <span className="loyalty-dash__reward-tag">{reward.tag}</span>}
              <span className="loyalty-dash__reward-emoji" aria-hidden>{reward.emoji}</span>
              <h3 className="loyalty-dash__reward-title">{reward.title}</h3>
              <p className="loyalty-dash__reward-desc">{reward.description}</p>
              <div className="loyalty-dash__reward-foot">
                <span className="loyalty-dash__reward-cost">{reward.cost} pts</span>
                <span className={`loyalty-dash__reward-status ${affordable ? 'is-ready' : ''}`}>
                  {affordable ? 'Ready' : `Need ${reward.cost - points} more`}
                </span>
              </div>
            </motion.article>
          );
        })}
      </div>
      <button
        type="button"
        className="loyalty-dash__rewards-arrow loyalty-dash__rewards-arrow--next"
        aria-label="Next rewards"
        disabled={!canScrollRight}
        onClick={() => scroll('right')}
      >
        <ChevronRight size={20} strokeWidth={2.25} />
      </button>
    </div>
  );
}

export default function LoyaltyDashboard({ data, userName, userId }: LoyaltyDashboardProps) {
  const [copied, setCopied] = useState(false);
  const settings = useMemo(() => normalizeLoyaltySettings(data.settings), [data.settings]);
  const customerRedeemEnabled = settings.customerRedeemEnabled !== false;
  const tiers = useMemo(() => data.tiers ?? LOYALTY_TIERS, [data.tiers]);
  const redeemRewards = useMemo(() => data.redeemRewards ?? LOYALTY_REDEEM_REWARDS, [data.redeemRewards]);
  const upcomingOffers = useMemo(() => data.upcomingOffers ?? LOYALTY_UPCOMING_REWARDS, [data.upcomingOffers]);
  const referralBonus = data.referralBonusPoints ?? 100;
  const points = data.points;
  const totalSpendLkr = data.totalSpendLkr ?? 0;
  const tier = getLoyaltyTier(totalSpendLkr, tiers);
  const tierDisplay = getLoyaltyTierDisplay(totalSpendLkr, tiers);
  const progress = loyaltyTierProgress(totalSpendLkr, tiers);
  const progressPct = getLoyaltyTierProgressPercent(totalSpendLkr, tiers);
  const stats = useMemo(
    () => computeLoyaltyStats(data.transactions, points, totalSpendLkr, tiers, settings.redeemValue),
    [data.transactions, points, totalSpendLkr, tiers, settings.redeemValue],
  );
  const achievements = useMemo(
    () => computeAchievements(data.transactions, points, totalSpendLkr, tiers),
    [data.transactions, points, totalSpendLkr, tiers],
  );
  const referralCode = useMemo(
    () => (userId ? formatReferralCode(userId, userName) : 'BINGCHUN'),
    [userId, userName],
  );
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const copyReferral = useCallback(async () => {
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/account/register?ref=${referralCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Referral link copied!');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }, [referralCode]);

  return (
    <div className="loyalty-dash">
      <div className="loyalty-dash__bubbles" aria-hidden>
        <span className="loyalty-dash__bubble loyalty-dash__bubble--1" />
        <span className="loyalty-dash__bubble loyalty-dash__bubble--2" />
        <span className="loyalty-dash__bubble loyalty-dash__bubble--3" />
        <span className="loyalty-dash__bubble loyalty-dash__bubble--4" />
      </div>

      {/* Top bar */}
      <header className="loyalty-dash__topbar">
        <Link href="/account" className="loyalty-dash__back" aria-label="Back to account">
          <ChevronLeft size={20} strokeWidth={2.25} />
        </Link>
        <div className="loyalty-dash__topbar-copy">
          <Sparkles size={16} strokeWidth={2.25} className="loyalty-dash__topbar-icon" aria-hidden />
          <div>
            <h1 className="loyalty-dash__topbar-title">Rewards</h1>
            <p className="loyalty-dash__topbar-sub">Bing Chun Loyalty</p>
          </div>
        </div>
        <Link href="/account/loyalty/history" className="loyalty-dash__history-btn loyalty-dash__history-btn--header">
          <History size={14} strokeWidth={2.25} aria-hidden />
          View history
        </Link>
      </header>

      {/* Overview: balance hero + quick stats */}
      <section className="loyalty-dash__overview">
        <motion.article className="loyalty-dash__hero" {...fadeUp} transition={{ duration: 0.45 }}>
          <div className="loyalty-dash__hero-glow" aria-hidden />
          <div className="loyalty-dash__hero-inner">
            <div className="loyalty-dash__hero-main">
              <span className="loyalty-dash__hero-badge">
                {tier
                  ? `${tier.emoji} ${tier.name} Member`
                  : `${tierDisplay.emoji} ${formatLoyaltySpend(progress.remaining)} to ${tierDisplay.name}`}
              </span>
              <p className="loyalty-dash__hero-label">Your balance</p>
              <p className="loyalty-dash__hero-points">
                {points.toLocaleString()}
                <span className="loyalty-dash__hero-points-unit">pts</span>
              </p>
              {customerRedeemEnabled && (
                <p className="loyalty-dash__hero-worth">
                  ≈ LKR {(points * settings.redeemValue).toLocaleString()} redeemable
                </p>
              )}
              <p className="loyalty-dash__hero-earn-rate">{formatLoyaltyEarnRate(settings)}</p>

              <div className="loyalty-dash__hero-progress">
                <div className="loyalty-dash__hero-progress-head">
                  <span>
                    {progress.nextTier
                      ? `${formatLoyaltySpend(progress.remaining)} to ${progress.nextTier}`
                      : 'Maximum tier reached'}
                  </span>
                  <span>{Math.round(progressPct)}%</span>
                </div>
                <div className="loyalty-dash__hero-progress-track">
                  <motion.div
                    className="loyalty-dash__hero-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 1, ease: [0.33, 0, 0.2, 1], delay: 0.2 }}
                  />
                </div>
              </div>

              <div className="loyalty-dash__hero-actions">
                <Link href="/menu" className="loyalty-dash__btn loyalty-dash__btn--primary">
                  Order &amp; Earn <Zap size={16} strokeWidth={2.25} />
                </Link>
                {customerRedeemEnabled && (
                  <Link href="/checkout" className="loyalty-dash__btn loyalty-dash__btn--ghost">
                    Redeem
                  </Link>
                )}
              </div>
            </div>
            <div className="loyalty-dash__hero-visual" aria-hidden>
              <AnimatedMascot pose="cup-offer" size="md" showCup showBubble={false} />
            </div>
          </div>
        </motion.article>

        <motion.div
          className="loyalty-dash__overview-side"
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.05 }}
        >
          <div className="loyalty-dash__quick-stats">
            <article className="loyalty-dash__quick-stat">
              <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--gold">
                <Crown size={16} strokeWidth={2.25} />
              </span>
              <div>
                <p className="loyalty-dash__quick-stat-value">{formatLoyaltySpend(stats.lifetimeSpendLkr)}</p>
                <p className="loyalty-dash__quick-stat-label">Lifetime spend</p>
              </div>
            </article>
            <article className="loyalty-dash__quick-stat">
              <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--blue">
                <TrendingUp size={16} strokeWidth={2.25} />
              </span>
              <div>
                <p className="loyalty-dash__quick-stat-value">{stats.lifetimeEarned.toLocaleString()}</p>
                <p className="loyalty-dash__quick-stat-label">Points earned</p>
              </div>
            </article>
            <article className="loyalty-dash__quick-stat">
              <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--purple">
                <Gift size={16} strokeWidth={2.25} />
              </span>
              <div>
                <p className="loyalty-dash__quick-stat-value">{stats.lifetimeRedeemed.toLocaleString()}</p>
                <p className="loyalty-dash__quick-stat-label">Redeemed</p>
              </div>
            </article>
            <article className="loyalty-dash__quick-stat">
              <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--cream">
                <Trophy size={16} strokeWidth={2.25} />
              </span>
              <div>
                <p className="loyalty-dash__quick-stat-value">{unlockedCount}/{achievements.length}</p>
                <p className="loyalty-dash__quick-stat-label">Milestones</p>
              </div>
            </article>
          </div>

          <article className="loyalty-dash__panel loyalty-dash__panel--compact loyalty-dash__panel--glass">
            <h2 className="loyalty-dash__panel-title">How it works</h2>
            <ul className="loyalty-dash__how-list">
              <li>
                Earn <strong>{formatLoyaltyEarnRate(settings)}</strong> on orders over LKR{' '}
                {settings.minOrderToEarn.toLocaleString()}.
              </li>
              <li>Each point = LKR {settings.redeemValue.toLocaleString()} at checkout.</li>
              {customerRedeemEnabled && (
                <li>
                  Redeem points toward any order at checkout, up to the order total.
                </li>
              )}
            </ul>
          </article>
        </motion.div>
      </section>

      {/* Main layout */}
      <div className="loyalty-dash__layout">
        <main className="loyalty-dash__main">
          {customerRedeemEnabled && (
          <motion.section
            className="loyalty-dash__panel"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.08 }}
          >
            <div className="loyalty-dash__panel-head">
              <div>
                <h2 className="loyalty-dash__panel-title">Redeem rewards</h2>
                <p className="loyalty-dash__panel-sub">Use points at checkout or in-store</p>
              </div>
              <Gift size={20} className="loyalty-dash__panel-icon" aria-hidden />
            </div>
            <LoyaltyRewardsRail points={points} rewards={redeemRewards} />
          </motion.section>
          )}

          <motion.section
            className="loyalty-dash__panel"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.12 }}
          >
            <div className="loyalty-dash__panel-head">
              <div>
                <h2 className="loyalty-dash__panel-title">Membership tiers</h2>
                <p className="loyalty-dash__panel-sub">Unlock perks as you spend with Bing Chun</p>
              </div>
              <Crown size={20} className="loyalty-dash__panel-icon" aria-hidden />
            </div>
            <div className="loyalty-dash__tiers">
              {tiers.map((t) => {
                const isCurrent = tier?.id === t.id;
                const isUnlocked = totalSpendLkr >= t.minSpendLkr;
                return (
                  <article
                    key={t.id}
                    className={`loyalty-dash__tier loyalty-dash__tier--${t.id} ${isCurrent ? 'loyalty-dash__tier--active' : ''} ${!isUnlocked ? 'loyalty-dash__tier--locked' : ''}`}
                  >
                    <span className="loyalty-dash__tier-emoji" aria-hidden>{t.emoji}</span>
                    <h3 className="loyalty-dash__tier-name">{t.name}</h3>
                    <p className="loyalty-dash__tier-min">{formatLoyaltySpend(t.minSpendLkr)}+ spent</p>
                    <p className="loyalty-dash__tier-perk">{t.perk}</p>
                    {isCurrent && <span className="loyalty-dash__tier-badge">Current</span>}
                  </article>
                );
              })}
            </div>
          </motion.section>

          <motion.section
            className="loyalty-dash__panel loyalty-dash__panel--milestones"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.16 }}
          >
            <div className="loyalty-dash__panel-head">
              <div>
                <h2 className="loyalty-dash__panel-title">Milestones</h2>
                <p className="loyalty-dash__panel-sub">
                  {unlockedCount} of {achievements.length} unlocked
                </p>
              </div>
              <Trophy size={18} className="loyalty-dash__panel-icon" aria-hidden />
            </div>
            <div className="loyalty-dash__milestones-grid">
              {achievements.map((milestone) => (
                <article
                  key={milestone.id}
                  className={`loyalty-dash__milestone-card ${milestone.unlocked ? 'loyalty-dash__milestone-card--unlocked' : ''}`}
                >
                  <span className="loyalty-dash__milestone-card-emoji" aria-hidden>{milestone.emoji}</span>
                  <div className="loyalty-dash__milestone-card-body">
                    <p className="loyalty-dash__milestone-card-title">{milestone.title}</p>
                    <p className="loyalty-dash__milestone-card-desc">{milestone.description}</p>
                  </div>
                  <span className={`loyalty-dash__milestone-card-status ${milestone.unlocked ? 'is-unlocked' : ''}`}>
                    {milestone.unlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </article>
              ))}
            </div>
          </motion.section>
        </main>

        <aside className="loyalty-dash__aside">
          <motion.section
            className="loyalty-dash__panel loyalty-dash__panel--referral"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="loyalty-dash__panel-head">
              <div>
                <h2 className="loyalty-dash__panel-title">Refer a friend</h2>
                <p className="loyalty-dash__panel-sub">You both earn {referralBonus} bonus points</p>
              </div>
              <Users size={20} className="loyalty-dash__panel-icon" aria-hidden />
            </div>
            <div className="loyalty-dash__referral-code">
              <code>{referralCode}</code>
              <button
                type="button"
                className="loyalty-dash__referral-copy"
                onClick={copyReferral}
                aria-label="Copy referral link"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="loyalty-dash__referral-hint">
              Share your link — when friends sign up and order, you both get rewarded.
            </p>
          </motion.section>

          <motion.section
            className="loyalty-dash__panel loyalty-dash__panel--upcoming"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.14 }}
          >
            <div className="loyalty-dash__panel-head">
              <div>
                <h2 className="loyalty-dash__panel-title">Upcoming rewards</h2>
                <p className="loyalty-dash__panel-sub">Mark your calendar</p>
              </div>
              <ArrowUpRight size={18} className="loyalty-dash__panel-icon" aria-hidden />
            </div>
            <ul className="loyalty-dash__upcoming-list">
              {upcomingOffers.map((item) => (
                <li key={item.id} className="loyalty-dash__upcoming-item">
                  <span className="loyalty-dash__upcoming-emoji" aria-hidden>{item.emoji}</span>
                  <div>
                    <p className="loyalty-dash__upcoming-title">{item.title}</p>
                    <p className="loyalty-dash__upcoming-desc">{item.description}</p>
                    <span className="loyalty-dash__upcoming-date">{item.date}</span>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.article
            className="loyalty-dash__aside-cta"
            {...fadeUp}
            transition={{ duration: 0.45, delay: 0.18 }}
          >
            <Star size={18} strokeWidth={2.25} aria-hidden />
            <div>
              <p className="loyalty-dash__aside-cta-title">{stats.tierEmoji} {stats.tierName} tier</p>
              <p className="loyalty-dash__aside-cta-desc">
                {tier
                  ? `You're enjoying ${tier.name} member perks.`
                  : `Spend ${formatLoyaltySpend(progress.remaining)} more to unlock Pearl.`}
              </p>
            </div>
          </motion.article>
        </aside>
      </div>
    </div>
  );
}
