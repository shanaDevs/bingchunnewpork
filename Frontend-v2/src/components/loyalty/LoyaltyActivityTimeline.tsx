'use client';

import Link from 'next/link';
import {
  describeLoyaltyTransaction,
  extractOrderNumberFromNote,
  formatTransactionLabel,
  getLoyaltyTransactionKind,
  LOYALTY_LKR_PER_POINT,
  type LoyaltyTransaction,
} from '@/lib/loyalty';

interface LoyaltyActivityTimelineProps {
  transactions: LoyaltyTransaction[];
  limit?: number;
  detailed?: boolean;
  lkrPerPoint?: number;
}

export default function LoyaltyActivityTimeline({
  transactions,
  limit,
  detailed = false,
  lkrPerPoint = LOYALTY_LKR_PER_POINT,
}: LoyaltyActivityTimelineProps) {
  const items = limit ? transactions.slice(0, limit) : transactions;

  return (
    <ol className="loyalty-dash__timeline">
      {items.map((txn, i) => {
        const kind = getLoyaltyTransactionKind(txn);
        const orderNum = extractOrderNumberFromNote(txn.note);

        return (
          <li
            key={txn.id}
            className={`loyalty-dash__timeline-item ${detailed ? 'loyalty-dash__timeline-item--detailed' : ''}`}
          >
            <span
              className={`loyalty-dash__timeline-dot loyalty-dash__timeline-dot--${kind}`}
              aria-hidden
            />
            <div className="loyalty-dash__timeline-body">
              <p className="loyalty-dash__timeline-title">{formatTransactionLabel(txn.type)}</p>
              {detailed ? (
                <p className="loyalty-dash__timeline-desc">{describeLoyaltyTransaction(txn, lkrPerPoint)}</p>
              ) : (
                txn.note && <p className="loyalty-dash__timeline-note">{txn.note}</p>
              )}
              <time className="loyalty-dash__timeline-date">
                {new Date(txn.createdAt).toLocaleString('en-LK', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
              {detailed && orderNum && (
                <Link href={`/order/${encodeURIComponent(orderNum)}`} className="loyalty-dash__timeline-link">
                  View order
                </Link>
              )}
            </div>
            <span
              className={`loyalty-dash__timeline-points ${txn.points >= 0 ? 'is-positive' : 'is-negative'}`}
            >
              {txn.points >= 0 ? '+' : ''}
              {txn.points}
            </span>
            {i < items.length - 1 && <span className="loyalty-dash__timeline-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
