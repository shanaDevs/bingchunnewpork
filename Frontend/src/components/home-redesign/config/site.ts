/**
 * Navigation and contact details for the redesigned home page (header, mobile menu and footer).
 * Links point at the app's existing routes.
 */
import { BINGCHUN_SOCIAL_LINKS } from "@/lib/socialLinks";

export type NavItem = {
  label: string;
  href: string;
};

export const mainNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Menu", href: "/menu" },
  { label: "Offers", href: "/promotions" },
  { label: "Locations", href: "/stores" },
];

export type FooterLinkGroup = {
  title: string;
  links: NavItem[];
};

// Menu categories, in the categories table's sortOrder; each opens the menu filtered by its slug.
export const footerNav: FooterLinkGroup[] = [
  {
    title: "Explore",
    links: [
      ...mainNav,
      { label: "My Account", href: "/account" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Our Products",
    links: [
      { label: "Bubble Tea", href: "/menu?category=bubble-tea" },
      { label: "Milk Tea", href: "/menu?category=milk-tea" },
      { label: "Fruit Tea", href: "/menu?category=fruit-tea" },
      { label: "Milkshake", href: "/menu?category=milkshake" },
      { label: "Sundae", href: "/menu?category=sundae" },
      { label: "Ice Cream", href: "/menu?category=ice-cream" },
    ],
  },
];

/** Contact details shown in the footer. Phone hrefs use the +94 international form so they dial from anywhere. */
export const contactInfo = {
  location: "Colombo, Sri Lanka",
  email: "info@bingchunsrilanka.lk",
  inquiries: { label: "076 546 6686", href: "tel:+94765466686" },
  franchise: [
    { label: "071 511 8888", href: "tel:+94715118888" },
    { label: "071 511 7777", href: "tel:+94715117777" },
  ],
  hours: "Open Daily: 8 AM - 11 PM",
} as const;

export const socialLinks = [
  { label: "Facebook", href: BINGCHUN_SOCIAL_LINKS.facebook },
  { label: "Instagram", href: BINGCHUN_SOCIAL_LINKS.instagram },
  { label: "TikTok", href: BINGCHUN_SOCIAL_LINKS.tiktok },
] as const;
