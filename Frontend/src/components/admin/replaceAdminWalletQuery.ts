'use client';

type ReplaceRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * Mutate the wallet URL from the live location search string.
 * Avoids races where concurrent writers (tab vs period) each snapshot a stale
 * `useSearchParams()` value and the last replace wipes the other's keys.
 */
export function replaceAdminWalletQuery(
  router: ReplaceRouter,
  mutate: (params: URLSearchParams) => void,
  pathname = '/admin/wallet',
) {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  mutate(params);
  const qs = params.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
}
