'use client';

type MedalTier = 'gold' | 'silver' | 'bronze';

const MEDAL = {
  gold: {
    outerRim: '#C8940A',
    diskTop: '#F5D84A',
    diskMid: '#E8B923',
    diskBot: '#A07010',
    gloss: 'rgba(255,255,240,0.55)',
    glossEdge: 'rgba(255,255,220,0)',
    wreath: '#B8880C',
    wreathLight: '#F0D060',
    center: '#E8C832',
    centerHigh: '#FFF0A0',
    numColor: '#7C4A03',
  },
  silver: {
    outerRim: '#6B7B8C',
    diskTop: '#EAEFF4',
    diskMid: '#B0BEC8',
    diskBot: '#607080',
    gloss: 'rgba(255,255,255,0.65)',
    glossEdge: 'rgba(255,255,255,0)',
    wreath: '#8090A0',
    wreathLight: '#D8E4EE',
    center: '#C8D4DC',
    centerHigh: '#F0F4F8',
    numColor: '#2E3D50',
  },
  bronze: {
    outerRim: '#8B4E1A',
    diskTop: '#E8A060',
    diskMid: '#C07030',
    diskBot: '#7A3E10',
    gloss: 'rgba(255,230,200,0.50)',
    glossEdge: 'rgba(255,200,160,0)',
    wreath: '#9A5520',
    wreathLight: '#E8A048',
    center: '#C87838',
    centerHigh: '#F0C090',
    numColor: '#3E1A06',
  },
} as const;

function tierForRank(rank: number): MedalTier | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

/** A single laurel leaf path, to be rotated around the wreath ring */
function LaurelLeaf({ color, lightColor }: { color: string; lightColor: string }) {
  return (
    <>
      {/* left side leaf sprig at angle 0, to be rotated */}
      <ellipse cx="0" cy="-2" rx="1.2" ry="2.5" fill={color} transform="rotate(-25)" />
      <ellipse cx="0" cy="-2" rx="0.5" ry="1.5" fill={lightColor} transform="rotate(-25)" opacity="0.6" />
    </>
  );
}

export default function RankMedalBadge({ rank, className = '' }: { rank: number; className?: string }) {
  const tier = tierForRank(rank);

  if (!tier) {
    return (
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-bold text-indigo-400 ${className}`}>
        #{rank}
      </span>
    );
  }

  const s = MEDAL[tier];
  const id = `medal-${tier}`;

  // Laurel leaves: 8 per side, rotated around the medal ring at r=14.5
  const leftLeafAngles  = [-70, -55, -40, -25, -10,  5, 20, 35];
  const rightLeafAngles = [ 70,  55,  40,  25,  10, -5,-20,-35];

  return (
    <span className={`inline-block shrink-0 ${className}`} aria-label={`Rank ${rank}`}>
      <svg width="56" height="68" viewBox="0 0 56 68" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Disk gradient: bright top → rich mid → dark bottom */}
          <radialGradient id={`${id}-disk`} cx="40%" cy="30%" r="70%">
            <stop offset="0%" stopColor={s.diskTop} />
            <stop offset="45%" stopColor={s.diskMid} />
            <stop offset="100%" stopColor={s.diskBot} />
          </radialGradient>
          {/* Gloss overlay — top-left bright strip */}
          <linearGradient id={`${id}-gloss`} x1="20%" y1="0%" x2="80%" y2="80%">
            <stop offset="0%" stopColor={s.gloss} />
            <stop offset="55%" stopColor={s.glossEdge} />
          </linearGradient>
          {/* Center circle gradient */}
          <radialGradient id={`${id}-center`} cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor={s.centerHigh} />
            <stop offset="100%" stopColor={s.center} />
          </radialGradient>
          {/* Ribbon gradient */}
          <linearGradient id={`${id}-rib`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7A0808" />
            <stop offset="35%" stopColor="#CC1212" />
            <stop offset="65%" stopColor="#CC1212" />
            <stop offset="100%" stopColor="#7A0808" />
          </linearGradient>
          <linearGradient id={`${id}-rib2`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5A0606" />
            <stop offset="40%" stopColor="#AA0E0E" />
            <stop offset="100%" stopColor="#5A0606" />
          </linearGradient>
        </defs>

        {/* ── Ribbons (behind medal) ── */}
        {/* Left ribbon */}
        <g>
          <polygon points="20,36 26,36 19,58 13,58" fill={`url(#${id}-rib2)`} />
          <polygon points="21,36 25,36 18,56 16,50" fill={`url(#${id}-rib)`} opacity="0.9" />
          {/* Notch cut at bottom */}
          <polygon points="13,58 19,58 16,52" fill="#3D0000" />
        </g>
        {/* Right ribbon */}
        <g>
          <polygon points="36,36 30,36 37,58 43,58" fill={`url(#${id}-rib2)`} />
          <polygon points="35,36 31,36 38,56 40,50" fill={`url(#${id}-rib)`} opacity="0.9" />
          {/* Notch cut at bottom */}
          <polygon points="43,58 37,58 40,52" fill="#3D0000" />
        </g>

        {/* ── Medal disk ── */}
        <circle cx="28" cy="24" r="22" fill={s.outerRim} />
        <circle cx="28" cy="24" r="20" fill={`url(#${id}-disk)`} />

        {/* ── Gloss sheen ── */}
        <ellipse cx="23" cy="15" rx="11" ry="8" fill={`url(#${id}-gloss)`} />

        {/* ── Laurel wreath ring ── */}
        {/* Left sprigs */}
        {leftLeafAngles.map((deg, i) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const lx = 28 + 15 * Math.cos(rad);
          const ly = 24 + 15 * Math.sin(rad);
          const rot = deg;
          return (
            <g key={`ll-${i}`} transform={`translate(${lx},${ly}) rotate(${rot})`}>
              <ellipse rx="1.4" ry="3.2" fill={s.wreath} />
              <ellipse rx="0.6" ry="1.8" fill={s.wreathLight} opacity="0.7" />
            </g>
          );
        })}
        {/* Right sprigs (mirrored) */}
        {rightLeafAngles.map((deg, i) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const lx = 28 + 15 * Math.cos(rad);
          const ly = 24 + 15 * Math.sin(rad);
          const rot = deg;
          return (
            <g key={`rl-${i}`} transform={`translate(${lx},${ly}) rotate(${rot})`}>
              <ellipse rx="1.4" ry="3.2" fill={s.wreath} />
              <ellipse rx="0.6" ry="1.8" fill={s.wreathLight} opacity="0.7" />
            </g>
          );
        })}

        {/* ── Center circle ── */}
        <circle cx="28" cy="24" r="10.5" fill={`url(#${id}-center)`} />
        <circle cx="28" cy="24" r="10.5" fill="none" stroke={s.outerRim} strokeWidth="0.6" />

        {/* ── Rank number ── */}
        <text
          x="28"
          y="25"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={s.numColor}
          fontSize="11"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, Arial, sans-serif"
        >
          {rank}
        </text>

        {/* ── Outer rim ring ── */}
        <circle cx="28" cy="24" r="22" fill="none" stroke={s.outerRim} strokeWidth="1" opacity="0.7" />
      </svg>
    </span>
  );
}
