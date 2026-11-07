'use client';

import Image from 'next/image';
import Link from 'next/link';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';

/** Static BOBA100 promo — replace image or href here to customize later. */
export default function MenuHardcodedSpecial() {
  return (
    <article className="menu-boba-offer">
      <Link
        href="/promotions"
        className="menu-boba-offer__image-link"
        aria-label="BOBA100 — LKR 100 OFF on boba orders"
      >
        <Image
          src="/promos/promo-offer-boba100-v2.png"
          alt="BOBA100 — LKR 100 OFF on boba orders"
          width={600}
          height={280}
          className="menu-boba-offer__image"
          priority
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 90vw, 340px"
        />
      </Link>
      <button
        type="button"
        className="menu-boba-offer__cta-hit"
        aria-label="Order now with BOBA100 offer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openOrderModal({ allowSkip: true });
        }}
      />
    </article>
  );
}
