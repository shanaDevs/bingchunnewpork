import type { CommissionChannel } from '../commission';

/** Bing Chun brand palette */
export const INVOICE_COLORS = {
  brand: '#307ef2',
  brandDark: '#1a5cd4',
  navy: '#0f1428',
  text: '#1e293b',
  textMuted: '#64748b',
  cream: '#faf9f6',
  line: '#d4d4d8',
  lineDark: '#a1a1aa',
  white: '#ffffff',
  danger: '#b91c1c',
} as const;

export const INVOICE_SERIF = 'Times-Roman';
export const INVOICE_SERIF_BOLD = 'Times-Bold';
export const INVOICE_SANS = 'Helvetica';
export const INVOICE_SANS_BOLD = 'Helvetica-Bold';

export const INVOICE_CHANNEL_ORDER: CommissionChannel[] = [
  'pickupCash',
  'pickupCard',
  'pickupOnline',
  'deliveryOnline',
];

export const DARTCODES_ISSUER = {
  name: 'DartCodes',
  tagline: 'Platform & Technology Services',
  email: 'info@dartcodes.com',
  web: 'dartcodes.com',
} as const;

export const PAID_GREEN = '#16a34a';
export const PAID_GREEN_LIGHT = '#dcfce7';

export const INVOICE_CHANNEL_LABELS: Record<CommissionChannel, string> = {
  pickupCash: 'Pickup cash',
  pickupCard: 'Pickup card',
  pickupOnline: 'Pickup online',
  deliveryOnline: 'Delivery online',
};

export const INVOICE_CONTENT_TOP = 52;

/** Withdrawal invoice (WD-INV) visual system — charcoal text, light-blue fills only. */
export const WD_INVOICE_COLORS = {
  bg: '#FFFFFF',
  text: '#111111',
  textSecondary: '#4B5563',
  border: '#DDE3EA',
  headerFill: '#EEF7FF',
  totalFill: '#EAF5FF',
  noteFill: '#F0F7FC',
} as const;

export const WD_INVOICE_MARGIN_X = 42;
export const WD_INVOICE_CONTENT_TOP = 40;
export const WD_INVOICE_SECTION_GAP = 26;
export const WD_INVOICE_ROW_H = 34;
export const WD_INVOICE_PAGE2_ROW_H = 20;
export const WD_INVOICE_HEADER_H = 26;
export const WD_INVOICE_PAGE2_HEADER_H = 20;
export const WD_INVOICE_RADIUS = 4;
export const WD_INVOICE_FIXED_NOTES =
  'This is an automated branch wallet payout settlement for the selected statement period.';

