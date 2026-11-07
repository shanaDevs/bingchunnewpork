import { Banknote, CreditCard, Globe, Truck, type LucideIcon } from 'lucide-react';

export type PaymentChannelBreakdown = {
  pickupCashTotal: number;
  pickupCashCount: number;
  pickupCardTotal: number;
  pickupCardCount: number;
  pickupOnlineTotal: number;
  pickupOnlineCount: number;
  deliveryOnlineTotal: number;
  deliveryOnlineCount: number;
};

export type PaymentChannelCardDef = {
  key: 'pickupCash' | 'pickupCard' | 'pickupOnline' | 'deliveryOnline';
  label: string;
  totalKey: keyof PaymentChannelBreakdown;
  countKey: keyof PaymentChannelBreakdown;
  icon: LucideIcon;
};

const CARD_KEYS: Array<{
  key: PaymentChannelCardDef['key'];
  totalKey: PaymentChannelCardDef['totalKey'];
  countKey: PaymentChannelCardDef['countKey'];
  icon: LucideIcon;
  branchLabel: string;
  brandLabel: string;
}> = [
  {
    key: 'pickupCash',
    totalKey: 'pickupCashTotal',
    countKey: 'pickupCashCount',
    icon: Banknote,
    branchLabel: 'Cash Orders',
    brandLabel: 'Pickup Cash',
  },
  {
    key: 'pickupCard',
    totalKey: 'pickupCardTotal',
    countKey: 'pickupCardCount',
    icon: CreditCard,
    branchLabel: 'Card Orders',
    brandLabel: 'Pickup Card',
  },
  {
    key: 'pickupOnline',
    totalKey: 'pickupOnlineTotal',
    countKey: 'pickupOnlineCount',
    icon: Globe,
    branchLabel: 'Online Orders',
    brandLabel: 'Pickup Online',
  },
  {
    key: 'deliveryOnline',
    totalKey: 'deliveryOnlineTotal',
    countKey: 'deliveryOnlineCount',
    icon: Truck,
    branchLabel: 'Delivery Orders',
    brandLabel: 'Delivery Online',
  },
];

export const BRANCH_PAYMENT_CHANNEL_CARDS: PaymentChannelCardDef[] = CARD_KEYS.map((row) => ({
  key: row.key,
  label: row.branchLabel,
  totalKey: row.totalKey,
  countKey: row.countKey,
  icon: row.icon,
}));

export const BRAND_PAYMENT_CHANNEL_CARDS: PaymentChannelCardDef[] = CARD_KEYS.map((row) => ({
  key: row.key,
  label: row.brandLabel,
  totalKey: row.totalKey,
  countKey: row.countKey,
  icon: row.icon,
}));

export function paymentChannelCardsWithoutDelivery(
  cards: PaymentChannelCardDef[],
): PaymentChannelCardDef[] {
  return cards.filter((card) => card.key !== 'deliveryOnline');
}
