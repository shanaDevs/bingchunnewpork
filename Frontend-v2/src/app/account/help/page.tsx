import type { Metadata } from 'next';
import { HelpView } from '@/components/account-redesign/help/HelpView';

export const metadata: Metadata = {
  title: 'Help & Support',
  robots: { index: false },
};

/** Help & Support inside the account (components/account-redesign/help); the account layout puts it in the AccountShell. The public /contact page stays for signed-out visitors. */
export default function HelpPage() {
  return <HelpView />;
}
