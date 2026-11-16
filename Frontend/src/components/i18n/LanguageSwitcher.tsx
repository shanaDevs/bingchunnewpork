'use client';

import { Check, ChevronDown, Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSiteLanguage } from '@/components/i18n/SiteTranslator';
import { SITE_LANGUAGES } from '@/lib/siteLanguage';
import { cn } from '@/lib/utils';

type LanguageSwitcherProps = {
  className?: string;
  /** Dark/hero style (white text) vs light page style. */
  tone?: 'light' | 'dark';
};

/** Compact EN / 中文 control for chrome that is not SiteHeader. */
export default function LanguageSwitcher({ className, tone = 'light' }: LanguageSwitcherProps) {
  const { lang, setLang } = useSiteLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = SITE_LANGUAGES.find((item) => item.code === lang) ?? SITE_LANGUAGES[0];
  const onDark = tone === 'dark';

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative notranslate', className)}>
      <button
        type="button"
        aria-label={`Language: ${active.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Language"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors',
          onDark
            ? 'text-white ring-white/30 hover:bg-white/10'
            : 'text-[var(--color-text,#0f2147)] ring-[var(--color-navy-border,#d5dde8)] hover:bg-black/5',
        )}
      >
        <Globe className="size-4" aria-hidden="true" />
        <span>{active.short}</span>
        <ChevronDown className={cn('size-3.5 opacity-80 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Choose language"
          className={cn(
            'absolute top-[calc(100%+0.4rem)] right-0 z-50 min-w-40 overflow-hidden rounded-2xl p-1 shadow-lg ring-1 ring-inset',
            onDark ? 'bg-[#163a7a] text-white ring-white/20' : 'bg-white text-[#0f2147] ring-black/10',
          )}
        >
          {SITE_LANGUAGES.map((item) => {
            const selected = item.code === lang;
            return (
              <li key={item.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setOpen(false);
                    setLang(item.code);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors',
                    selected
                      ? onDark
                        ? 'bg-white/10'
                        : 'bg-black/5'
                      : onDark
                        ? 'hover:bg-white/10'
                        : 'hover:bg-black/5',
                  )}
                >
                  <Check className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
