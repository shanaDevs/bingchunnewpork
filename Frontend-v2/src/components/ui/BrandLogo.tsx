import Image from 'next/image';

interface BrandLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  src?: string;
  title?: string;
  subtitle?: string;
}

export default function BrandLogo({
  size = 44,
  showText = true,
  className = '',
  src = '/brand/logo.avif',
  title = 'Bing Chun Sri Lanka',
  subtitle = 'Premium Bubble Tea',
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Image
          src={src}
          alt={title}
          fill
          sizes={`${size}px`}
          className="object-contain"
          priority
        />
      </div>
      {showText && (
        <div className="leading-tight min-w-0">
          <p className="font-bold text-base text-fg tracking-tight truncate">{title}</p>
          {subtitle && (
            <p className="text-[10px] text-brand font-semibold tracking-wide">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}
