import type { Metadata } from 'next';
import { OverviewView } from '@/components/account-redesign/OverviewView';

export const metadata: Metadata = {
  title: 'My Account',
  robots: { index: false },
};

/** The account Overview (components/account-redesign); the account layout puts it in the AccountShell. */
export default function AccountPage() {
  return <OverviewView />;
}
