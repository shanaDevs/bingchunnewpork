import { Clock3, Smile, Star, Store } from 'lucide-react';

const TRUST_BADGES = [
  {
    id: 'rating',
    icon: Star,
    value: '4.9',
    label: 'Ratings',
    tone: 'rating' as const,
  },
  {
    id: 'delivery',
    icon: Clock3,
    value: '20 Min',
    label: 'Fast Delivery',
    tone: 'delivery' as const,
  },
  {
    id: 'stores',
    icon: Store,
    value: '32+',
    label: 'Stores nationwide',
    tone: 'stores' as const,
  },
  {
    id: 'customers',
    icon: Smile,
    value: '100K+',
    label: 'Happy Customers',
    tone: 'customers' as const,
  },
] as const;

interface HeroTrustBadgesProps {
  className?: string;
  storeCountLabel?: string;
}

export default function HeroTrustBadges({ className = '', storeCountLabel = '32+' }: HeroTrustBadgesProps) {
  const badges = TRUST_BADGES.map((badge) =>
    badge.id === 'stores' ? { ...badge, value: storeCountLabel } : badge,
  );

  return (
    <div className={`home-hero-trust ${className}`.trim()} aria-label="Bing Chun highlights">
      {badges.map((badge) => {
        const Icon = badge.icon;
        return (
          <div key={badge.id} className="home-hero-trust__item">
            <span className={`home-hero-trust__icon home-hero-trust__icon--${badge.tone}`} aria-hidden>
              <Icon size={14} strokeWidth={2.25} />
            </span>
            <span className="home-hero-trust__text">
              <strong className="home-hero-trust__value">{badge.value}</strong>
              <span className="home-hero-trust__label">{badge.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
