export type SiteLang = 'en' | 'zh-CN';

export const SITE_LANG_STORAGE_KEY = 'bc_site_lang';

export const SITE_LANGUAGES: Array<{ code: SiteLang; label: string; short: string }> = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh-CN', label: '中文', short: '中文' },
];

export function isSiteLang(value: string | null | undefined): value is SiteLang {
  return value === 'en' || value === 'zh-CN';
}

/** Read preferred language from localStorage or the googtrans cookie. */
export function readSiteLang(): SiteLang {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(SITE_LANG_STORAGE_KEY);
    if (isSiteLang(stored)) return stored;
  } catch {
    // ignore
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
    const value = match?.[1] ? decodeURIComponent(match[1]) : '';
    if (value.includes('/zh-CN')) return 'zh-CN';
  } catch {
    // ignore
  }
  return 'en';
}

function clearGoogTransCookies() {
  const host = window.location.hostname;
  const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const paths = ['/', window.location.pathname];
  for (const path of paths) {
    document.cookie = `googtrans=;path=${path};expires=${expire}`;
    if (host) {
      document.cookie = `googtrans=;path=${path};domain=${host};expires=${expire}`;
      document.cookie = `googtrans=;path=${path};domain=.${host};expires=${expire}`;
    }
  }
}

/** Persist language for Google Website Translator (cookie + localStorage). */
export function persistSiteLang(lang: SiteLang) {
  try {
    localStorage.setItem(SITE_LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }

  clearGoogTransCookies();

  if (lang === 'en') {
    document.documentElement.lang = 'en';
    return;
  }

  const value = `/en/${lang}`;
  document.cookie = `googtrans=${value};path=/`;
  const host = window.location.hostname;
  if (host && host !== 'localhost' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.includes(':')) {
    document.cookie = `googtrans=${value};path=/;domain=.${host}`;
  }
  document.documentElement.lang = 'zh-CN';
}
