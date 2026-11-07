'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import {
  formatSpinOffer,
  getSpinClaim,
  getSpinGuestKey,
  isSpinConsumedLocally,
  markSpinConsumed,
  markSpinPopupShown,
  clearSpinPopupShown,
  shouldShowSpinPopup,
  type SpinClaim,
  type SpinOffer,
} from '@/lib/spinStorage';
import { fetchSpinOffers, SPIN_LIVE_QUERY, SPIN_OFFERS_QUERY_KEY } from '@/lib/spinOffers';
import {
  fetchSpinEligibility,
  formatSpinCooldownMessage,
  isSpinUiHidden,
  loyaltySpinSubtitle,
  SPIN_ELIGIBILITY_QUERY_KEY,
  shouldShowSpinEntryPoints,
  shouldAutoOpenSpinPopup,
  type SpinEligibility,
} from '@/lib/spinEligibility';
import {
  APP_DOWNLOAD_SETTINGS_QUERY_KEY,
  fetchAppDownloadSettings,
  openClaimDestination,
  resolveClaimDestination,
} from '@/lib/appDownload';
import { queryClient } from '@/lib/queryClient';
import { useSpinStore } from '@/store/spinStore';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCartStore } from '@/store/cartStore';
import { usePromoStore } from '@/store/promoStore';
import { rewardFromSpinClaim } from '@/lib/spinClaim';
import toast from 'react-hot-toast';
import { DEFAULT_SPIN_DISPLAY, isSpinPopupPath } from '@/lib/spinDisplay';
import { playSpinMiss, playSpinWin, wakeSpinAudio } from '@/components/spin-redesign/spinSounds';
import {
  isWinningPlay,
  sliceOfOffer,
  spinAllowanceText,
  type SpinPlayResponse,
} from '@/components/spin-redesign/wheel';
import type { WheelHandle } from '@/components/spin-redesign/SpinWheel';

// The pop-up (GSAP, its fonts) is only fetched for customers who get to see it.
const SpinWinDialog = dynamic(() => import('@/components/spin-redesign/SpinWinDialog'), { ssr: false });

function isSkippedRoute(pathname: string) {
  return isSpinUiHidden(pathname);
}

