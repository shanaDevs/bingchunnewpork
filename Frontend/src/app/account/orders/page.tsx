import type { Metadata } from 'next';
import { OrdersView } from '@/components/account-redesign/orders/OrdersView';

export const metadata: Metadata = {
  title: 'My Orders',
  robots: { index: false },
};

/** My Orders (components/account-redesign/orders); the account layout puts it in the AccountShell. */
export default function OrdersPage() {
  return <OrdersView />;
}
