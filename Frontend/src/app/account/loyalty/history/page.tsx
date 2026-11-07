import { redirect } from 'next/navigation';

/** The old points history page: the history is now a section of /account/rewards. */
export default function LoyaltyHistoryPage() {
  redirect('/account/rewards#history');
}
