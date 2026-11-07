'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

/**
 * Syncs the Zustand theme store to the DOM.
 * - Adds/removes the `.dark` class on <html> for Tailwind's dark: variant
 * - Sets data-theme attribute for CSS custom properties
 * Must be rendered once inside the app tree (e.g. inside Providers).
 */
export default function ThemeApplier() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  // Also apply immediately on first paint from localStorage (before hydration)
  useEffect(() => {
    const stored = localStorage.getItem('bc-theme');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const t = parsed?.state?.theme;
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  return null;
}
