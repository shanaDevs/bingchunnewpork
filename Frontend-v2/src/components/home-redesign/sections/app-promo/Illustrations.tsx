/**
 * Hand-drawn-style SVG artwork for the app promo, modelled on Bing Chun's original brand illustrations:
 * flat cel-shaded fills, a lighter highlight, a darker shade and a thin navy ink line (as on the
 * flying-mascot artwork). No gradients, so no SVG ids that could clash when a piece is drawn twice.
 * All pieces are decorative; the stage wrapper hides them from assistive tech.
 */

const INK = "#1b2b52";

const mango = { light: "#ffe07a", base: "#ffb52e", shade: "#f2901a", deep: "#e0700f" };

/** Isometric cube faces inside a 40×40 box. */
function cubePaths(faces: { top: string; left: string; right: string }, line: string, lineWidth: number) {
  return (
    <>
      <path d="M20 4 36 12 20 20 4 12Z" fill={faces.top} />
      <path d="M4 12 20 20v16L4 28Z" fill={faces.left} />
      <path d="M36 12 20 20v16l16-8Z" fill={faces.right} />
      <path d="M4 12 20 20 36 12M20 20v16" fill="none" stroke={line} strokeWidth={lineWidth * 0.6} strokeLinejoin="round" opacity="0.55" />
      <path d="M20 4 36 12v16l-16 8-16-8V12Z" fill="none" stroke={line} strokeWidth={lineWidth} strokeLinejoin="round" />
    </>
  );
}

