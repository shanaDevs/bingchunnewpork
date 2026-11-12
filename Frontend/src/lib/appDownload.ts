import { getApiBaseUrl } from '@/lib/apiBase';

export type AppDownloadSettings = {
  requireAppDownload: boolean;
  androidStoreUrl: string;
  iosStoreUrl: string;
  androidAppIconUrl: string | null;
  iosAppIconUrl: string | null;
};

export type ClientPlatform = 'android' | 'ios' | 'desktop';

export const APP_DOWNLOAD_SETTINGS_QUERY_KEY = ['app-download-settings'] as const;

const DEFAULT_ANDROID =
  'https://play.google.com/store/apps/details?id=com.bingchun.customer';
const DEFAULT_IOS = 'https://apps.apple.com/app/bing-chun/id0000000000';

/** Placeholder or empty store URLs should not open an external store listing. */
export function isPublishedStoreUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return false;
  // Built-in placeholders used until real App Store / Play listings exist.
  if (/id0000000000/i.test(trimmed)) return false;
  if (/id=com\.bingchun\.customer(?:&|$)/i.test(trimmed)) return false;
  if (trimmed === DEFAULT_ANDROID || trimmed === DEFAULT_IOS) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function detectClientPlatform(): ClientPlatform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

export async function fetchAppDownloadSettings(): Promise<AppDownloadSettings> {
  const res = await fetch(`${getApiBaseUrl()}/settings/app`, { cache: 'no-store' });
  const json = await res.json();
  const data = json.data ?? json;
  return {
    requireAppDownload: data.requireAppDownload ?? true,
    androidStoreUrl: data.androidStoreUrl?.trim() || DEFAULT_ANDROID,
    iosStoreUrl: data.iosStoreUrl?.trim() || DEFAULT_IOS,
    androidAppIconUrl: data.androidAppIconUrl?.trim() || null,
    iosAppIconUrl: data.iosAppIconUrl?.trim() || null,
  };
}

export type ClaimDestination =
  | { type: 'web'; label: string }
  | { type: 'store'; label: string; url: string; platform: 'android' | 'ios' };

/** Where the user should go after claiming a spin reward. */
export function resolveClaimDestination(
  settings: AppDownloadSettings,
  platform: ClientPlatform = detectClientPlatform(),
): ClaimDestination {
  if (!settings.requireAppDownload || platform === 'desktop') {
    return { type: 'web', label: 'Use at checkout' };
  }
  if (platform === 'ios') {
    return {
      type: 'store',
      label: 'Get the app on App Store',
      url: settings.iosStoreUrl,
      platform: 'ios',
    };
  }
  return {
    type: 'store',
    label: 'Get the app on Play Store',
    url: settings.androidStoreUrl,
    platform: 'android',
  };
}

export function openClaimDestination(dest: ClaimDestination): void {
  if (dest.type === 'store' && dest.url) {
    window.open(dest.url, '_blank', 'noopener,noreferrer');
  }
}
