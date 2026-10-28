'use client';

import { motion } from 'framer-motion';

interface TagBadgeProps {
  tag: string;
  animated?: boolean;
}

const tagStyles: Record<string, string> = {
  Popular: 'tag-popular',
  New: 'tag-new',
  'Best Seller': 'tag-bestseller',
  Classic: 'tag-classic',
  Signature: 'tag-signature',
  'Rs.200 Only': 'tag-rs200',
};

export default function TagBadge({ tag, animated = false }: TagBadgeProps) {
  const cls = `tag-badge tag-badge--bc ${tagStyles[tag] || 'tag-classic'}`;

  if (!animated) {
    return <span className={cls}>{tag}</span>;
  }

  return (
    <motion.span
      className={cls}
      initial={{ opacity: 0, scale: 0.85, x: -6 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26, delay: 0.05 }}
      whileHover={{ scale: 1.06 }}
    >
      {tag}
    </motion.span>
  );
}