/** Juicy mango cube. */
export function MangoCube() {
  return (
    <svg viewBox="0 0 40 40" className="block w-full overflow-visible">
      {cubePaths({ top: mango.light, left: mango.base, right: mango.shade }, INK, 1.6)}
      <path d="M14 10.5 20 7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

/** Glassy ice cube with frosted white edges. */
export function IceCube() {
  return (
    <svg viewBox="0 0 40 40" className="block w-full overflow-visible">
      {cubePaths({ top: "#f6fbff", left: "#d9ecff", right: "#bcdcfa" }, "#6f9fd6", 1.3)}
      <path d="M7 14.5 18 20M6.5 17v9M33 15v6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 9.5 23 7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Two-tone tea leaf, split light/dark along the vein. */
export function TeaLeaf() {
  return (
    <svg viewBox="0 0 60 60" className="block w-full overflow-visible">
      <path d="M6 54C8 30 24 10 54 6Z" fill="#8fcf4e" />
      <path d="M6 54 54 6C52 34 34 52 6 54Z" fill="#5aa532" />
      <path d="M6 54Q30 30 54 6M22 38l-3-11M30 30l-2-12M38 22l-1-9M22 38l11 2M30 30l12 1" fill="none" stroke="#3a7d22" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M14 40C16 30 22 22 30 16" fill="none" stroke="#c4ec8f" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M6 54C8 30 24 10 54 6 52 34 34 52 6 54Zm0 0-4 4" fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Whole ripe mango with a stem and leaf. */
export function Mango() {
  return (
    <svg viewBox="0 0 80 92" className="block w-full overflow-visible">
      <path d="M40 10c22 0 36 20 34 42-2 24-18 38-36 36S8 72 10 54c1-12 8-18 12-26 5-10 8-18 18-18Z" fill={mango.base} />
      <path d="M74 52c-2 24-18 38-36 36-8-1-15-4-20-10 14 4 30 0 40-12 8-10 10-24 6-36 7 6 11 13 10 22Z" fill={mango.shade} />
      <path d="M26 30c4-8 9-13 16-13" fill="none" stroke={mango.light} strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="22" cy="44" rx="3" ry="5" fill="white" opacity="0.8" transform="rotate(20 22 44)" />
      <path d="M40 10c22 0 36 20 34 42-2 24-18 38-36 36S8 72 10 54c1-12 8-18 12-26 5-10 8-18 18-18Z" fill="none" stroke={INK} strokeWidth="1.8" />
      <path d="M40 10c0-4 1-7 3-9" fill="none" stroke="#6b4423" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M43 3c8-4 18-2 22 4-8 4-17 3-22-4Z" fill="#6fbd3e" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Flying drop of mango juice. */
export function Droplet() {
  return (
    <svg viewBox="0 0 20 28" className="block w-full overflow-visible">
      <path d="M10 2c4 8 8 12 8 17a8 8 0 0 1-16 0c0-5 4-9 8-17Z" fill={mango.base} stroke={INK} strokeWidth="1.4" />
      <ellipse cx="7" cy="18" rx="1.6" ry="3" fill="white" opacity="0.85" />
    </svg>
  );
}

/** Four-point sparkle, coloured by the parent's text colour. Same shape as the offer cards'. */
export function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" className="block w-full" fill="currentColor">
      <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" />
    </svg>
  );
}

const orange = { base: "#ff8a1f", shade: "#ea6a10", light: "#ffb04a" };
const skin = "#ffe3d8";

/** Outlined noodle limb ending in a mitten hand or a foot, as on the orange characters in the brand art. */
function Limb({ d, end, r = 6 }: { d: string; end: { x: number; y: number }; r?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <path d={d} fill="none" stroke={skin} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx={end.x} cy={end.y} rx={r} ry={r * 0.85} fill={skin} stroke={INK} strokeWidth="1.6" />
    </>
  );
}

/** Round orange body with cel shading; the face goes on top. */
function OrangeBody() {
  return (
    <>
      <circle cx="60" cy="64" r="34" fill={orange.base} />
      <path d="M94 64a34 34 0 0 1-60 22c18 8 40 2 50-16 4-8 5-18 2-27 5 6 8 13 8 21Z" fill={orange.shade} />
      <path d="M36 52c4-12 14-20 26-21" fill="none" stroke={orange.light} strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="64" r="34" fill="none" stroke={INK} strokeWidth="2" />
    </>
  );
}

/** Orange buddy sitting on the wave: waving with one hand, holding an ice cube up with the other. */
export function OrangeBuddyWave() {
  return (
    <svg viewBox="0 0 124 124" className="block w-full overflow-visible">
      <g transform="translate(6 2) rotate(-14 20 20)">
        {cubePaths({ top: "#f6fbff", left: "#d9ecff", right: "#bcdcfa" }, "#6f9fd6", 1.3)}
        <path d="M7 14.5 18 20M17 9.5 23 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <Limb d="M36 52C30 44 26 36 24 28" end={{ x: 23, y: 25 }} />
      <Limb d="M92 56c8-4 14-10 18-18" end={{ x: 112, y: 34 }} />
      <Limb d="M48 96c-4 6-8 10-14 12" end={{ x: 31, y: 109 }} r={7} />
      <Limb d="M72 97c4 5 8 9 14 11" end={{ x: 89, y: 109 }} r={7} />
      <OrangeBody />
      <ellipse cx="50" cy="58" rx="2.6" ry="3.6" fill={INK} />
      <ellipse cx="70" cy="56" rx="2.6" ry="3.6" fill={INK} />
      <path d="M48 68c6 12 22 12 26-1Z" fill="#8a2a0c" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M54 74c4 3 10 3 13-1" fill="none" stroke="#ff9d8a" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="41" cy="67" rx="5" ry="3" fill="#ff6b4a" opacity="0.45" />
      <ellipse cx="80" cy="64" rx="5" ry="3" fill="#ff6b4a" opacity="0.45" />
    </svg>
  );
}

/** A cube placed inside the cup artwork (cube art is 40 units wide). */
function SplashCube({ x, y, size, rotate }: { x: number; y: number; size: number; rotate: number }) {
  const s = size / 40;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s}) translate(-20 -20)`}>
      {cubePaths({ top: mango.light, left: mango.base, right: mango.shade }, INK, 1.6 / s)}
    </g>
  );
}

const petals = [0, 72, 144, 216, 288];

/**
 * Bing Chun takeaway cup bursting with mango: an orange cup with the white flower mark, a juice splash
 * welling over the rim and mango cubes riding the wave. Drawn upright; the stage tilts it.
 */
export function MangoCup() {
  return (
    <svg viewBox="0 0 220 280" className="block w-full overflow-visible">
      {/* Cup body, right-hand shade and glossy streaks */}
      <path d="M34 110h152l-20 150c-1 9-111 9-112 0Z" fill="#ff9a1f" />
      <path d="M150 110h36l-20 150c-1 5-12 7-26 8Z" fill="#ec7712" />
      <path d="M56 132l-5 40M49 188l-2 16" stroke="white" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
      <path d="M34 110h152l-20 150c-1 9-111 9-112 0Z" fill="none" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />

      {/* Flower mark and wordmark */}
      <g transform="translate(108 186)">
        {petals.map((deg) => (
          <ellipse key={deg} cx="0" cy="-11" rx="7" ry="10.5" fill="white" transform={`rotate(${deg})`} />
        ))}
        <circle r="5.5" fill="#ffc83a" stroke={INK} strokeWidth="1" />
      </g>
      <text x="108" y="230" textAnchor="middle" fill="white" fontSize="15" letterSpacing="1.5" className="font-display-condensed">
        BING CHUN
      </text>

      {/* Back of the rim, with the juice surface inside */}
      <ellipse cx="110" cy="110" rx="78" ry="15" fill="#fff6e6" stroke={INK} strokeWidth="2.2" />
      <ellipse cx="110" cy="110" rx="70" ry="9" fill={mango.deep} />

      {/* Crown splash: five liquid fingers leaping out of the cup, each tip throwing off a drop */}
      <path
        d="M40 112C36 98 30 86 21 76c-5-6 3-13 9-7 8 8 15 18 26 22C55 72 50 56 44 42c-4-10 9-15 13-5 5 13 9 28 15 42 3-20 10-38 23-52 7-7 18-2 15 8-4 15-9 30-6 47 9-17 23-30 40-36 9-3 14 7 7 13-11 9-17 21-12 32 11-7 24-10 38-9 9 1 9 12 0 14-6 1-5 9-3 15Z"
        fill={mango.base}
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Light running up the left edge of each finger, shade down the right */}
      <path
        d="M30 78c6 6 11 12 16 18M50 44c4 12 8 26 12 40M100 34c-6 12-10 26-11 44M146 50c-9 6-15 14-19 24"
        fill="none"
        stroke={mango.light}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M118 96c0-10 2-20 6-30M168 98c4-4 10-6 16-7" fill="none" stroke={mango.shade} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="103" cy="40" rx="2.4" ry="4.5" fill="white" transform="rotate(25 103 40)" />

      {/* Drops thrown off the finger tips */}
      {[
        { x: 14, y: 58, r: 4.5 },
        { x: 50, y: 18, r: 5.5 },
        { x: 120, y: 8, r: 6 },
        { x: 168, y: 30, r: 4.5 },
        { x: 204, y: 74, r: 4 },
      ].map(({ x, y, r }) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill={mango.base} stroke={INK} strokeWidth="1.6" />
          <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.3} fill="white" />
        </g>
      ))}

      <SplashCube x={70} y={98} size={28} rotate={-16} />
      <SplashCube x={128} y={92} size={32} rotate={14} />
      <SplashCube x={150} y={12} size={22} rotate={34} />

      {/* Front lip of the rim, drawn last so the splash rises out of the cup */}
      <path
        d="M32 110a78 15 0 0 0 156 0h-8a70 9 0 0 1-140 0Z"
        fill="#fff6e6"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
