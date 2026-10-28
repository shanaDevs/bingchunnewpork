'use client';

interface MascotCupProps {
  className?: string;
  filled?: boolean;
  size?: 'sm' | 'md';
}

export default function MascotCup({ className = '', filled = false, size = 'md' }: MascotCupProps) {
  const w = size === 'sm' ? 48 : 64;
  const h = size === 'sm' ? 58 : 78;

  return (
    <svg
      className={`mascot-cup ${className}`}
      width={w}
      height={h}
      viewBox="0 0 64 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="mascotCupLid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#307ef2" />
          <stop offset="100%" stopColor="#1a5cd4" />
        </linearGradient>
        <linearGradient id="mascotCupBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={filled ? '#f59e0b' : '#e8f1ff'} />
          <stop offset="100%" stopColor={filled ? '#fbbf24' : '#c5d4f0'} />
        </linearGradient>
      </defs>
      <g className="mascot-cup__straw">
        <path
          d="M48 2 Q56 14 52 30"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <ellipse cx="32" cy="22" rx="24" ry="7" fill="url(#mascotCupLid)" />
      <rect x="10" y="17" width="44" height="9" rx="3" fill="url(#mascotCupLid)" />
      <path
        d="M12 26 L9 68 Q9 74 32 76 Q55 74 55 68 L52 26 Z"
        fill="url(#mascotCupBody)"
        stroke="#307ef2"
        strokeWidth="1.5"
      />
      {filled ? (
        <>
          <circle cx="24" cy="48" r="3" fill="#1a5cd4" opacity="0.6" />
          <circle cx="32" cy="52" r="3" fill="#1a5cd4" opacity="0.5" />
          <circle cx="40" cy="47" r="3" fill="#1a5cd4" opacity="0.55" />
        </>
      ) : (
        <ellipse cx="32" cy="32" rx="16" ry="3" fill="rgba(48,126,242,0.12)" />
      )}
      <text x="32" y="58" textAnchor="middle" fill="#307ef2" fontSize="7" fontWeight="700" fontFamily="Poppins, sans-serif">
        Bing Chun
      </text>
    </svg>
  );
}
