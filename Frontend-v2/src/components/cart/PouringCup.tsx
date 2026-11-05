'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useState } from 'react';

export type PouringCupSize = 'sm' | 'md' | 'lg' | 'xl';

export interface PouringCupProps {
  fillLevel: number;
  fillFrom?: number;
  pouring?: boolean;
  size?: PouringCupSize;
  inverted?: boolean;
  itemCount?: number;
  className?: string;
  showLabel?: boolean;
}

const SIZE_MAP: Record<PouringCupSize, { w: number; h: number }> = {
  sm: { w: 22, h: 28 },
  md: { w: 28, h: 34 },
  lg: { w: 48, h: 58 },
  xl: { w: 88, h: 106 },
};

const BODY_TOP = 26;
const BODY_BOTTOM = 68;

export default function PouringCup({
  fillLevel,
  fillFrom,
  pouring = false,
  size = 'md',
  inverted = false,
  itemCount,
  className = '',
  showLabel = false,
}: PouringCupProps) {
  const uid = useId().replace(/:/g, '');
  const reduceMotion = useReducedMotion();
  const { w, h } = SIZE_MAP[size];

  const targetFill = Math.max(0, Math.min(1, fillLevel));
  const startFill = pouring && fillFrom != null ? fillFrom : targetFill;
  const [animatedFill, setAnimatedFill] = useState(targetFill);
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setMotionReady(true);
  }, []);

  useEffect(() => {
    if (!motionReady) return;
    if (pouring && fillFrom != null) {
      setAnimatedFill(fillFrom);
      const frame = requestAnimationFrame(() => {
        setAnimatedFill(targetFill);
      });
      return () => cancelAnimationFrame(frame);
    }
    setAnimatedFill(targetFill);
  }, [motionReady, pouring, fillFrom, targetFill, fillLevel]);

  const fill = motionReady ? animatedFill : targetFill;
  const bodyHeight = BODY_BOTTOM - BODY_TOP;
  const fillHeight = bodyHeight * fill;
  const fillY = BODY_BOTTOM - fillHeight;

  const lidGrad = `pourLid-${uid}`;
  const liquidGrad = `pourLiquid-${uid}`;
  const streamGrad = `pourStream-${uid}`;
  const bodyGrad = `pourBody-${uid}`;
  const clipId = `pourClip-${uid}`;

  const strokeColor = inverted ? 'rgba(255,255,255,0.85)' : '#307ef2';
  const emptyBodyTop = inverted ? 'rgba(255,255,255,0.15)' : '#e8f1ff';
  const emptyBodyBottom = inverted ? 'rgba(255,255,255,0.08)' : '#c5d4f0';

  const fillTransition = reduceMotion
    ? { duration: 0.15 }
    : pouring
      ? { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const }
      : { type: 'spring' as const, stiffness: 280, damping: 24 };

  return (
    <span className={`pouring-cup relative inline-flex shrink-0 ${className}`}>
      <svg
        width={w}
        height={h}
        viewBox="0 0 64 78"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id={lidGrad} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={inverted ? '#fff' : '#307ef2'} />
            <stop offset="100%" stopColor={inverted ? '#dbeafe' : '#1a5cd4'} />
          </linearGradient>
          <linearGradient id={liquidGrad} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
          <linearGradient id={streamGrad} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0" />
            <stop offset="20%" stopColor="#fbbf24" stopOpacity="1" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="1" />
          </linearGradient>
          <linearGradient id={bodyGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={emptyBodyTop} />
            <stop offset="100%" stopColor={emptyBodyBottom} />
          </linearGradient>
          <clipPath id={clipId}>
            <path d="M12 26 L9 68 Q9 74 32 76 Q55 74 55 68 L52 26 Z" />
          </clipPath>
        </defs>

        {/* Pour stream — above cup */}
        {motionReady && pouring && !reduceMotion && (
          <g className="pouring-cup__stream">
            <motion.rect
              x="29"
              y="0"
              width="6"
              rx="3"
              fill={`url(#${streamGrad})`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 28, opacity: [0, 1, 1, 0.85] }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
            {[0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={32 + (i - 1) * 3}
                r="2"
                fill="#fbbf24"
                initial={{ cy: 0, opacity: 0 }}
                animate={{ cy: [0, 24, 26], opacity: [0, 1, 0] }}
                transition={{
                  duration: 0.55,
                  delay: i * 0.12,
                  repeat: 2,
                  ease: 'easeIn',
                }}
              />
            ))}
          </g>
        )}

        <path
          d="M48 2 Q56 14 52 30"
          stroke={inverted ? 'rgba(255,255,255,0.6)' : '#94a3b8'}
          strokeWidth="2"
          strokeLinecap="round"
        />

        <ellipse cx="32" cy="22" rx="24" ry="7" fill={`url(#${lidGrad})`} />
        <rect x="10" y="17" width="44" height="9" rx="3" fill={`url(#${lidGrad})`} />

        <path
          d="M12 26 L9 68 Q9 74 32 76 Q55 74 55 68 L52 26 Z"
          fill={`url(#${bodyGrad})`}
          stroke={strokeColor}
          strokeWidth="1.5"
        />

        <g clipPath={`url(#${clipId})`}>
          {motionReady ? (
            <motion.rect
              x="8"
              width="48"
              fill={`url(#${liquidGrad})`}
              initial={{ y: fillY, height: fillHeight }}
              animate={{ y: fillY, height: fillHeight }}
              transition={fillTransition}
            />
          ) : (
            <rect
              x="8"
              y={fillY}
              width="48"
              height={fillHeight}
              fill={`url(#${liquidGrad})`}
            />
          )}

          {fill > 0.05 && (
            <ellipse
              cx="32"
              cy={fillY + 2}
              rx="18"
              ry="3"
              fill="rgba(255,255,255,0.4)"
            />
          )}

          {motionReady && pouring && !reduceMotion && (
            <motion.ellipse
              cx="32"
              rx="14"
              ry="2"
              fill="rgba(255,255,255,0.55)"
              initial={{ cy: fillY + 4, opacity: 0, rx: 4 }}
              animate={{ cy: fillY + 2, opacity: [0, 0.8, 0], rx: [4, 16, 20] }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          )}

          {fill > 0.2 && (
            <>
              <circle
                cx="22"
                cy={fillY + fillHeight * 0.45}
                r="2.5"
                fill="#1a5cd4"
                opacity="0.45"
              />
              <circle
                cx="32"
                cy={fillY + fillHeight * 0.6}
                r="2"
                fill="#1a5cd4"
                opacity="0.4"
              />
              <circle
                cx="40"
                cy={fillY + fillHeight * 0.38}
                r="2.5"
                fill="#1a5cd4"
                opacity="0.45"
              />
            </>
          )}
        </g>

        {(size === 'lg' || size === 'xl' || showLabel) && (
          <text
            x="32"
            y="58"
            textAnchor="middle"
            fill={inverted ? '#fff' : '#307ef2'}
            fontSize="7"
            fontWeight="700"
            fontFamily="Poppins, sans-serif"
          >
            Bing Chun
          </text>
        )}
      </svg>

      {itemCount != null && itemCount > 0 && (
        <span
          className={`pouring-cup__badge absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold leading-none ${
            inverted ? 'bg-white text-brand' : 'bg-brand text-white'
          }`}
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </span>
  );
}
