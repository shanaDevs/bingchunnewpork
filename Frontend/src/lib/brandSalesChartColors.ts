/** Shared Tailwind classes for brand / branch sales dashboards. */
export const BRAND_ACCENT_ICON_CLASS = 'text-[#307ef2]';
export const BRAND_ACCENT_LINK_CLASS = 'text-sm font-medium text-[#307ef2] hover:underline';

/** Payment-channel bar colors (brand sales command center). */
export const BRAND_ORDER_CHANNEL_COLORS = {
  delivery: '#112E81',
  pickupCard: '#4647AE',
  pickupCash: '#4382DF',
  pickupOnline: '#AACCD6',
} as const;

/** Delivery vs pickup / primary chart blues. */
export const BRAND_MODE_COLORS = {
  delivery: '#307ef2',
  pickup: '#93c5fd',
} as const;

/** Revenue / cashflow area chart. */
export const BRAND_REVENUE_FLOW_COLORS = {
  revenue: '#307ef2',
  outflow: '#ef4444',
} as const;

/** Gross revenue breakdown donut (branch sales). */
export const BRAND_GROSS_REVENUE_SLICE_COLORS = {
  productSales: '#307ef2',
  delivery: '#4382DF',
  convenience: '#4647AE',
  other: '#AACCD6',
} as const;
