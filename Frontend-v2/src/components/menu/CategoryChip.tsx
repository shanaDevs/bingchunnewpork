'use client';

import { motion } from 'framer-motion';

interface CategoryChipProps {
  name: string;
  active: boolean;
  onSelect: () => void;
  index?: number;
}

const spring = { type: 'spring' as const, stiffness: 480, damping: 32 };

export default function CategoryChip({
  name,
  active,
  onSelect,
  index = 0,
}: CategoryChipProps) {
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      layout
      initial={{ opacity: 0, y: 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 0.28), ...spring }}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={onSelect}
      className={`category-chip category-chip--app relative inline-flex items-center shrink-0 overflow-hidden ${
        active ? 'category-chip--app-active' : 'category-chip--app-idle'
      }`}
    >
      {active && (
        <motion.span
          layoutId="category-chip-active"
          className="category-chip__glow absolute inset-0 rounded-full"
          transition={spring}
          aria-hidden
        />
      )}

      <span className="relative z-[1] whitespace-nowrap">{name}</span>
    </motion.button>
  );
}
