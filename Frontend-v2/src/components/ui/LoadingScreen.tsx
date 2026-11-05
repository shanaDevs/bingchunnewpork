'use client';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

interface LoadingScreenProps {
  isVisible: boolean;
}

const bubbles = [
  { x: '15%', y: '25%', size: 14, delay: 0 },
  { x: '80%', y: '18%', size: 10, delay: 0.3 },
  { x: '55%', y: '70%', size: 18, delay: 0.5 },
  { x: '25%', y: '65%', size: 12, delay: 0.2 },
  { x: '88%', y: '55%', size: 16, delay: 0.4 },
];

export default function LoadingScreen({ isVisible }: LoadingScreenProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="loading"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden gradient-hero"
        >
          {/* Blue glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-30"
              style={{ background: 'radial-gradient(circle, #5c9af5 0%, transparent 70%)' }} />
          </div>

          {/* Floating bubbles */}
          {bubbles.map((b, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                left: b.x,
                top: b.y,
                width: b.size,
                height: b.size,
                background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.5), rgba(48,126,242,0.15))',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
              animate={{ y: [0, -18, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, delay: b.delay, ease: 'easeInOut' }}
            />
          ))}

          {/* Mascot logo — bouncing */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: [0, -14, 0] }}
            transition={{
              scale: { duration: 0.5, ease: 'backOut' },
              opacity: { duration: 0.5 },
              y: { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
            }}
            className="relative z-10 mb-6"
          >
            <Image
              src="/brand/mascot-hero.avif"
              alt="Bing Chun Mascot"
              width={180}
              height={180}
              className="object-contain drop-shadow-2xl"
              priority
            />
          </motion.div>

          {/* Brand name */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-center z-10"
          >
            <h1 className="text-3xl font-bold tracking-tight text-white">Bing Chun</h1>
            <p className="text-sm mt-1 text-white/70">Premium Bubble Tea &amp; Ice Cream</p>
          </motion.div>

          {/* Loading dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-10 z-10 flex flex-col items-center gap-3"
          >
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="rounded-full bg-white"
                  style={{ width: 8, height: 8 }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <p className="text-white/60 text-sm">Preparing your treats...</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
