'use client';

import Link from 'next/link';
import { Phone, Mail, Clock } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import { BINGCHUN_SOCIAL_LINKS } from '@/lib/socialLinks';
import { STORE_HOURS_LABEL } from '@/lib/storeHours';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@/components/ui/SocialBrandIcons';

const SOCIAL_LINKS = [
  {
    href: BINGCHUN_SOCIAL_LINKS.instagram,
    label: 'Instagram',
    Icon: InstagramIcon,
    buttonClass: 'site-footer__social site-footer__social--instagram',
  },
  {
    href: BINGCHUN_SOCIAL_LINKS.facebook,
    label: 'Facebook',
    Icon: FacebookIcon,
    buttonClass: 'site-footer__social site-footer__social--facebook',
  },
  {
    href: BINGCHUN_SOCIAL_LINKS.tiktok,
    label: 'TikTok',
    Icon: TikTokIcon,
    buttonClass: 'site-footer__social site-footer__social--tiktok',
  },
] as const;

const INFO_LINKS = [
  { href: '/contact', label: 'Help & Support' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/refunds', label: 'Refund Policy' },
] as const;

export default function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <div className="site-footer__inner">
        <div className="site-footer__columns">
          {/* Left panel: brand + contact */}
          <div className="site-footer__col">
            <BrandLogo size={38} className="site-footer__brand" />
            <h3 className="site-footer__heading">Contact Us</h3>
            <div className="site-footer__panel">
              <ul className="site-footer__contact-list">
                <li className="site-footer__contact-row">
                  <Phone size={16} className="site-footer__contact-icon" aria-hidden />
                  <div className="site-footer__contact-copy">
                    <a href="tel:+94765466686">076 546 6686 (Inquiries)</a>
                    <a href="tel:+94715118888">071 511 8888 (Franchise)</a>
                  </div>
                </li>
                <li className="site-footer__contact-row">
                  <Mail size={16} className="site-footer__contact-icon" aria-hidden />
                  <a href="mailto:info@bingchunsrilanka.lk" className="site-footer__contact-copy">
                    info@bingchunsrilanka.lk
                  </a>
                </li>
                <li className="site-footer__contact-row">
                  <Clock size={16} className="site-footer__contact-icon" aria-hidden />
                  <span className="site-footer__contact-copy">Daily: {STORE_HOURS_LABEL}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right panel: socials + information */}
          <div className="site-footer__col">
            <div className="site-footer__socials">
              {SOCIAL_LINKS.map(({ href, label, Icon, buttonClass }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Bing Chun on ${label}`}
                  className={buttonClass}
                >
                  <Icon size={18} />
                </a>
              ))}
            </div>
            <h3 className="site-footer__heading">Information</h3>
            <div className="site-footer__panel">
              <ul className="site-footer__info-list">
                {INFO_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="site-footer__info-link">
                      <span className="site-footer__info-bullet" aria-hidden />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="site-footer__bottom">
          <p>© {new Date().getFullYear()} Bing Chun Sri Lanka (Pvt) Ltd. All rights reserved.</p>
          <p className="site-footer__powered">Powered with 🧋 in Sri Lanka</p>
        </div>
      </div>
    </footer>
  );
}
