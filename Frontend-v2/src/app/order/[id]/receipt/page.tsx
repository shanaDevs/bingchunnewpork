import type { Metadata } from 'next';
import { ReceiptPage } from '@/components/account-redesign/orders/ReceiptPage';

export const metadata: Metadata = {
  title: 'Receipt',
  robots: { index: false },
};

/** An order's printable receipt, in the redesign's look (components/account-redesign/orders/ReceiptPage). */
export default function OrderReceiptPage() {
  return <ReceiptPage />;
}
