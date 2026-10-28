'use client';

import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <div
      className={`theme-toggle inline-flex items-center rounded-xl border border-navy-border bg-navy-light p-1 shadow-sm ${className}`}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          !isDark ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-[var(--color-text)]'
        }`}
        aria-pressed={!isDark}
        aria-label="Light theme"
      >
        <Sun size={14} />
        {showLabel && <span className="hidden sm:inline">Light</span>}
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isDark ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-[var(--color-text)]'
        }`}
        aria-pressed={isDark}
        aria-label="Dark theme"
      >
        <Moon size={14} />
        {showLabel && <span className="hidden sm:inline">Dark</span>}
      </button>
    </div>
  );
}
