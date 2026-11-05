'use client';

/** Twemoji PNG for glyphs missing from Windows 10 Segoe UI Emoji (e.g. 🧋). */
const TWEMOJI_BY_SLUG: Record<string, string> = {
  'bubble-tea': '1f9cb',
};

interface CategoryEmojiProps {
  slug: string;
  emoji: string;
  className?: string;
}

export default function CategoryEmoji({ slug, emoji, className }: CategoryEmojiProps) {
  const codepoint = TWEMOJI_BY_SLUG[slug];
  if (codepoint) {
    return (
      <img
        src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoint}.png`}
        alt=""
        className={className ?? 'h-4 w-4 object-contain'}
        aria-hidden
        draggable={false}
      />
    );
  }

  return <span className={className}>{emoji}</span>;
}
