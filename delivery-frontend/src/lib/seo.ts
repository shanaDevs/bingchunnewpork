/** Canonical public site origin for SEO (metadata, sitemap, robots, JSON-LD). */
export const SITE_URL = 'https://bingchun-delivery-6mgs2.ondigitalocean.app';

export const SITE_NAME = 'Bing Chun Sri Lanka';

export const SITE_TAGLINE = 'Premium Bubble Tea & Ice Cream';

export const DEFAULT_DESCRIPTION =
  'Order premium bubble tea, milkshakes, and ice cream online. Delivery and takeaway from 32+ locations across Sri Lanka. Fresh ingredients, crafted with love.';

export const DEFAULT_KEYWORDS = [
  'Bing Chun',
  'Bing Chun Sri Lanka',
  'bubble tea',
  'bubble tea Sri Lanka',
  'milk tea',
  'ice cream',
  'boba tea Colombo',
  'bubble tea delivery',
  'Sri Lanka',
  'Colombo',
  'takeaway',
];

export const BUSINESS_PHONE = '+94765466686';
export const BUSINESS_PHONE_DISPLAY = '076 546 6686';
export const BUSINESS_EMAIL = 'info@bingchunsrilanka.com';
export const BUSINESS_HOURS = 'Mo-Su 08:00-23:00';

export const DEFAULT_OG_IMAGE = '/icons/icon-512x512.png';

export function absoluteUrl(path = '/'): string {
  if (path.startsWith('http')) return path;
  const base = SITE_URL.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
