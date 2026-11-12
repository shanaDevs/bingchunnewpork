"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { APP_DOWNLOAD_SETTINGS_QUERY_KEY, fetchAppDownloadSettings, isPublishedStoreUrl } from "@/lib/appDownload";

const ANDROID_FALLBACK = "https://play.google.com/store/apps/details?id=com.bingchun.customer";
const IOS_FALLBACK = "https://apps.apple.com/app/bing-chun/id0000000000";

// Brand glyphs from Simple Icons (CC0). The badges are drawn in the official black store-badge style (grey hairline border).
function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 shrink-0 fill-white max-sm:size-6">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GooglePlayLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0 max-sm:size-5">
      <path fill="#fbbc04" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z" />
      <path fill="#4285f4" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z" />
      <path fill="#34a853" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z" />
      <path fill="#ea4335" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  );
}

type StoreBadgeProps = {
  href: string;
  icon: ReactNode;
  kicker: string;
  store: string;
};

function StoreBadge({ href, icon, kicker, store }: StoreBadgeProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-14 items-center gap-3 rounded-xl bg-black px-4 pr-5 text-snow ring-1 ring-[#a6a6a6] transition duration-200 ring-inset hover:-translate-y-0.5 hover:bg-neutral-900 hover:shadow-lg hover:shadow-brand-950/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-sm:h-12 max-sm:justify-center max-sm:gap-2 max-sm:px-2"
    >
      {icon}
      <span className="flex flex-col text-left leading-none">
        <span className="text-[0.6875rem] font-medium max-sm:text-[0.5625rem]">{kicker}</span>
        <span className="mt-0.5 text-xl font-semibold tracking-[-0.01em] whitespace-nowrap max-sm:text-[0.9375rem]">{store}</span>
      </span>
    </a>
  );
}

function StoreBadgeSoon({ icon, kicker, store }: Omit<StoreBadgeProps, "href">) {
  return (
    <span
      aria-disabled="true"
      title="Coming soon"
      className="flex h-14 cursor-not-allowed items-center gap-3 rounded-xl bg-neutral-800 px-4 pr-5 text-snow/75 ring-1 ring-[#a6a6a6]/60 ring-inset max-sm:h-12 max-sm:justify-center max-sm:gap-2 max-sm:px-2"
    >
      {icon}
      <span className="flex flex-col text-left leading-none">
        <span className="text-[0.6875rem] font-medium max-sm:text-[0.5625rem]">{kicker}</span>
        <span className="mt-0.5 text-xl font-semibold tracking-[-0.01em] whitespace-nowrap max-sm:text-[0.9375rem]">Coming soon</span>
        <span className="sr-only">{store}</span>
      </span>
    </span>
  );
}

/**
 * App Store and Google Play buttons. URLs come from the app download settings (admin-managed, with
 * built-in fallbacks while they load).
 * On phones they are two equal, slightly smaller buttons on one row (stacked below 360px).
 */
export function StoreBadges() {
  const { data: settings } = useQuery({
    queryKey: APP_DOWNLOAD_SETTINGS_QUERY_KEY,
    queryFn: fetchAppDownloadSettings,
    staleTime: 5 * 60 * 1000,
  });

  const iosUrl = settings?.iosStoreUrl ?? IOS_FALLBACK;
  const androidUrl = settings?.androidStoreUrl ?? ANDROID_FALLBACK;
  const iosLive = isPublishedStoreUrl(iosUrl);
  const androidLive = isPublishedStoreUrl(androidUrl);

  return (
    <div className="flex flex-wrap gap-3 max-sm:grid max-sm:gap-2.5 max-[359px]:grid-cols-1 min-[360px]:max-sm:grid-cols-2">
      {iosLive ? (
        <StoreBadge href={iosUrl} icon={<AppleLogo />} kicker="Download on the" store="App Store" />
      ) : (
        <StoreBadgeSoon icon={<AppleLogo />} kicker="Download on the" store="App Store" />
      )}
      {androidLive ? (
        <StoreBadge href={androidUrl} icon={<GooglePlayLogo />} kicker="GET IT ON" store="Google Play" />
      ) : (
        <StoreBadgeSoon icon={<GooglePlayLogo />} kicker="GET IT ON" store="Google Play" />
      )}
    </div>
  );
}
