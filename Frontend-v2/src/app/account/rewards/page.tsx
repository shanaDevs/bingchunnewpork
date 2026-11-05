import type { Metadata } from 'next';
import { RewardsView } from '@/components/account-redesign/rewards/RewardsView';

export const metadata: Metadata = {
  title: 'My Rewards',
  robots: { index: false },
};

/** Happy Points, membership, the loyalty journey and the points history (components/account-redesign/rewards); the account layout puts it in the AccountShell. */
export default function RewardsPage() {
  return <RewardsView />;
}
