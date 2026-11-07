'use client';

import Image from 'next/image';

type Props = {
  badgeTitle?: string;
  badgeSub?: string;
};

export default function ReceiptBrandHeader({
  badgeTitle = 'ADMIN',
  badgeSub = 'Official Report',
}: Props) {
  return (
    <header className="order-receipt__header">
      <div className="order-receipt__brand">
        <div className="order-receipt__logo relative shrink-0" style={{ width: 48, height: 48 }}>
          <Image
            src="/brand/logo.avif"
            alt="Bing Chun"
            fill
            sizes="48px"
            className="object-contain"
          />
        </div>
        <div>
          <p className="order-receipt__brand-name">Bing Chun</p>
          <p className="order-receipt__brand-tag">Bubble Tea · Sri Lanka</p>
        </div>
      </div>
      <div className="order-receipt__report-badge">
        <p className="order-receipt__report-badge-title">{badgeTitle}</p>
        <p className="order-receipt__report-badge-sub">{badgeSub}</p>
      </div>
    </header>
  );
}