function dedupeWheelOffers(offers: SpinOffer[]): SpinOffer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = [
      offer.sortOrder,
      offer.offerType,
      offer.label.trim().toLowerCase(),
      offer.discountValue,
      offer.giftProductId ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function SpinWheelModal() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceSpin = searchParams.get('spin') === '1';
  const setClaim = useSpinStore((s) => s.setClaim);
  const openRequestId = useSpinStore((s) => s.openRequestId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authHydrated = useAuthHydrated();
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());
  const [open, setOpen] = useState(false);
  const [offers, setOffers] = useState<SpinOffer[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinPlayResponse | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const hasOpenedRef = useRef(false);
  const markedShownRef = useRef(false);
  const manualOpenRef = useRef(false);
  const lastOpenRequestRef = useRef(0);
  /** Bumped whenever the pop-up resets, so a spin still finishing after a forced close knows nobody is watching. */
  const spinSessionRef = useRef(0);
  const syncedClaimRef = useRef<string | null>(null);

  const shouldPrefetch = !isSkippedRoute(pathname);

  const { data: offersData, isLoading: offersLoading } = useQuery({
    queryKey: [...SPIN_OFFERS_QUERY_KEY, storeId ?? ''],
    queryFn: () => fetchSpinOffers(storeId),
    enabled: shouldPrefetch,
    ...SPIN_LIVE_QUERY,
  });

  const { data: eligibility, isFetched: eligibilityFetched, isFetching: eligibilityFetching } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated && (shouldPrefetch || open),
    ...SPIN_LIVE_QUERY,
  });

  const loyaltySpin = eligibility?.loyaltySpin;
  const loyaltyJourneyActive = Boolean(loyaltySpin?.enabled);
  const loyaltyLocked = Boolean(loyaltySpin?.gatesSpin && !loyaltySpin.unlocked);
  const display = eligibility?.display ?? DEFAULT_SPIN_DISPLAY;
  const onPopupPage = !isSkippedRoute(pathname) && isSpinPopupPath(pathname, display.popupPages);

  const onCooldown = eligibility != null && eligibility.enabled && !eligibility.canSpin && !loyaltyLocked;
  const cooldownMessage = onCooldown
    ? formatSpinCooldownMessage(eligibility?.nextSpinAt, eligibility?.reason ?? undefined)
    : null;
  const spinAnimMs = Math.round(Math.min(20, Math.max(3, eligibility?.spinDurationSeconds ?? 8)) * 1000);
  const spinAnimMsRef = useRef(spinAnimMs);
  spinAnimMsRef.current = spinAnimMs;

  const { data: appDownloadSettings } = useQuery({
    queryKey: APP_DOWNLOAD_SETTINGS_QUERY_KEY,
    queryFn: fetchAppDownloadSettings,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const persistSpinUsed = useCallback((nextSpinAt?: string | null) => {
    const windowMs = (eligibility?.spinWindowHours ?? 24) * 60 * 60 * 1000;
    const parsed = nextSpinAt ? Date.parse(nextSpinAt) : NaN;
    const until = Number.isFinite(parsed) && parsed > Date.now() ? parsed : Date.now() + windowMs;
    markSpinConsumed(until);
    markedShownRef.current = true;
    hasOpenedRef.current = true;
    queryClient.setQueriesData<SpinEligibility>({ queryKey: SPIN_ELIGIBILITY_QUERY_KEY }, (old) => {
      if (!old) return old;
      const allowed = old.spinsAllowed ?? 1;
      const used = Math.min(allowed, Math.max(old.spinsUsed ?? 0, 0) + (old.canSpin ? 1 : 0));
      return {
        ...old,
        canSpin: false,
        spinsUsed: used || 1,
        spinsRemaining: 0,
        nextSpinAt: old.nextSpinAt ?? new Date(until).toISOString(),
      };
    });
  }, [eligibility?.spinWindowHours]);

  const resetSession = useCallback(() => {
    spinSessionRef.current += 1;
    setResult(null);
    setSpinning(false);
    setSpinError(null);
  }, []);

  const close = useCallback(() => {
    if (open && !markedShownRef.current) {
      const until = eligibility?.nextSpinAt ? Date.parse(eligibility.nextSpinAt) : undefined;
      markSpinPopupShown(Number.isFinite(until) ? until : undefined);
      markedShownRef.current = true;
    }
    hasOpenedRef.current = true;
    manualOpenRef.current = false;
    setOpen(false);
    resetSession();
  }, [open, resetSession, eligibility?.nextSpinAt]);

  useEffect(() => {
    if (!openRequestId || isSkippedRoute(pathname)) return;
    if (openRequestId === lastOpenRequestRef.current) return;
    if (eligibility == null) return;

    lastOpenRequestRef.current = openRequestId;

    if (!shouldShowSpinEntryPoints(eligibility) || isSpinConsumedLocally()) {
      if (
        eligibility.enabled &&
        !eligibility.loyaltySpin?.enabled &&
        !eligibility.canSpin
      ) {
        toast.error(formatSpinCooldownMessage(eligibility.nextSpinAt, eligibility.reason ?? undefined));
      }
      return;
    }

    manualOpenRef.current = true;
    resetSession();
    if (!eligibility.canSpin) {
      setSpinError(formatSpinCooldownMessage(eligibility.nextSpinAt, eligibility.reason ?? undefined));
    }
    setOpen(true);
  }, [openRequestId, pathname, resetSession, eligibility]);

  useEffect(() => {
    if (isSkippedRoute(pathname)) {
      setOpen(false);
      manualOpenRef.current = false;
      return;
    }
    if (!onPopupPage && !manualOpenRef.current) {
      setOpen(false);
      return;
    }
    if (!authHydrated) return;
    if (manualOpenRef.current || forceSpin) return;
    if (!eligibilityFetched || eligibilityFetching) return;
    if (eligibility == null) return;
    if (!shouldAutoOpenSpinPopup(eligibility, { pathname })) return;
    if (isSpinConsumedLocally()) return;
    if (getSpinClaim()) return;
    if (!shouldShowSpinPopup() || hasOpenedRef.current) return;
    if (!offersData?.enabled || !offersData.offers?.length) return;

    const timer = window.setTimeout(() => {
      if (hasOpenedRef.current) return;
      if (!authHydrated) return;
      if (isSpinConsumedLocally() || getSpinClaim()) return;
      if (!shouldShowSpinPopup()) return;
      if (!shouldAutoOpenSpinPopup(eligibility, { pathname })) return;
      hasOpenedRef.current = true;
      setOffers(dedupeWheelOffers(offersData.offers));
      setOpen(true);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    pathname,
    onPopupPage,
    forceSpin,
    offersData,
    eligibility,
    eligibilityFetched,
    eligibilityFetching,
    authHydrated,
  ]);

  useEffect(() => {
    if (!open) return;
    if (onCooldown && cooldownMessage) {
      setSpinError(cooldownMessage);
    } else if (!onCooldown) {
      setSpinError((prev) => (prev?.includes('spin again after') ? null : prev));
    }
  }, [open, onCooldown, cooldownMessage]);

  // Opening the wheel always asks for the admin's latest prizes, however recently they were fetched.
  useEffect(() => {
    if (open) void queryClient.invalidateQueries({ queryKey: SPIN_OFFERS_QUERY_KEY });
  }, [open]);

  useEffect(() => {
    // A wheel on show keeps its slices: a refetch mid-spin would move them under the pointer.
    if (offersData?.offers?.length && !spinning && !result) {
      setOffers(dedupeWheelOffers(offersData.offers));
    }
  }, [offersData, spinning, result]);

  // A reward won in another browser, or on a spin cut short by a reload, is still waiting on the server.
  useEffect(() => {
    if (!authHydrated || !shouldPrefetch) return;
    const identity = isAuthenticated ? 'auth' : 'guest';
    if (syncedClaimRef.current === identity) return;
    syncedClaimRef.current = identity;
    if (getSpinClaim()) return;
    const guestKey = getSpinGuestKey();
    void api
      .get<SpinClaim | null>(`/spin/my-claim${guestKey ? `?guestKey=${encodeURIComponent(guestKey)}` : ''}`, isAuthenticated)
      .then((claim) => {
        if (claim?.claimCode && claim.expiresAt && !getSpinClaim()) setClaim(claim);
      })
      .catch(() => undefined);
  }, [authHydrated, shouldPrefetch, isAuthenticated, setClaim]);

  useEffect(() => {
    if (!forceSpin || isSkippedRoute(pathname)) return;
    if (!authHydrated) return;
    if (!eligibilityFetched || eligibilityFetching) return;
    if (eligibility == null) return;
    if (!shouldShowSpinEntryPoints(eligibility)) return;
    clearSpinPopupShown();
    markedShownRef.current = false;
    manualOpenRef.current = true;
    const timer = window.setTimeout(() => {
      hasOpenedRef.current = true;
      setOpen(true);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [forceSpin, pathname, eligibility, eligibilityFetched, eligibilityFetching, authHydrated, isAuthenticated]);

  useEffect(() => {
    if (!open || spinning || result) return;
    if (eligibility != null && !shouldShowSpinEntryPoints(eligibility)) {
      markedShownRef.current = true;
      hasOpenedRef.current = true;
      manualOpenRef.current = false;
      setOpen(false);
      return;
    }
    if (
      open &&
      !manualOpenRef.current &&
      !forceSpin &&
      eligibility != null &&
      !shouldAutoOpenSpinPopup(eligibility, { pathname })
    ) {
      markedShownRef.current = true;
      hasOpenedRef.current = true;
      setOpen(false);
    }
  }, [open, eligibility, spinning, result, forceSpin, pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || spinning || !result) return;
    const lost = result.isPrize === false || result.offer.offerType === 'NO_PRIZE';
    if (!lost) return;
    const seconds = display.loseAutoHideSeconds;
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => {
      close();
    }, Math.round(seconds * 1000));
    return () => window.clearTimeout(timer);
  }, [open, spinning, result, display.loseAutoHideSeconds, close]);

  function saveReward(play: SpinPlayResponse) {
    if (!play.claimCode || !play.expiresAt) return;
    const snap = {
      resultId: play.resultId,
      claimCode: play.claimCode,
      expiresAt: play.expiresAt,
      offer: play.offer,
    };
    setClaim(snap);
    const cart = useCartStore.getState();
    usePromoStore.getState().setReward(
      rewardFromSpinClaim(snap, cart.subtotal(), cart.orderMode),
    );
  }

  async function handleSpin(wheel: WheelHandle | null) {
    if (spinning || result) return;

    if (onCooldown) {
      setSpinError(cooldownMessage ?? formatSpinCooldownMessage(eligibility?.nextSpinAt, eligibility?.reason ?? undefined));
      return;
    }

    const session = spinSessionRef.current;
    setSpinning(true);
    setSpinError(null);
    // Has to happen in the click, before waiting for the server, or browsers may keep the wheel silent.
    wakeSpinAudio();
    try {
      const play = await api.post<SpinPlayResponse>(
        '/spin/play',
        { guestKey: getSpinGuestKey(), ...(storeId ? { storeId } : {}) },
        isAuthenticated,
      );

      persistSpinUsed(eligibility?.nextSpinAt);
      // The server has recorded it, so keep the reward now: a reload mid-spin mustn't lose it.
      const won = isWinningPlay(play);
      if (won) saveReward(play);

      if (!play.alreadyClaimed) {
        const index = sliceOfOffer(offers, play.offer);
        if (index >= 0) {
          await wheel?.spinTo(index, {
            reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            totalSeconds: spinAnimMsRef.current / 1000,
          });
        } else {
          // The admin changed the wheel since it loaded: skip to the result rather than stop on the wrong slice.
          void queryClient.invalidateQueries({ queryKey: SPIN_OFFERS_QUERY_KEY });
        }
      }

      void queryClient.invalidateQueries({ queryKey: SPIN_ELIGIBILITY_QUERY_KEY });
      if (session !== spinSessionRef.current) {
        if (won) toast.success(`You won ${formatSpinOffer(play.offer)}! It's waiting in your cup.`);
        return;
      }
      setResult(play);
      setSpinning(false);
      if (play.alreadyClaimed) return;
      if (won) playSpinWin();
      else playSpinMiss();
    } catch (err: unknown) {
      setSpinning(false);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not spin right now';
      setSpinError(message);
      if (err instanceof ApiError && err.status === 429) {
        persistSpinUsed(eligibility?.nextSpinAt);
        // That also closes the pop-up (the customer can no longer spin), so say why where it can be seen.
        toast.error(message);
      }
      void queryClient.invalidateQueries({ queryKey: SPIN_ELIGIBILITY_QUERY_KEY });
    }
  }

  function handleClaim() {
    if (result) saveReward(result);
    const settings = appDownloadSettings ?? {
      requireAppDownload: true,
      androidStoreUrl: '',
      iosStoreUrl: '',
      androidAppIconUrl: null,
      iosAppIconUrl: null,
    };
    const dest = resolveClaimDestination(settings);
    if (dest.type === 'store') {
      openClaimDestination(dest);
      toast.success('Opening app store…');
      window.setTimeout(() => close(), 400);
      return;
    }
    close();
    router.push('/cart');
  }

  if (isSkippedRoute(pathname)) return null;

  const claimDest = appDownloadSettings
    ? resolveClaimDestination(appDownloadSettings)
    : { type: 'web' as const, label: 'Claim reward' };
  const settled = spinning || Boolean(result);
  const spinBlocked = !settled && (
    onCooldown || loyaltyLocked || (eligibility != null && !eligibility.canSpin)
  );
  const journeySubtitle =
    loyaltyJourneyActive && loyaltySpin && (loyaltySpin.gatesSpin || loyaltySpin.unlocked)
      ? loyaltySpinSubtitle(loyaltySpin)
      : null;
  const intro =
    journeySubtitle
    ?? (!settled && onCooldown
      ? 'Your spin is on cooldown.'
      : `${spinAllowanceText(eligibility?.spinsAllowed, eligibility?.spinWindowHours, settled ? undefined : eligibility?.spinsRemaining)} Win exciting rewards on your favorite treats!`);
  const journey =
    loyaltySpin?.gatesSpin && !loyaltySpin.unlocked
      ? {
          progress: Math.min(
            100,
            loyaltySpin.validOrderCount >= loyaltySpin.requiredOrders
              ? 90
              : (loyaltySpin.validOrderCount / Math.max(loyaltySpin.requiredOrders, 1)) * 100,
          ),
          label: `${Math.min(loyaltySpin.validOrderCount, loyaltySpin.requiredOrders)}/${loyaltySpin.requiredOrders}`,
        }
      : null;

  if (!open) return null;

  return (
    <SpinWinDialog
      offers={offers}
      loading={offersLoading}
      spinning={spinning}
      result={result}
      message={spinError ?? (onCooldown ? cooldownMessage : null)}
      blocked={spinBlocked}
      intro={intro}
      journey={journey}
      signedIn={isAuthenticated}
      claimLabel={claimDest.type === 'web' ? 'Add to cup' : claimDest.label}
      canSpinAgain={Boolean(result && !isWinningPlay(result) && eligibility?.canSpin && !eligibilityFetching)}
      onSpinAgain={() => {
        setResult(null);
        setSpinError(null);
      }}
      onSpin={handleSpin}
      onClaim={handleClaim}
      onBrowse={() => {
        close();
        if (pathname !== '/promotions') router.push('/promotions');
      }}
      onClose={close}
    />
  );
}
