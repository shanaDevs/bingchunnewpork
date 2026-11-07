import { redirect } from 'next/navigation';

/** The old Rewards address: Rewards now lives at /account/rewards (components/account-redesign/rewards). */
export default function LoyaltyPage() {
  redirect('/account/rewards');
}
