'use client';

import { MessageSquare, Star, UserPlus, UsersRound } from 'lucide-react';

import { BrandOverviewMetricGridSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import BrandOverviewMetricTile, {
  brandOverviewCardHeaderClassName,
  brandOverviewCardShellClassName,
  brandOverviewKpiBodyClassName,
} from '@/components/admin/brand-sales/BrandOverviewMetricTile';

type Props = {
  newCustomers: number;
  repeatCustomers: number;
  avgRating: number | null;
  totalReviews: number;
  distribution?: Array<{ stars: 1 | 2 | 3 | 4 | 5; count: number }>;
  loading?: boolean;
};

export default function BrandCustomersReviewsPanel({
  newCustomers,
  repeatCustomers,
  avgRating,
  totalReviews,
  loading,
}: Props) {
  return (
    <div className={brandOverviewCardShellClassName}>
      <div className={brandOverviewCardHeaderClassName}>
        <h2 className="text-[13px] font-semibold text-fg">Customers & Reviews</h2>
      </div>
      <div className={brandOverviewKpiBodyClassName}>
        {loading ? (
          <BrandOverviewMetricGridSkeleton />
        ) : (
          <div className="grid w-full grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <BrandOverviewMetricTile
              icon={UserPlus}
              label="New Customers"
              value={newCustomers.toLocaleString()}
              tileClassName="bg-[#307ef2]/10"
              iconClassName="text-[#307ef2]"
            />
            <BrandOverviewMetricTile
              icon={Star}
              label="Average Rating"
              value={avgRating != null ? `${avgRating.toFixed(1)} / 5` : '—'}
              tileClassName="bg-sky-500/10"
              iconClassName="text-sky-600"
            />
            <BrandOverviewMetricTile
              icon={UsersRound}
              label="Repeat Customers"
              value={repeatCustomers.toLocaleString()}
              tileClassName="bg-[#307ef2]/10"
              iconClassName="text-[#307ef2]"
            />
            <BrandOverviewMetricTile
              icon={MessageSquare}
              label="Total Reviews"
              value={totalReviews.toLocaleString()}
              tileClassName="bg-[#307ef2]/10"
              iconClassName="text-[#307ef2]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
