import type { Metadata } from 'next';
import { NotificationsView } from '@/components/account-redesign/notifications/NotificationsView';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false },
};

/** How the customer hears about their orders (components/account-redesign/notifications); the account layout puts it in the AccountShell. */
export default function NotificationsPage() {
  return <NotificationsView />;
}
