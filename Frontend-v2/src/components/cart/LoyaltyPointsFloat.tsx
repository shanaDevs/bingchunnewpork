'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Gift } from 'lucide-react';
import {
  LOYALTY_FLOAT_EVENT,
  LOYALTY_REWARDS_PULSE_EVENT,
  type LoyaltyFloatDetail,
} from '@/lib/cartCelebration';

const FLOAT_DURATION_S = 2.4;
const FLOAT_CLEANUP_MS = Math.round(FLOAT_DURATION_S * 1000) + 400;
const REWARDS_PULSE_DELAY_MS = Math.round(FLOAT_DURATION_S * 1000) - 200;

type FloatParticle = LoyaltyFloatDetail & {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function centerOf(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function isVisibleRect(rect: DOMRect): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function getFirstVisibleCenter(selector: string): { x: number; y: number } | null {
  const nodes = document.querySelectorAll(selector);
  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    if (isVisibleRect(rect)) return centerOf(rect);
  }
  return null;
}

function getCartSourcePoint(): { x: number; y: number } {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  if (isMobile) {
    const mobileCup = getFirstVisibleCenter('.floating-cup-fab__btn');
    if (mobileCup) return mobileCup;
  }

  return (
    getFirstVisibleCenter('[data-loyalty-source="cart"]:not(.floating-cup-fab__btn)') ??
    getFirstVisibleCenter('.floating-cup-fab__btn') ??
    getFirstVisibleCenter('.site-navbar__cart-btn') ??
    { x: Math.max(window.innerWidth - 72, 48), y: 52 }
  );
}

function getRewardsTargetPoint(): { x: number; y: number } {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Desktop/PC: prefer sidebar Rewards (header spin control is hidden there).
  if (!isMobile) {
    const sidebarRewards = getFirstVisibleCenter(
      '.home-desktop__sidebar [data-loyalty-target="rewards"], .customer-sidebar [data-loyalty-target="rewards"]',
    );
    if (sidebarRewards) return sidebarRewards;
  }

  // Mobile: prefer bottom-nav Rewards (primary loyalty target on phone).
  if (isMobile) {
    const mobileNavRewards = getFirstVisibleCenter(
      '.customer-bottom-nav [data-loyalty-target="rewards"], .mobile-nav-drawer [data-loyalty-target="rewards"]',
    );
    if (mobileNavRewards) return mobileNavRewards;
  }

  // Header rewards control (desktop/tablet when present).
  const headerRewards = getFirstVisibleCenter('.site-navbar [data-loyalty-target="rewards"]');
  if (headerRewards) return headerRewards;

  if (isMobile) {
    const drawerRewards = getFirstVisibleCenter('.mobile-nav-drawer [data-loyalty-target="rewards"]');
    if (drawerRewards) return drawerRewards;
  }

  return (
    getFirstVisibleCenter('[data-loyalty-target="rewards"]') ??
    (document.querySelector('.customer-app-shell--sidebar') && window.innerWidth >= 768
      ? { x: 40, y: window.innerHeight * 0.42 }
      : { x: Math.max(window.innerWidth * 0.72, 48), y: window.innerHeight - 72 })
  );
}

function pulseRewardsTarget(): void {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const sidebarTargets = document.querySelectorAll(
    '.home-desktop__sidebar [data-loyalty-target="rewards"], .customer-sidebar [data-loyalty-target="rewards"]',
  );
  const bottomNavTargets = document.querySelectorAll(
    '.customer-bottom-nav [data-loyalty-target="rewards"]',
  );
  const headerTargets = document.querySelectorAll('.site-navbar [data-loyalty-target="rewards"]');
  const targets =
    isMobile && bottomNavTargets.length
      ? bottomNavTargets
      : !isMobile && sidebarTargets.length
        ? sidebarTargets
        : headerTargets.length
          ? headerTargets
          : document.querySelectorAll('[data-loyalty-target="rewards"]');
  targets.forEach((el) => {
    el.classList.add('loyalty-rewards-pulse');
    window.setTimeout(() => el.classList.remove('loyalty-rewards-pulse'), 700);
  });
  window.dispatchEvent(new CustomEvent(LOYALTY_REWARDS_PULSE_EVENT));
}

function formatFloatLabel(detail: LoyaltyFloatDetail): { primary: string; secondary: string } {
  const { pointsEarned, pointsDelta, direction, subtotal, minOrderToEarn } = detail;

  if (pointsEarned > 0) {
    const deltaLabel =
      pointsDelta !== 0
        ? `${pointsDelta > 0 ? '+' : ''}${pointsDelta} pts`
        : direction === 'add'
          ? 'Added'
          : 'Updated';
    return {
      primary: deltaLabel,
      secondary: `${pointsEarned} pts this order`,
    };
  }

  const remaining = Math.max(0, minOrderToEarn - subtotal);
  if (remaining > 0) {
    return {
      primary: direction === 'add' ? '+0 pts' : '−0 pts',
      secondary: `LKR ${remaining.toLocaleString()} more to earn`,
    };
  }

  return {
    primary: direction === 'add' ? '+0 pts' : '−0 pts',
    secondary: '0 pts this order',
  };
}

function FloatingGift({ particle }: { particle: FloatParticle }) {
  const label = formatFloatLabel(particle);
  const isAdd = particle.direction === 'add';

  return (
    <motion.div
      className={`loyalty-points-float ${isAdd ? 'loyalty-points-float--add' : 'loyalty-points-float--remove'}`}
      style={{
        position: 'fixed',
        zIndex: 9999,
        pointerEvents: 'none',
        x: '-50%',
        y: '-50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.35rem',
      }}
      initial={{
        left: particle.from.x,
        top: particle.from.y,
        opacity: 0,
        scale: 0.45,
      }}
      animate={{
        left: particle.to.x,
        top: particle.to.y,
        opacity: [0, 0.85, 1, 1, 0.85, 0],
        scale: [0.45, 0.95, 1.05, 1, 0.98, 0.8],
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: FLOAT_DURATION_S, ease: [0.33, 0, 0.2, 1] }}
    >
      <span
        className="loyalty-points-float__icon-wrap"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '2.75rem',
          height: '2.75rem',
          borderRadius: '0.75rem',
          background: isAdd
            ? 'rgba(48, 126, 242, 0.14)'
            : 'rgba(148, 163, 184, 0.2)',
          border: isAdd
            ? '1px solid rgba(48, 126, 242, 0.28)'
            : '1px solid rgba(148, 163, 184, 0.35)',
          color: isAdd ? 'var(--color-brand, #307ef2)' : '#64748b',
          boxShadow: isAdd
            ? '0 8px 22px rgba(37, 99, 235, 0.28), 0 0 0 3px rgba(255, 255, 255, 0.85)'
            : '0 8px 18px rgba(100, 116, 139, 0.28), 0 0 0 3px rgba(255, 255, 255, 0.85)',
        }}
      >
        <Gift size={20} strokeWidth={2.25} aria-hidden />
      </span>
      <span
        className="loyalty-points-float__label"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.1rem',
          marginTop: '0.35rem',
          padding: '0.35rem 0.55rem',
          borderRadius: '0.65rem',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.28)',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            lineHeight: 1.2,
            color: isAdd ? '#60a5fa' : '#94a3b8',
            whiteSpace: 'nowrap',
          }}
        >
          {label.primary}
        </span>
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'rgba(255, 255, 255, 0.9)',
            whiteSpace: 'nowrap',
          }}
        >
          {label.secondary}
        </span>
      </span>
    </motion.div>
  );
}

