'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Sparkles, Percent, Truck, Coins, PartyPopper, Loader2, Clock, Star, CalendarDays } from 'lucide-react';
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
  type SpinOffer,
} from '@/lib/spinStorage';
import { fetchSpinOffers, SPIN_OFFERS_QUERY_KEY } from '@/lib/spinOffers';
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
import {
  playSpinLoseSound,
  playSpinWinSound,
  primeSpinAudio,
  startSpinWheelSound,
  stopSpinWheelSound,
} from '@/lib/uiSounds';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import { DEFAULT_SPIN_DISPLAY, isSpinPopupPath } from '@/lib/spinDisplay';

type PlayResponse = {
  alreadyClaimed?: boolean;
  resultId: string;
  claimCode: string | null;
  expiresAt: string | null;
  offer: SpinOffer;
  offerIndex: number;
  isPrize?: boolean;
};

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

function segmentAngle(count: number) {
  return 360 / Math.max(count, 1);
}

function segmentLabelStyle(index: number, count: number) {
  const step = segmentAngle(count);
  // Place labels in the middle of each conic slice (0deg = top / pointer).
  const degFromTop = index * step + step / 2;
  const rad = ((degFromTop - 90) * Math.PI) / 180;
  // Keep inward enough that icon+text stay inside the wedge
  const radius = count >= 8 ? 31 : count >= 6 ? 33 : 35;
  const left = 50 + radius * Math.cos(rad);
  const top = 50 + radius * Math.sin(rad);
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: 'translate(-50%, -50%)',
  };
}

function truncateGiftName(name: string, max = 9): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function spinSegmentLines(offer: SpinOffer): [string, string?] {
  switch (offer.offerType) {
    case 'PERCENTAGE':
      return [`${offer.discountValue}%`, 'OFF'];
    case 'FIXED':
      return ['LKR', `${offer.discountValue}`];
    case 'FREE_DELIVERY':
      return ['FREE', 'DELIVERY'];
    case 'NO_PRIZE':
      return ['TRY', 'AGAIN'];
    case 'GIFT':
      return ['FREE'];
    default:
      return [offer.label];
  }
}

function segmentBadgeTone(type: SpinOffer['offerType']): string {
  switch (type) {
    case 'PERCENTAGE':
      return 'spin-wheel-segment-label__badge--purple';
    case 'FIXED':
      return 'spin-wheel-segment-label__badge--teal';
    case 'FREE_DELIVERY':
      return 'spin-wheel-segment-label__badge--blue';
    case 'GIFT':
      return 'spin-wheel-segment-label__badge--pink';
    case 'NO_PRIZE':
      return 'spin-wheel-segment-label__badge--sky';
    default:
      return 'spin-wheel-segment-label__badge--blue';
  }
}

