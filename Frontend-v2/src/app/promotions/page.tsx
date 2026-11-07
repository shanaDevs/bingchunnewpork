import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/seo';
import PromotionsClient from './PromotionsClient';

export const metadata: Metadata = {
  title: 'Offers & Promotions',
  description:
    'See current Bing Chun offers, promotions, and deals on bubble tea and ice cream across Sri Lanka.',
  alternates: {
    canonical: '/promotions',
  },
  openGraph: {
    title: 'Offers & Promotions | Bing Chun Sri Lanka',
    description: 'Current Bing Chun offers and promotions.',
    url: absoluteUrl('/promotions'),
  },
};

export default function PromotionsPage() {
  return <PromotionsClient />;
}
