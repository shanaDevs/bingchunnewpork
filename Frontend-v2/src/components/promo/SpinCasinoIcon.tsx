'use client';

type SpinCasinoIconProps = {
  size?: number;
  className?: string;
};

/** Mini casino wheel — always spinning with blinking rim lights. */
export default function SpinCasinoIcon({ size = 22, className = '' }: SpinCasinoIconProps) {
  const pegCount = 8;
  const pegs = Array.from({ length: pegCount }, (_, i) => i);

  return (
    <span
      className={`spin-casino-icon relative inline-flex items-center justify-center ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="spin-casino-icon__glow absolute inset-0 rounded-full bg-accent/30 blur-[3px]" />
      <span
        className="spin-casino-icon__wheel absolute inset-[1px] rounded-full border border-[#1a5cd4]"
        style={{
          background:
            'conic-gradient(from 0deg, #307ef2 0deg 45deg, #ffd700 45deg 90deg, #e63946 90deg 135deg, #307ef2 135deg 180deg, #ffd700 180deg 225deg, #e63946 225deg 270deg, #307ef2 270deg 315deg, #ffd700 315deg 360deg)',
        }}
      />
      <span className="spin-casino-icon__hub absolute left-1/2 top-1/2 z-[2] h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-navy-card shadow-inner" />
      {pegs.map((i) => {
        const deg = i * (360 / pegCount);
        const rad = ((deg - 90) * Math.PI) / 180;
        const r = 46;
        return (
          <span
            key={deg}
            className="spin-casino-icon__light absolute z-[3] h-[14%] w-[14%] rounded-full border border-white/70"
            style={{
              left: `${50 + r * Math.cos(rad)}%`,
              top: `${50 + r * Math.sin(rad)}%`,
              transform: 'translate(-50%, -50%)',
              animationDelay: `${i * 0.12}s`,
            }}
          />
        );
      })}
      <span className="spin-casino-icon__pointer absolute -top-[8%] left-1/2 z-[4] -translate-x-1/2">
        <span className="block h-0 w-0 border-l-[4px] border-r-[4px] border-b-[7px] border-l-transparent border-r-transparent border-b-accent drop-shadow-sm" />
      </span>
    </span>
  );
}
