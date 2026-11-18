import type { Metadata } from 'next';
import { CartRedesignShell } from '@/components/cart-redesign/CartRedesignShell';
import { CartView } from '@/components/cart-redesign/CartView';

export const metadata: Metadata = {
  title: 'Cart',
  description: 'Review your Bing Chun bag and proceed to checkout.',
};

export default function CartPage() {
  return (
    <CartRedesignShell>
      <CartView />
    </CartRedesignShell>
  );
}
