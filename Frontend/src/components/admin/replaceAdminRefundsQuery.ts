'use client';

type ReplaceRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

/** Mutate /admin/refunds URL from the live location search (avoids stale searchParams races). */
export function replaceAdminRefundsQuery(
  router: ReplaceRouter,
  mutate: (params: URLSearchParams) => void,
  pathname = '/admin/refunds',
) {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  mutate(params);
  const qs = params.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
}