'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { getCategoryEmoji } from '@/lib/categoryEmojis';

const CATEGORY_IMAGES: Partial<Record<string, string>> = {
  'bubble-tea': '/brand/home-cat-bubble-tea.png',
  sundae: '/brand/home-cat-ice-cream.png',
};

const HOME_CATEGORIES = [
  { slug: 'all', label: 'All Drinks' },
  { slug: 'bubble-tea', label: 'Bubble Tea' },
  { slug: 'milk-tea', label: 'Milk Tea' },
  { slug: 'fruit-tea', label: 'Fruit Tea' },
  { slug: 'milkshake', label: 'Milkshake' },
  { slug: 'sundae', label: 'Sundae' },
] as const;

export default function HomeCategoryRow() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onMenu = pathname.startsWith('/menu');
  const activeSlug = searchParams.get('category') ?? 'all';

  return (
    <nav className="home-categories home-categories--stagger" aria-label="Drink categories">
      {HOME_CATEGORIES.map((cat) => {
        const href = cat.slug === 'all' ? '/menu' : `/menu?category=${cat.slug}`;
        const active = onMenu && cat.slug === activeSlug;
        const imageSrc = CATEGORY_IMAGES[cat.slug];

        return (
          <Link
            key={cat.slug}
            href={href}
            className={`home-category${active ? ' home-category--active' : ''}${imageSrc ? ' home-category--photo' : ''}`}
          >
            <span className="home-category__icon" aria-hidden>
              {imageSrc ? (
                <Image
                  src={imageSrc}
                  alt=""
                  width={52}
                  height={52}
                  className="home-category__photo"
                />
              ) : (
                getCategoryEmoji(cat.slug)
              )}
            </span>
            <span className="home-category__label">{cat.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
