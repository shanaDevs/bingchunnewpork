'use client';

import { useLayoutEffect, useEffect } from 'react';
import { useThemeStore, type Theme } from '@/store/themeStore';

const THEME_COLORS: Record<Theme, string> = {
  dark: '#080b18',
  light: '#dde3ed',
};

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = localStorage.getItem('bc-theme');
    if (!raw) return 'light';
    const parsed = JSON.parse(raw);
    return parsed?.state?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme && root.style.colorScheme === theme) {
    const wantsDark = theme === 'dark';
    if (wantsDark === root.classList.contains('dark')) return;
  }
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;

  // Required for Tailwind's @custom-variant dark (&:is(.dark *))
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useLayoutEffect(() => {
    const stored = readStoredTheme();
    if (stored !== useThemeStore.getState().theme) {
      useThemeStore.setState({ theme: stored });
    }
    applyTheme(stored);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return useThemeStore.persist.onFinishHydration(() => {
      applyTheme(useThemeStore.getState().theme);
    });
  }, []);

  return <>{children}</>;
}