export default function LoyaltyPointsFloat() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [particles, setParticles] = useState<FloatParticle[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function spawnFloat(detail: LoyaltyFloatDetail) {
      const from = detail.direction === 'add' ? getCartSourcePoint() : getRewardsTargetPoint();
      const to = detail.direction === 'add' ? getRewardsTargetPoint() : getCartSourcePoint();
      const id = Date.now() + Math.random();

      setParticles((prev) => [...prev, { ...detail, id, from, to }]);

      window.setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== id));
      }, FLOAT_CLEANUP_MS);

      if (detail.direction === 'add') {
        window.setTimeout(pulseRewardsTarget, REWARDS_PULSE_DELAY_MS);
      }
    }

    function onFloat(e: Event) {
      const detail = (e as CustomEvent<LoyaltyFloatDetail>).detail;
      if (!detail) return;
      requestAnimationFrame(() => spawnFloat(detail));
    }

    window.addEventListener(LOYALTY_FLOAT_EVENT, onFloat);
    return () => window.removeEventListener(LOYALTY_FLOAT_EVENT, onFloat);
  }, []);

  if (!mounted || reduceMotion === true) return null;

  return createPortal(
    <div className="loyalty-points-float-root" aria-hidden style={{ pointerEvents: 'none' }}>
      <AnimatePresence>
        {particles.map((particle) => (
          <FloatingGift key={particle.id} particle={particle} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
