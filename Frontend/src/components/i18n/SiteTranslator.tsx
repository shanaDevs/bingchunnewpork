'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  persistSiteLang,
  readSiteLang,
  type SiteLang,
} from '@/lib/siteLanguage';

/** Re-apply Google Translate after Next.js client navigations. */
function reapplyGoogleTranslate(lang: SiteLang) {
  if (lang === 'en') return;
  const select = document.querySelector<HTMLSelectElement>('.goog-te-combo');
  if (!select) return;
  const target = lang;
  if (select.value !== target) {
    select.value = target;
    select.dispatchEvent(new Event('change'));
    return;
  }
  // Force a refresh cycle so newly mounted React text is translated.
  select.value = 'en';
  select.dispatchEvent(new Event('change'));
  window.setTimeout(() => {
    select.value = target;
    select.dispatchEvent(new Event('change'));
  }, 50);
}

type SiteLanguageContextValue = {
  lang: SiteLang;
  ready: boolean;
  setLang: (lang: SiteLang) => void;
};

const SiteLanguageContext = createContext<SiteLanguageContextValue>({
  lang: 'en',
  ready: false,
  setLang: () => undefined,
});

export function useSiteLanguage() {
  return useContext(SiteLanguageContext);
}

type GoogleTranslateHost = {
  googleTranslateElementInit?: () => void;
  google?: {
    translate?: {
      TranslateElement: new (
        options: {
          pageLanguage: string;
          includedLanguages?: string;
          autoDisplay?: boolean;
        },
        elementId: string,
      ) => void;
    };
  };
};

/**
 * Loads Google Website Translator once for the whole shop.
 * Language changes set the googtrans cookie and reload so every page
 * (including client-navigated ones) translates correctly.
 */
export default function SiteTranslatorProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lang, setLangState] = useState<SiteLang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = readSiteLang();
    setLangState(current);
    document.documentElement.lang = current === 'zh-CN' ? 'zh-CN' : 'en';
    // Keep cookie in sync if the user only has localStorage set.
    persistSiteLang(current);

    const host = window as unknown as GoogleTranslateHost;

    host.googleTranslateElementInit = () => {
      try {
        const TranslateElement = host.google?.translate?.TranslateElement;
        if (TranslateElement) {
          // eslint-disable-next-line no-new
          new TranslateElement(
            {
              pageLanguage: 'en',
              includedLanguages: 'en,zh-CN',
              autoDisplay: false,
            },
            'google_translate_element',
          );
        }
      } catch {
        // Widget init can fail offline / with blockers — language UI still works via reload.
      }
      setReady(true);
    };

    const existing = document.getElementById('google-translate-script') as HTMLScriptElement | null;
    if (existing) {
      if (host.google?.translate?.TranslateElement) host.googleTranslateElementInit();
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-translate-script';
    script.async = true;
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.onerror = () => setReady(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || lang === 'en') return;
    const timer = window.setTimeout(() => reapplyGoogleTranslate(lang), 120);
    return () => window.clearTimeout(timer);
  }, [pathname, ready, lang]);

  const setLang = useCallback((next: SiteLang) => {
    const current = readSiteLang();
    if (next === current) return;
    persistSiteLang(next);
    window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ lang, ready, setLang }),
    [lang, ready, setLang],
  );

  return (
    <SiteLanguageContext.Provider value={value}>
      {/* Hidden host for the Google Translate combo — never shown in the UI. */}
      <div id="google_translate_element" className="sr-only" aria-hidden="true" />
      {children}
    </SiteLanguageContext.Provider>
  );
}
