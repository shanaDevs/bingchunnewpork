'use client';

import SuperAdminRankingCard, {
  type SuperAdminRankingRow,
} from '@/components/admin/SuperAdminRankingCard';

type Props = {
  title: string;
  subtitle?: string;
  rows: SuperAdminRankingRow[];
  loading?: boolean;
  empty?: string;
};

export default function SuperAdminBranchPerformanceCard({
  title,
  subtitle,
  rows,
  loading,
  empty = 'No branch sales in this period',
}: Props) {
  return (
    <SuperAdminRankingCard
      title={title}
      subtitle={subtitle}
      rows={rows}
      loading={loading}
      empty={empty}
    />
  );
}
