'use client';

import Link from 'next/link';

import SuperAdminRankingCard from '@/components/admin/SuperAdminRankingCard';
import { formatMoneyAmount } from '@/lib/receipt';

export type SuperAdminTopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
  basePrice?: number;
  imageUrl?: string | null;
};

type Props = {
  products: SuperAdminTopProduct[];
  periodLabel: string;
  loading?: boolean;
};

export default function SuperAdminTopProducts({ products, periodLabel, loading }: Props) {
  const topFive = products.slice(0, 5);
  const maxRevenue = Math.max(...topFive.map((product) => product.revenue), 1);

  return (
    <SuperAdminRankingCard
      title="Top 5 Selling Products"
      nameLabel="Product"
      subtitle={periodLabel}
      showImage
      headerRight={
        <Link href="/admin/sales" className="text-xs font-semibold text-brand hover:underline">
          View All
        </Link>
      }
      metricLabel="Qty"
      rows={topFive.map((product, index) => ({
        id: `${product.productName}-${index}`,
        name: product.productName,
        imageUrl: product.imageUrl,
        metric: product.quantity.toLocaleString('en-LK'),
        value: formatMoneyAmount(product.revenue),
        progress: (product.revenue / maxRevenue) * 100,
      }))}
      loading={loading}
      empty="No product sales in this period"
    />
  );
}
