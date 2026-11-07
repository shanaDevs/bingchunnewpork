'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import MascotCup from './MascotCup';
import { POSE_BUBBLE, type MascotPose } from './mascotAnimations';

interface AnimatedMascotProps {
  pose?: MascotPose;
  visible?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showCup?: boolean;
  showBubble?: boolean;
}

const SIZE_MAP = {
  sm: { img: 120, class: 'w-[120px] h-[120px]' },
  md: { img: 160, class: 'w-[160px] h-[160px]' },
  lg: { img: 200, class: 'w-[200px] h-[200px]' },
};

function getBodyAnimation(pose: MascotPose, reduceMotion: boolean | null) {
  if (reduceMotion) return { y: 0, rotate: 0, x: 0 };

  switch (pose) {
    case 'peek-side':
      return {
        x: [40, 0, 0],
        y: [0, -4, 0],
        rotate: [8, 2, 2],
      };
    case 'cup-offer':
      return {
        y: [0, -6, 0],
        rotate: [-3, 3, -3],
      };
    case 'delivery':
      return {
        y: [0, -10, 0],
        x: [0, 4, 0],
        rotate: [-2, 2, -2],
      };
    case 'takeaway':
      return {
        y: [0, -8, 0],
        rotate: [0, -4, 4, 0],
      };
    case 'wave':
      return {
        y: [0, -12, 0],
        rotate: [0, -6, 6, 0],
      };
    case 'celebrate':
      return {
        y: [0, -20, 0, -14, 0],
        rotate: [0, -10, 10, -6, 0],
        scale: [1, 1.05, 1, 1.03, 1],
      };
    default:
      return { y: [0, -8, 0] };
  }
}

function getTransition(pose: MascotPose, reduceMotion: boolean | null) {
  if (reduceMotion) return { duration: 0 };
  const duration = pose === 'celebrate' ? 2.2 : pose === 'peek-side' ? 0.55 : 2.8;
  return {
    duration,
    repeat: pose === 'peek-side' ? 0 : Infinity,
    ease: 'easeInOut' as const,
  };
}

export default function AnimatedMascot({
  pose = 'idle',
  visible = true,
  size = 'md',
  className = '',
  showCup = true,
  showBubble = true,
}: AnimatedMascotProps) {
  const reduceMotion = useReducedMotion();
  const dims = SIZE_MAP[size];
  const bubble = POSE_BUBBLE[pose];

  const hiddenX = pose === 'peek-side' ? 120 : 0;

  return (
    <motion.div
      className={`animated-mascot relative ${className}`}
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        x: visible ? 0 : hiddenX,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      aria-hidden={!visible}
    >
      {showBubble && bubble && (
        <motion.div
          className="animated-mascot__bubble absolute -top-2 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-semibold text-white shadow-lg"
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6, scale: visible ? 1 : 0.9 }}
          transition={{ delay: pose === 'peek-side' ? 0.2 : 0 }}
        >
          {bubble}
        </motion.div>
      )}

      <motion.div
        className="animated-mascot__body relative"
        animate={visible ? getBodyAnimation(pose, reduceMotion) : undefined}
        transition={getTransition(pose, reduceMotion)}
      >
        <Image
          src="/brand/mascot-hero.avif"
          alt=""
          width={dims.img}
          height={dims.img}
          className={`${dims.class} object-contain drop-shadow-xl`}
          priority={false}
        />

        {showCup && (pose === 'cup-offer' || pose === 'peek-side' || pose === 'idle' || pose === 'delivery' || pose === 'takeaway') && (
          <motion.div
            className="animated-mascot__cup absolute z-10"
            animate={
              reduceMotion
                ? undefined
                : {
                    y: [0, -4, 0],
                    rotate: [12, 16, 12],
                  }
            }
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <MascotCup size={size === 'lg' ? 'md' : 'sm'} filled={pose === 'delivery' || pose === 'takeaway'} />
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
