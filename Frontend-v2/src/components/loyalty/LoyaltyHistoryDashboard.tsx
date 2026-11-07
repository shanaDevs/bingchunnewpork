'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  History,
  TrendingUp,
  Gift,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import LoyaltyActivityTimeline from '@/components/loyalty/LoyaltyActivityTimeline';
import {
  computeLoyaltyStats,
  formatLoyaltyEarnRate,
  formatLoyaltySpend,
  getLoyaltyTransactionKind,
  LOYALTY_TIERS,
  normalizeLoyaltySettings,
  type LoyaltySummary,
} from '@/lib/loyalty';

type HistoryFilter = 'all' | 'earn' | 'redeem';

interface LoyaltyHistoryDashboardProps {
  data: LoyaltySummary;
}

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'earn', label: 'Earned' },
  { value: 'redeem', label: 'Redeemed' },
];

export default function LoyaltyHistoryDashboard({ data }: LoyaltyHistoryDashboardProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const settings = useMemo(() => normalizeLoyaltySettings(data.settings), [data.settings]);
  const lkrPerPoint = Math.max(1, Math.round(1 / settings.pointsPerLkr));
  const stats = useMemo(
    () => computeLoyaltyStats(data.transactions, data.points, data.totalSpendLkr ?? 0, data.tiers ?? LOYALTY_TIERS, settings.redeemValue),
    [data.transactions, data.points, data.totalSpendLkr, data.tiers, settings.redeemValue],
  );

  const filteredTransactions = useMemo(() => {
    if (filter === 'all') return data.transactions;
    return data.transactions.filter((txn) => getLoyaltyTransactionKind(txn) === filter);
  }, [data.transactions, filter]);

  return (
    <div className="loyalty-dash loyalty-dash--history">
      <header className="loyalty-dash__header">
        <Link href="/account/loyalty" className="loyalty-dash__back" aria-label="Back to rewards">
          <ChevronLeft size={20} strokeWidth={2.25} />
        </Link>
        <div className="loyalty-dash__header-copy">
          <span className="loyalty-dash__eyebrow">
            <History size={14} strokeWidth={2.25} aria-hidden />
            Points history
          </span>
          <h1 className="loyalty-dash__title">Earning history</h1>
          <p className="loyalty-dash__lead">
            See how you earned and redeemed Bing Chun reward points
          </p>
        </div>
      </header>

      <motion.section
        className="loyalty-dash__history-summary"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <article className="loyalty-dash__history-summary-card loyalty-dash__history-summary-card--primary">
          <span className="loyalty-dash__history-summary-label">Current balance</span>
          <p className="loyalty-dash__history-summary-value">
            {data.points.toLocaleString()}
            <span> pts</span>
          </p>
          <p className="loyalty-dash__history-summary-meta">
            ≈ {formatLoyaltySpend(data.points * settings.redeemValue)} redeemable
          </p>
        </article>
        <article className="loyalty-dash__history-summary-card">
          <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--blue">
            <TrendingUp size={16} strokeWidth={2.25} />
          </span>
          <p className="loyalty-dash__history-summary-value loyalty-dash__history-summary-value--sm">
            {stats.lifetimeEarned.toLocaleString()}
          </p>
          <p className="loyalty-dash__history-summary-label">Total earned</p>
        </article>
        <article className="loyalty-dash__history-summary-card">
          <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--purple">
            <Gift size={16} strokeWidth={2.25} />
          </span>
          <p className="loyalty-dash__history-summary-value loyalty-dash__history-summary-value--sm">
            {stats.lifetimeRedeemed.toLocaleString()}
          </p>
          <p className="loyalty-dash__history-summary-label">Total redeemed</p>
        </article>
        <article className="loyalty-dash__history-summary-card">
          <span className="loyalty-dash__stat-icon loyalty-dash__stat-icon--cream">
            <ShoppingBag size={16} strokeWidth={2.25} />
          </span>
          <p className="loyalty-dash__history-summary-value loyalty-dash__history-summary-value--sm">
            {stats.orderCount}
          </p>
          <p className="loyalty-dash__history-summary-label">Reward orders</p>
        </article>
      </motion.section>

      <motion.section
        className="loyalty-dash__panel loyalty-dash__panel--history"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
      >
        <div className="loyalty-dash__panel-head">
          <div>
            <h2 className="loyalty-dash__panel-title">All activity</h2>
            <p className="loyalty-dash__panel-sub">
              {formatLoyaltyEarnRate(settings)} on orders over LKR{' '}
              {settings.minOrderToEarn.toLocaleString()}
            </p>
          </div>
          <Sparkles size={18} className="loyalty-dash__panel-icon" aria-hidden />
        </div>

        <div className="loyalty-dash__history-filters" role="tablist" aria-label="Filter history">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              className={`loyalty-dash__history-filter ${filter === item.value ? 'is-active' : ''}`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {filteredTransactions.length === 0 ? (
          <p className="loyalty-dash__empty">
            {filter === 'all'
              ? 'No activity yet. Place an order to start earning points!'
              : `No ${filter === 'earn' ? 'earned' : 'redeemed'} points in your history yet.`}
          </p>
        ) : (
          <LoyaltyActivityTimeline transactions={filteredTransactions} detailed lkrPerPoint={lkrPerPoint} />
        )}
      </motion.section>

      <div className="loyalty-dash__history-actions">
        <Link href="/menu" className="loyalty-dash__btn loyalty-dash__btn--primary">
          Order &amp; earn more
        </Link>
        <Link href="/account/loyalty" className="loyalty-dash__btn loyalty-dash__btn--ghost">
          Back to rewards
        </Link>
      </div>
    </div>
  );
}