function SpinWheelSegmentLabel({
  offer,
  wheelRotation,
  spinning,
  spinAnimMs,
}: {
  offer: SpinOffer;
  wheelRotation: number;
  spinning: boolean;
  spinAnimMs: number;
}) {
  const Icon = offerIcon(offer.offerType);
  const isGift = offer.offerType === 'GIFT';
  const giftImage = isGift ? resolveProductImageUrl(offer.giftProduct?.imageUrl) : undefined;
  const [line1, line2] = spinSegmentLines(offer);
  const giftName = offer.giftProduct?.name?.trim();

  return (
    <motion.div
      className="spin-wheel-segment-label flex flex-col items-center justify-center select-none"
      animate={{ rotate: -wheelRotation }}
      transition={{
        duration: spinning ? spinAnimMs / 1000 : 0,
        ease: SPIN_EASE,
      }}
    >
      <div className="spin-wheel-segment-label__stack flex w-[3.35rem] max-w-[3.35rem] flex-col items-center gap-0.5 overflow-hidden text-center">
        {isGift && giftImage ? (
          <div className="spin-wheel-segment-label__gift-photo h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_3px_10px_rgba(0,0,0,0.28)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={giftImage}
              alt={giftName ?? 'Free gift'}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div
            className={`spin-wheel-segment-label__badge flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-[0_3px_10px_rgba(0,0,0,0.22)] ${segmentBadgeTone(offer.offerType)}`}
          >
            <Icon size={16} strokeWidth={2.4} aria-hidden />
          </div>
        )}
        <span className="spin-wheel-segment-label__text max-w-full truncate text-[9px] font-extrabold uppercase leading-[1.05] tracking-wide">
          {line1}
        </span>
        {isGift && giftName ? (
          <span className="spin-wheel-segment-label__gift-name max-w-full truncate text-[8px] font-bold leading-tight">
            {truncateGiftName(giftName, 9)}
          </span>
        ) : line2 ? (
          <span className="spin-wheel-segment-label__text-sub max-w-full truncate text-[8px] font-bold uppercase leading-tight tracking-wide">
            {line2}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

function offerIcon(type: SpinOffer['offerType']) {
  switch (type) {
    case 'PERCENTAGE':
      return Percent;
    case 'FIXED':
      return Coins;
    case 'FREE_DELIVERY':
      return Truck;
    case 'GIFT':
      return Gift;
    default:
      return PartyPopper;
  }
}

const SPIN_ANIM_MS_DEFAULT = 8000;
const SPIN_EASE: [number, number, number, number] = [0.08, 0.22, 0.12, 1];

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
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<PlayResponse | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const hasOpenedRef = useRef(false);
  const markedShownRef = useRef(false);
  const manualOpenRef = useRef(false);
  const lastOpenRequestRef = useRef(0);

  const shouldPrefetch = !isSkippedRoute(pathname);

  const { data: offersData, isLoading: offersLoading } = useQuery({
    queryKey: [...SPIN_OFFERS_QUERY_KEY, storeId ?? ''],
    queryFn: () => fetchSpinOffers(storeId),
    enabled: shouldPrefetch,
    staleTime: 5 * 60 * 1000,
  });

  const { data: eligibility, isFetched: eligibilityFetched, isFetching: eligibilityFetching } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated && (shouldPrefetch || open),
    staleTime: 15_000,
    refetchOnMount: 'always',
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
  const spinsAllowed = eligibility?.spinsAllowed ?? 1;
  const spinsRemaining = eligibility?.spinsRemaining ?? (onCooldown ? 0 : 1);
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
    setResult(null);
    setSpinning(false);
    setRotation(0);
    setSpinError(null);
  }, []);

  const dismissForToday = useCallback(() => {
    stopSpinWheelSound();
    markSpinPopupShown();
    markedShownRef.current = true;
    manualOpenRef.current = false;
    setOpen(false);
    resetSession();
  }, [resetSession]);

  const close = useCallback(() => {
    stopSpinWheelSound();
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
    if (!shouldAutoOpenSpinPopup(eligibility, { isAuthenticated, pathname })) return;
    if (isSpinConsumedLocally()) return;
    if (getSpinClaim()) return;
    if (!shouldShowSpinPopup() || hasOpenedRef.current) return;
    if (!offersData?.enabled || !offersData.offers?.length) return;

    const timer = window.setTimeout(() => {
      if (hasOpenedRef.current) return;
      if (!authHydrated) return;
      if (isSpinConsumedLocally() || getSpinClaim()) return;
      if (!shouldShowSpinPopup()) return;
      if (!shouldAutoOpenSpinPopup(eligibility, { isAuthenticated, pathname })) return;
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
    isAuthenticated,
  ]);

  useEffect(() => {
    if (!open) return;
    if (onCooldown && cooldownMessage) {
      setSpinError(cooldownMessage);
    } else if (!onCooldown) {
      setSpinError((prev) => (prev?.includes('spin again after') ? null : prev));
    }
  }, [open, onCooldown, cooldownMessage]);

  useEffect(() => {
    if (offersData?.offers?.length) {
      setOffers(dedupeWheelOffers(offersData.offers));
    }
  }, [offersData]);

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
      !shouldAutoOpenSpinPopup(eligibility, { isAuthenticated, pathname })
    ) {
      markedShownRef.current = true;
      hasOpenedRef.current = true;
      setOpen(false);
    }
  }, [open, eligibility, spinning, result, forceSpin, isAuthenticated, pathname]);

  useEffect(() => {
    if (open) return;
    stopSpinWheelSound();
  }, [open]);

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

  const conic = useMemo(() => {
    if (!offers.length) return 'transparent';
    const step = segmentAngle(offers.length);
    const stops = offers.map((o, i) => {
      const start = i * step;
      const end = (i + 1) * step;
      return `${o.color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(from 0deg, ${stops.join(', ')})`;
  }, [offers]);

  const dividerLines = useMemo(() => {
    const count = offers.length;
    if (!count) return null;
    const step = segmentAngle(count);
    return Array.from({ length: count }, (_, i) => {
      const deg = i * step;
      return (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-1/2 w-[2.5px] origin-bottom bg-gradient-to-b from-white/70 to-white/25"
          style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
        />
      );
    });
  }, [offers.length]);

  async function handleSpin() {
    if (spinning || result) return;

    if (onCooldown) {
      const msg = cooldownMessage ?? formatSpinCooldownMessage(eligibility?.nextSpinAt, eligibility?.reason ?? undefined);
      setSpinError(msg);
      toast.error(msg);
      return;
    }

    setSpinning(true);
    primeSpinAudio();
    try {
      const guestKey = getSpinGuestKey();
      const token = typeof window !== 'undefined' ? localStorage.getItem('bc_token') : null;
      const play = await api.post<PlayResponse>(
        '/spin/play',
        { guestKey, ...(storeId ? { storeId } : {}) },
        Boolean(token),
      );

      persistSpinUsed(eligibility?.nextSpinAt);

      if (play.alreadyClaimed && play.claimCode && play.expiresAt) {
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
        setResult(play);
        playSpinWinSound();
        toast.success('You already have an active spin reward!');
        setSpinning(false);
        void queryClient.invalidateQueries({ queryKey: SPIN_ELIGIBILITY_QUERY_KEY });
        return;
      }

      const count = offers.length;
      const step = segmentAngle(count);
      const index = play.offerIndex >= 0 ? play.offerIndex : 0;
      const targetCenter = index * step + step / 2;
      const extraTurns = 5 + Math.floor(Math.random() * 3);
      const nextRotation = rotation + extraTurns * 360 + (360 - targetCenter);
      const durationMs = spinAnimMsRef.current;

      startSpinWheelSound({
        durationMs,
        segmentCount: count,
        extraTurns,
      });
      setRotation(nextRotation);
      window.setTimeout(() => {
        stopSpinWheelSound();
        setResult(play);
        setSpinning(false);
        void queryClient.invalidateQueries({ queryKey: SPIN_ELIGIBILITY_QUERY_KEY });
        if (play.isPrize && play.claimCode && play.expiresAt) {
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
          playSpinWinSound();
          toast.success(`You won ${formatSpinOffer(play.offer)}!`);
        } else {
          playSpinLoseSound();
          toast('Better luck next time!');
        }
      }, durationMs);
    } catch (err: unknown) {
      stopSpinWheelSound();
      setSpinning(false);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not spin right now';
      setSpinError(message);
      toast.error(message);
      if (err instanceof ApiError && err.status === 429) {
        persistSpinUsed(eligibility?.nextSpinAt);
      }
      void queryClient.invalidateQueries({ queryKey: SPIN_ELIGIBILITY_QUERY_KEY });
    }
  }

  function handleClaim() {
    if (result?.claimCode && result.expiresAt && result.offer) {
      const snap = {
        resultId: result.resultId,
        claimCode: result.claimCode,
        expiresAt: result.expiresAt,
        offer: result.offer,
      };
      setClaim(snap);
      const cart = useCartStore.getState();
      usePromoStore.getState().setReward(
        rewardFromSpinClaim(snap, cart.subtotal(), cart.orderMode),
      );
    }
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

  const ResultIcon = result ? offerIcon(result.offer.offerType) : Gift;
  const claimDest = appDownloadSettings
    ? resolveClaimDestination(appDownloadSettings)
    : { type: 'web' as const, label: 'Claim reward' };
  const inResultView = Boolean(result);
  const isLoseResult =
    inResultView &&
    (result!.isPrize === false || result!.offer.offerType === 'NO_PRIZE');
  const displayError = spinError ?? (onCooldown && !inResultView ? cooldownMessage : null);
  const spinBlocked = Boolean(
    (displayError && onCooldown) || loyaltyLocked || (eligibility != null && !eligibility.canSpin),
  );
  const spinButtonLabel = spinning
    ? 'Spinning…'
    : loyaltyLocked
      ? 'Locked'
      : 'SPIN NOW';
  const journeySubtitle =
    loyaltyJourneyActive && loyaltySpin && (loyaltySpin.gatesSpin || loyaltySpin.unlocked)
      ? loyaltySpinSubtitle(loyaltySpin)
      : null;
  const giftResultImage =
    inResultView && result?.offer.offerType === 'GIFT'
      ? resolveProductImageUrl(result.offer.giftProduct?.imageUrl)
      : undefined;
  const previewOffers = offers.slice(0, 4);
  const defaultPreview = [
    { icon: Truck, label: 'Free Delivery' },
    { icon: Percent, label: '10% OFF' },
    { icon: Gift, label: 'Free Drink' },
    { icon: Percent, label: '15% OFF' },
  ] as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="spin-wheel"
          role="dialog"
          aria-modal="true"
          aria-label="Spin to win"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10060] flex items-center justify-center bg-[#0b1a44]/45 p-3 sm:p-4 backdrop-blur-[6px]"
        >
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={close} />

          <motion.div
            key="wheel"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="spin-sip-win spin-sip-win--3d"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="spin-sip-win__confetti" aria-hidden>
              <span /><span /><span /><span /><span /><span /><span /><span />
              <span /><span /><span /><span />
            </div>
            <div className="spin-sip-win__pearls" aria-hidden>
              <span /><span /><span /><span /><span /><span />
            </div>
            <div className="spin-sip-win__floor" aria-hidden>
              <span className="spin-sip-win__leaf" />
              <span className="spin-sip-win__bag" />
            </div>

            <div className="spin-sip-win__top">
              <div className="spin-sip-win__brand">
                <Image
                  src="/brand/logo.avif"
                  alt="Bing Chun"
                  width={32}
                  height={32}
                  className="rounded-full object-contain ring-2 ring-[#d7e6ff] bg-white"
                />
                <div className="spin-sip-win__brand-copy">
                  <strong>Bing Chun</strong>
                  <span>Sri Lanka</span>
                </div>
              </div>
              <button type="button" className="spin-sip-win__close" onClick={close} aria-label="Close">
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <div className="spin-sip-win__body">
              {!inResultView && (
                <>
                  <div className="spin-sip-win__ribbon" aria-hidden>
                    Spin &amp; Win
                  </div>
                  <h2 className="spin-sip-win__title">
                    <span className="spin-sip-win__title-spin">Spin.</span>{' '}
                    <span className="spin-sip-win__title-sip">Sip.</span>{' '}
                    <span className="spin-sip-win__title-win">Win!</span>
                  </h2>
                  <p className="spin-sip-win__subtitle">
                    {journeySubtitle
                      ?? (spinBlocked && onCooldown
                        ? 'Your daily spin is on cooldown.'
                        : 'One lucky spin every day. Win exciting rewards on your favorite treats! 💙')}
                  </p>
                </>
              )}

              {inResultView && (
                <>
                  <h2 className="spin-sip-win__title">
                    {isLoseResult ? 'Better luck next time' : 'Congrats!'}
                  </h2>
                  <p className="spin-sip-win__subtitle">
                    {isLoseResult
                      ? display.loseAutoHideSeconds > 0
                        ? 'Closing automatically…'
                        : 'Thanks for playing.'
                      : 'Your reward is ready. Add it to your cup or keep shopping.'}
                  </p>
                </>
              )}

              {loyaltySpin?.gatesSpin && !inResultView && !loyaltySpin.unlocked && (
                <div className="spin-sip-win__journey">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-[var(--ssw-blue,#1e4fd6)] transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            loyaltySpin.validOrderCount >= loyaltySpin.requiredOrders &&
                              !loyaltySpin.unlocked
                              ? 90
                              : (loyaltySpin.validOrderCount /
                                  Math.max(loyaltySpin.requiredOrders, 1)) *
                                  100,
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-[var(--ssw-ink,#0f1b4d)] tabular-nums">
                      {Math.min(loyaltySpin.validOrderCount, loyaltySpin.requiredOrders)}/
                      {loyaltySpin.requiredOrders}
                    </span>
                  </div>
                  {loyaltySpin.validOrderCount >= loyaltySpin.requiredOrders && (
                    <p className="mt-1 text-[10px] text-[var(--ssw-muted,#6b7a99)]">
                      Unlock order needs min LKR {loyaltySpin.minOrderAmount.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {displayError && !loyaltyLocked && !inResultView && (
                <div className="spin-sip-win__alert" role="alert">
                  <span className="inline-flex items-start gap-2">
                    <Clock size={14} className="mt-0.5 shrink-0" />
                    <span>{displayError}</span>
                  </span>
                </div>
              )}

              {!inResultView && (
                <div className="spin-sip-win__stage">
                  <div className="spin-wheel relative mx-auto">
                    <div className="spin-sip-win__wheel-glow" aria-hidden />
                    <div className="spin-sip-win__wheel-base" aria-hidden />

                    <div className="spin-sip-win__pointer" aria-hidden>
                      <span className="spin-sip-win__pointer-star">
                        <Star fill="currentColor" strokeWidth={0} />
                      </span>
                    </div>

                    {offersLoading || offers.length < 2 ? (
                      <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center rounded-full border-[12px] border-[#1638a8] bg-white/95 shadow-[0_18px_40px_rgba(22,56,168,0.28)]">
                        <Loader2 size={32} className="animate-spin text-[#1e4fd6]" aria-hidden />
                        <p className="mt-3 text-xs text-[#6b7a99]">Loading wheel…</p>
                      </div>
                    ) : (
                      <>
                        <div className="spin-sip-win__rim" aria-hidden />

                        <motion.div
                          className="spin-sip-win__face absolute inset-[14px] z-[5] rounded-full overflow-hidden"
                          style={{ background: conic }}
                          animate={{ rotate: rotation }}
                          transition={{
                            duration: spinning ? spinAnimMs / 1000 : 0,
                            ease: SPIN_EASE,
                          }}
                        >
                          <div className="spin-sip-win__face-sheen" aria-hidden />
                          {dividerLines}
                          {offers.map((offer, i) => (
                            <div
                              key={offer.id}
                              className="absolute z-10 pointer-events-none"
                              style={segmentLabelStyle(i, offers.length)}
                            >
                              <SpinWheelSegmentLabel
                                offer={offer}
                                wheelRotation={rotation}
                                spinning={spinning}
                                spinAnimMs={spinAnimMs}
                              />
                            </div>
                          ))}

                          <div className="spin-sip-win__hub absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
                            <motion.div
                              className="spin-sip-win__hub-inner"
                              animate={{ rotate: -rotation }}
                              transition={{
                                duration: spinning ? spinAnimMs / 1000 : 0,
                                ease: SPIN_EASE,
                              }}
                            >
                              <Image
                                src="/brand/logo.avif"
                                alt="Bing Chun"
                                width={36}
                                height={36}
                                className="object-contain"
                              />
                            </motion.div>
                          </div>
                        </motion.div>

                        {Array.from({ length: 20 }, (_, i) => {
                          const deg = i * 18;
                          const rad = ((deg - 90) * Math.PI) / 180;
                          const r = 47.4;
                          return (
                            <span
                              key={deg}
                              className="spin-wheel-light absolute z-20 rounded-full"
                              style={{
                                left: `${50 + r * Math.cos(rad)}%`,
                                top: `${50 + r * Math.sin(rad)}%`,
                                transform: 'translate(-50%, -50%)',
                                animationDelay: `${(i % 5) * 0.12}s`,
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}

              {inResultView && isLoseResult && (
                <div className="spin-wheel-result mt-3 rounded-xl border border-[#dbe7ff] bg-white px-3 py-3 text-center shadow-sm">
                  <PartyPopper size={22} className="mx-auto text-[#1e4fd6]" />
                  <p className="spin-wheel-result__title mt-1.5 text-sm font-semibold">Thanks for playing</p>
                  {display.loseAutoHideSeconds <= 0 && (
                    <button type="button" className="spin-sip-win__cta mt-3" onClick={close}>
                      Close
                    </button>
                  )}
                </div>
              )}

              {inResultView && !isLoseResult && (
                <div className="spin-wheel-result mt-2.5 space-y-3">
                  <div className="rounded-xl border border-[#dbe7ff] bg-white p-3.5 text-center shadow-sm">
                    {result!.offer.offerType === 'GIFT' ? (
                      <div className="mx-auto mb-2.5 h-20 w-20 overflow-hidden rounded-xl border-2 border-[#dbe7ff] bg-[#f4f8ff] shadow-lg">
                        {giftResultImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={giftResultImage}
                            alt={result!.offer.giftProduct?.name ?? 'Gift'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Gift size={32} className="text-[#1e4fd6]" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-xl border border-[#dbe7ff] bg-[#eef4ff]">
                        <ResultIcon size={22} className="text-[#1e4fd6]" />
                      </div>
                    )}

                    <p className="spin-wheel-result__eyebrow text-[10px] font-bold uppercase tracking-[0.16em]">
                      You won
                    </p>
                    <p className="spin-wheel-result__title mt-1 text-lg font-bold leading-snug">
                      {formatSpinOffer(result!.offer)}
                    </p>
                    {result!.offer.offerType === 'GIFT' && result!.offer.giftProduct?.name && (
                      <p className="spin-wheel-result__subtitle mt-1.5 text-sm">
                        {result!.offer.giftProduct.name}
                      </p>
                    )}
                    {result!.claimCode && (
                      <div className="mt-2.5 rounded-lg border border-[#dbe7ff] bg-[#f4f8ff] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7a99]">
                          Your reward code
                        </p>
                        <p className="spin-wheel-result__code mt-1 font-mono text-base font-bold tracking-wide">
                          {result!.claimCode}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {result!.claimCode ? (
                      <button type="button" className="spin-sip-win__cta flex-1" onClick={handleClaim}>
                        {claimDest.type === 'web' ? 'Add to cup' : claimDest.label}
                      </button>
                    ) : (
                      <button type="button" className="spin-sip-win__cta flex-1" onClick={close}>
                        Continue shopping
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex-1 rounded-xl border border-[#dbe7ff] bg-white px-4 py-3 text-sm font-bold text-[#0f1b4d]"
                      onClick={close}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {!inResultView && (
                <>
                  <div className="spin-sip-win__could-win">
                    <p>
                      <Sparkles size={11} className="spin-sip-win__could-win-spark" aria-hidden />
                      You could win
                      <Sparkles size={11} className="spin-sip-win__could-win-spark" aria-hidden />
                    </p>
                    <div className="spin-sip-win__could-win-row">
                      {(previewOffers.length >= 2
                        ? previewOffers.map((offer) => {
                            const Icon = offerIcon(offer.offerType);
                            return {
                              key: offer.id,
                              icon: Icon,
                              label: formatSpinOffer(offer),
                            };
                          })
                        : defaultPreview.map((item, idx) => ({
                            key: `fallback-${idx}`,
                            icon: item.icon,
                            label: item.label,
                          }))
                      ).map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.key} className="spin-sip-win__could-win-item">
                            <span>
                              <Icon size={13} strokeWidth={2.2} />
                            </span>
                            {item.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    whileHover={{ scale: spinning || spinBlocked ? 1 : 1.02 }}
                    whileTap={{ scale: spinning || spinBlocked ? 1 : 0.98 }}
                    onClick={handleSpin}
                    disabled={
                      spinning
                      || offers.length < 2
                      || offersLoading
                      || spinBlocked
                    }
                    className="spin-sip-win__cta"
                  >
                    {spinning || offersLoading ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        {spinning ? 'Spinning…' : 'Loading…'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Sparkles size={16} />
                        {spinButtonLabel}
                      </span>
                    )}
                  </motion.button>

                  <p className="spin-sip-win__meta">
                    <span>
                      <CalendarDays size={13} aria-hidden />
                      {spinsRemaining > 0
                        ? `${spinsRemaining} free spin${spinsRemaining === 1 ? '' : 's'} today`
                        : 'No spins left today'}
                    </span>
                  </p>
                  <p className="spin-sip-win__fine">Rewards valid for 7 days</p>
                  <button
                    type="button"
                    onClick={dismissForToday}
                    className="mt-2 text-[10px] font-semibold text-[#6b7a99] underline-offset-2 hover:underline"
                  >
                    Hide for today
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
