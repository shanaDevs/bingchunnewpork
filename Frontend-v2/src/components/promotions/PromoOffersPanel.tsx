'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ClipboardPaste, Loader2, Tag, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  formatEligibleOfferBenefit,
  isFreeProductPromoKind,
  isLoyaltyCampaignOffer,
  pickAutoApplyCandidate,
  pickFreeProductAutoApply,
  pickLoyaltyCampaignAutoApply,
  rewardToEligibleOffer,
  type EligiblePromoOffer,
  type EligiblePromosResponse,
} from '@/lib/promotionAutoApply';
import {
  rewardFromEligibleOffer,
  usePromoStore,
  type AppliedPromoReward,
} from '@/store/promoStore';
import { useSpinStore } from '@/store/spinStore';
import { rewardFromSpinClaim } from '@/lib/spinClaim';
import type { PromoCartLinePayload } from '@/lib/promoCartLines';
import { bogoOfferActiveInCart, freeProductBenefitLabel } from '@/lib/promoFreeProduct';
import { useCartStore } from '@/store/cartStore';

interface PromoOffersPanelProps {
  orderTotal: number;
  orderMode: 'DELIVERY' | 'TAKEAWAY' | null;
  storeId?: string | null;
  cartItems?: PromoCartLinePayload[];
  /** Allow typing spin / manual promo codes when no locked auto offer. */
  allowManualCode?: boolean;
  /** When true, skip auto-applying promos (e.g. points are currently redeeming). Manual apply still works. */
  promoBlocked?: boolean;
  promoBlockedMessage?: string;
  className?: string;
  /** Compact layout for cart sidebar */
  compact?: boolean;
  onRewardChange?: (reward: AppliedPromoReward | null) => void;
  /** Fired when the user clears or turns off an applied offer (prevents auto re-apply). */
  onPromoDismiss?: () => void;
}

export default function PromoOffersPanel({
  orderTotal,
  orderMode,
  storeId,
  cartItems = [],
  allowManualCode = true,
  className = '',
  compact = false,
  promoBlocked = false,
  promoBlockedMessage = 'Turn off point redemption to apply a promo or offer.',
  onRewardChange,
  onPromoDismiss,
}: PromoOffersPanelProps) {
  const { isAuthenticated } = useAuthStore();
  const reward = usePromoStore((s) => s.reward);
  const setReward = usePromoStore((s) => s.setReward);
  const clearReward = usePromoStore((s) => s.clearReward);
  const dismissReward = usePromoStore((s) => s.dismissReward);
  const skipAutoApply = usePromoStore((s) => s.skipAutoApply);
  const dismissedCodes = usePromoStore((s) => s.dismissedCodes);
  const parkedRewards = usePromoStore((s) => s.parkedRewards);
  const spinClaim = useSpinStore((s) => s.claim);
  const hydrateSpin = useSpinStore((s) => s.hydrate);

  const [promoInput, setPromoInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const autoTriedKey = useRef('');
  const promoInputDirty = useRef(false);
  const cartBoostTriedKey = useRef('');

  const mode = orderMode === 'DELIVERY' || orderMode === 'TAKEAWAY' ? orderMode : undefined;
  const locked = Boolean(reward?.locked);
  const cartKey = useMemo(
    () => cartItems.map((i) => `${i.productId}:${i.quantity}`).join('|'),
    [cartItems],
  );

  const { data, isFetching } = useQuery({
    queryKey: ['promos-eligible', Math.floor(orderTotal), mode, isAuthenticated, cartKey, storeId ?? '', 'WEB'],
    queryFn: () =>
      api.post<EligiblePromosResponse>(
        '/promos/eligible',
        {
          orderTotal: Math.floor(orderTotal),
          channel: 'WEB',
          ...(mode ? { orderMode: mode } : {}),
          ...(storeId ? { storeId } : {}),
          ...(cartItems.length ? { cartItems } : {}),
        },
        isAuthenticated,
      ),
    enabled: orderTotal > 0 || cartItems.length > 0,
    staleTime: 15_000,
  });

  const autoOffers = useMemo(() => {
    const fromAuto = data?.autoApplyOffers ?? [];
    const extra = (data?.offers ?? []).filter((o) => o.autoApply);
    const byCode = new Map<string, EligiblePromoOffer>();
    for (const offer of [...fromAuto, ...extra]) {
      byCode.set(offer.code.toUpperCase(), offer);
    }
    return [...byCode.values()];
  }, [data]);

  const eligibleOffers = useMemo(() => {
    const byCode = new Map<string, EligiblePromoOffer>();
    // Only offers the current cup actually qualifies for (from the eligibility API).
    for (const offer of [...(data?.offers ?? []), ...autoOffers]) {
      byCode.set(offer.code.toUpperCase(), offer);
    }

    const spinCode = spinClaim?.claimCode?.toUpperCase();
    const spinExpiresAt = spinClaim?.expiresAt;
    const spinStillValid =
      Boolean(spinCode) &&
      spinExpiresAt != null &&
      new Date(spinExpiresAt).getTime() > Date.now();
    if (spinStillValid && spinCode && spinClaim && !byCode.has(spinCode)) {
      byCode.set(
        spinCode,
        rewardToEligibleOffer(rewardFromSpinClaim(spinClaim, orderTotal, orderMode)),
      );
    }

    // Parked (removed) offers stay in the slider only if they are still eligible.
    for (const parked of parkedRewards) {
      const code = parked.code.toUpperCase();
      if (byCode.has(code)) continue;
      if (spinStillValid && code === spinCode) {
        byCode.set(code, rewardToEligibleOffer(parked));
      }
    }

    return [...byCode.values()];
  }, [autoOffers, data, parkedRewards, spinClaim, orderTotal, orderMode]);

  /** Carousel: all eligible offers, minus the one currently on the cup. */
  const carouselOffers = useMemo(() => {
    if (!reward) return eligibleOffers;
    const appliedCode = reward.code.toUpperCase();
    const appliedIsLoyalty = isLoyaltyCampaignOffer(reward);
    return eligibleOffers.filter((o) => {
      if (o.code.toUpperCase() === appliedCode) return false;
      if (appliedIsLoyalty && isLoyaltyCampaignOffer(o)) return false;
      return true;
    });
  }, [eligibleOffers, reward]);

  const slideCount = carouselOffers.length;
  const currentSlide = carouselOffers[carouselIndex] ?? carouselOffers[0] ?? null;
  const showCarousel = slideCount > 0;
  const showManualInput = allowManualCode && !reward;
  const bogoActiveInCart =
    !reward || !isFreeProductPromoKind(reward.promotionKind)
      ? true
      : bogoOfferActiveInCart(reward, cartItems);
  const benefit = reward
    ? reward.freeDelivery
      ? 'Free delivery'
      : bogoActiveInCart && freeProductBenefitLabel(reward)
        ? freeProductBenefitLabel(reward)
        : reward.discount > 0
          ? `− LKR ${reward.discount.toLocaleString()}`
          : reward.label
    : null;

  // After login: clear promo input and allow loyalty campaign auto-apply to run again.
  // Logged-out users never keep a loyalty campaign offer.
  useEffect(() => {
    setPromoInput('');
    promoInputDirty.current = false;
    autoTriedKey.current = '';
    if (!isAuthenticated && reward && isLoyaltyCampaignOffer(reward)) {
      clearReward();
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    hydrateSpin();
  }, [hydrateSpin]);

  useEffect(() => {
    onRewardChange?.(reward);
  }, [reward, onRewardChange]);

  // Drop loyalty campaign offer if API says it's no longer eligible
  useEffect(() => {
    if (!data || !isAuthenticated || !reward) return;
    if (!isLoyaltyCampaignOffer(reward)) return;
    const stillOk = [...(data.autoApplyOffers ?? []), ...(data.offers ?? [])].some(
      (o) => o.code.toUpperCase() === reward.code.toUpperCase(),
    );
    if (!stillOk) {
      clearReward();
      setPromoInput('');
      autoTriedKey.current = '';
    }
  }, [data, isAuthenticated, reward, clearReward]);

  // Drop applied offer when cart/order no longer qualifies (never drop a spin claim)
  useEffect(() => {
    if (!data || !reward) return;
    if (reward.source === 'spin' || reward.code.toUpperCase().startsWith('SPIN-')) return;
    const pool = [...(data.offers ?? []), ...(data.autoApplyOffers ?? [])];
    const stillOk = pool.some((o) => o.code.toUpperCase() === reward.code.toUpperCase());
    if (!stillOk) {
      // Quiet clear — B1G1 must be able to auto-apply again when the product returns.
      if (isFreeProductPromoKind(reward.promotionKind) || isLoyaltyCampaignOffer(reward)) {
        clearReward();
      } else {
        dismissReward();
      }
      autoTriedKey.current = '';
      cartBoostTriedKey.current = '';
      setPromoInput('');
    }
  }, [data, reward, dismissReward, clearReward]);

  // Empty cup or broken BOGO bundle — clear quietly so B1G1 can auto-apply again when re-added.
  useEffect(() => {
    if (!reward) return;
    if (reward.source === 'spin' || reward.code.toUpperCase().startsWith('SPIN-')) return;
    if (cartItems.length === 0 && orderTotal <= 0) {
      clearReward();
      autoTriedKey.current = '';
      cartBoostTriedKey.current = '';
      setPromoInput('');
      return;
    }
    if (
      isFreeProductPromoKind(reward.promotionKind) &&
      reward.discount > 0 &&
      !bogoOfferActiveInCart(reward, cartItems)
    ) {
      clearReward();
      autoTriedKey.current = '';
      cartBoostTriedKey.current = '';
      setPromoInput('');
    }
  }, [cartItems, orderTotal, reward, clearReward]);

  // BOGO / BXGY: if the cup has the paid units but not the free ones, add them so the offer can unlock.
  useEffect(() => {
    if (promoBlocked) return;
    if (!data) return;

    const ranked =
      (data.autoApplyOffers?.length ? data.autoApplyOffers : null) ??
      (data.suggested ? [data.suggested] : null) ??
      autoOffers;
    const boostOffer =
      pickFreeProductAutoApply(ranked.length ? ranked : eligibleOffers, {
        dismissedCodes,
        isAuthenticated,
      }) ??
      pickAutoApplyCandidate(ranked.length ? ranked : eligibleOffers, {
        dismissedCodes,
        isAuthenticated,
      });
    if (!boostOffer || !isFreeProductPromoKind(boostOffer.promotionKind)) return;
    const boost = boostOffer.cartBoost;
    if (!boost || boost.addQty < 1) return;

    const key = `${boostOffer.code}:${boost.productId}:${boost.addQty}:${cartKey}`;
    if (cartBoostTriedKey.current === key) return;

    const cart = useCartStore.getState();
    const line = cart.items.find((item) => item.product.id === boost.productId);
    if (!line) return;

    const result = cart.updateQuantity(line.id, line.quantity + boost.addQty);
    if (result.ok) {
      cartBoostTriedKey.current = key;
      autoTriedKey.current = '';
      toast.success(
        boostOffer.title || boostOffer.label
          ? `${boostOffer.title || boostOffer.label} — free drink added to your cup`
          : 'Free drink added for your Buy 1 Get 1 offer',
      );
    } else {
      cartBoostTriedKey.current = key;
      if (result.clamped) {
        toast.error('Not enough stock at your branch for the free drink in this offer.');
      }
    }
  }, [
    data,
    autoOffers,
    eligibleOffers,
    dismissedCodes,
    isAuthenticated,
    cartKey,
    promoBlocked,
  ]);

  // Loyalty → B1G1 → other auto-apply. B1G1 still applies when skipAutoApply is set
  // (e.g. shopper cleared a % offer, or qty was reduced then product re-added),
  // but a dismissed B1G1 stays off until the shopper taps Apply again.
  useEffect(() => {
    if (promoBlocked) return;
    if (orderTotal <= 0 && cartItems.length === 0) return;

    const rankedAuto =
      (data?.autoApplyOffers?.length ? data.autoApplyOffers : null) ??
      (data?.suggested ? [data.suggested] : null) ??
      autoOffers;
    const pool = rankedAuto.length ? rankedAuto : eligibleOffers;

    const candidate =
      pickLoyaltyCampaignAutoApply(eligibleOffers, {
        dismissedCodes,
        isAuthenticated,
      }) ??
      pickFreeProductAutoApply(pool, { dismissedCodes, isAuthenticated }) ??
      (skipAutoApply
        ? null
        : pickAutoApplyCandidate(pool, {
            dismissedCodes,
            isAuthenticated,
          }));
    if (!candidate) return;
    // Wait until the free units are in the cup before locking the reward.
    if (candidate.cartBoost && candidate.cartBoost.addQty > 0 && candidate.discount <= 0) return;

    const sameCode = reward?.code?.toUpperCase() === candidate.code.toUpperCase();
    const eligibilityPool = [...(data?.offers ?? []), ...autoOffers];
    const rewardStillEligible = Boolean(
      reward && eligibilityPool.some((o) => o.code.toUpperCase() === reward.code.toUpperCase()),
    );

    if (reward?.source === 'spin' || reward?.code?.toUpperCase().startsWith('SPIN-')) return;
    if (reward?.source === 'manual' && !sameCode) return;
    if (reward?.source === 'carousel' && !sameCode && rewardStillEligible) return;

    if (reward?.locked && sameCode) {
      // BOGO/BXGY: wait for cart boost before syncing a zero discount from stale API data.
      if (candidate.cartBoost && candidate.cartBoost.addQty > 0 && candidate.discount <= 0) return;
      const next = rewardFromEligibleOffer(candidate, 'auto');
      const shouldSync =
        !isFreeProductPromoKind(reward.promotionKind) &&
        (next.discount !== reward.discount ||
          next.freeDelivery !== reward.freeDelivery ||
          next.giftLabel !== reward.giftLabel ||
          next.giftProduct?.id !== reward.giftProduct?.id);
      const shouldSyncFreeProduct =
        isFreeProductPromoKind(reward.promotionKind) &&
        !candidate.cartBoost &&
        (next.discount > reward.discount ||
          Boolean(next.giftProduct?.id && next.giftProduct.id !== reward.giftProduct?.id) ||
          Boolean(next.giftLabel && next.giftLabel !== reward.giftLabel));
      if (shouldSync || shouldSyncFreeProduct) {
        setReward(next);
      }
      if (promoInputDirty.current) {
        setPromoInput('');
        promoInputDirty.current = false;
      }
      return;
    }

    if (reward?.locked && !sameCode && reward.source !== 'auto') return;

    const key = `${isAuthenticated ? 'auth' : 'guest'}:${candidate.code}:${Math.floor(orderTotal)}:${mode ?? ''}:${cartKey}`;
    if (autoTriedKey.current === key) return;
    autoTriedKey.current = key;

    if (candidate.code.toUpperCase().startsWith('SPIN-')) {
      const claim = useSpinStore.getState().claim;
      if (claim && claim.claimCode.toUpperCase() === candidate.code.toUpperCase()) {
        setReward(rewardFromSpinClaim(claim, orderTotal, orderMode));
      }
    } else {
      setReward(rewardFromEligibleOffer(candidate, 'auto'));
    }
    setPromoInput('');
    promoInputDirty.current = false;
  }, [eligibleOffers, data, autoOffers, orderTotal, orderMode, mode, reward, setReward, isAuthenticated, cartKey, cartItems.length, skipAutoApply, dismissedCodes, promoBlocked]);

  useEffect(() => {
    setCarouselIndex(0);
  }, [reward?.code, carouselOffers.length]);

  function dismissCurrentOffer() {
    if (!reward) return;
    autoTriedKey.current = '';
    onPromoDismiss?.();
    dismissReward();
    setPromoInput('');
    promoInputDirty.current = false;
    toast.success('Offer removed');
  }

  const applyOffer = useCallback(
    async (offer: EligiblePromoOffer, source: AppliedPromoReward['source'] = 'carousel') => {
      if (reward?.locked && reward.code.toUpperCase() !== offer.code.toUpperCase()) {
        toast.error('Turn off the applied offer first to use a different one.');
        return;
      }

      setApplying(true);
      try {
        if (offer.code.toUpperCase().startsWith('SPIN-')) {
          const claim = useSpinStore.getState().claim;
          if (claim && claim.claimCode.toUpperCase() === offer.code.toUpperCase()) {
            setReward(rewardFromSpinClaim(claim, orderTotal, orderMode));
            toast.success(`Applied: ${offer.label || offer.title || offer.code}`);
            return;
          }
          const payload: Record<string, unknown> = {
            claimCode: offer.code,
            orderTotal: Math.floor(orderTotal),
            ...(cartItems.length ? { cartItems } : {}),
          };
          if (mode) payload.orderMode = mode;
          const res = await api.post<{
            claimCode: string;
            discount: number;
            freeDelivery: boolean;
            giftLabel: string | null;
            giftProduct?: AppliedPromoReward['giftProduct'];
            offer: { label: string; offerType: string };
          }>('/spin/validate', payload);
          setReward({
            code: res.claimCode,
            discount: res.freeDelivery ? 0 : res.discount,
            freeDelivery: res.freeDelivery && mode !== 'TAKEAWAY',
            giftLabel: res.giftLabel,
            giftProduct: res.giftProduct ?? null,
            label: res.offer.label,
            locked: false,
            hideCode: false,
            source: 'spin',
          });
          toast.success(`Applied: ${res.offer.label}`);
          return;
        }

        const payload: Record<string, unknown> = {
          code: offer.code,
          orderTotal: Math.floor(orderTotal),
          channel: 'WEB',
          ...(cartItems.length ? { cartItems } : {}),
          ...(storeId ? { storeId } : {}),
        };
        if (mode) payload.orderMode = mode;
        const res = await api.post<{
          valid: boolean;
          discount: number;
          freeDelivery?: boolean;
          description?: string;
          code?: string;
          promotionKind?: string | null;
          discountType?: string | null;
          discountValue?: number | null;
          autoApply?: boolean;
          hideCode?: boolean;
          giftLabel?: string | null;
          giftProduct?: AppliedPromoReward['giftProduct'];
        }>('/promos/validate', payload, isAuthenticated);

        setReward(
          rewardFromEligibleOffer(
            {
              code: res.code || offer.code,
              discount: res.discount,
              freeDelivery: Boolean(res.freeDelivery) && mode !== 'TAKEAWAY',
              label: res.description || offer.label,
              promotionKind: res.promotionKind ?? offer.promotionKind,
              discountType: res.discountType ?? offer.discountType,
              discountValue: res.discountValue ?? offer.discountValue,
              autoApply: res.autoApply ?? offer.autoApply,
              hideCode: res.hideCode ?? offer.hideCode,
              giftLabel: res.giftLabel ?? offer.giftLabel ?? null,
              giftProduct: res.giftProduct ?? offer.giftProduct ?? null,
            },
            source,
          ),
        );
        toast.success(`Applied: ${res.description || offer.label}`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Could not apply offer');
      } finally {
        setApplying(false);
      }
    },
    [reward, orderTotal, orderMode, mode, isAuthenticated, setReward, cartItems, storeId],
  );

  async function applyManualCode(codeOverride?: string) {
    const code = (codeOverride ?? promoInput).trim();
    if (!code) {
      toast.error('Enter a promo or spin code');
      return;
    }
    if (reward?.locked) {
      toast.error('Turn off the applied offer first to use a different one.');
      return;
    }
    if (reward && reward.code.toUpperCase() !== code.toUpperCase()) {
      toast.error('Only one promo can be used. Clear the current code first.');
      return;
    }

    setApplying(true);
    try {
      if (code.toUpperCase().startsWith('SPIN-')) {
        const payload: Record<string, unknown> = {
          claimCode: code,
          orderTotal: Math.floor(orderTotal),
          ...(cartItems.length ? { cartItems } : {}),
        };
        if (mode) payload.orderMode = mode;
        const res = await api.post<{
          claimCode: string;
          discount: number;
          freeDelivery: boolean;
          giftLabel: string | null;
          giftProduct?: AppliedPromoReward['giftProduct'];
          offer: { label: string; offerType: string };
        }>('/spin/validate', payload);
        setReward({
          code: res.claimCode,
          discount: res.freeDelivery ? 0 : res.discount,
          freeDelivery: res.freeDelivery && mode !== 'TAKEAWAY',
          giftLabel: res.giftLabel,
          giftProduct: res.giftProduct ?? null,
          label: res.offer.label,
          locked: false,
          hideCode: false,
          source: 'spin',
        });
        toast.success(`Applied: ${res.offer.label}`);
      } else {
        const payload: Record<string, unknown> = {
          code,
          orderTotal: Math.floor(orderTotal),
          channel: 'WEB',
          ...(cartItems.length ? { cartItems } : {}),
          ...(storeId ? { storeId } : {}),
        };
        if (mode) payload.orderMode = mode;
        const res = await api.post<{
          discount: number;
          freeDelivery?: boolean;
          description?: string;
          code?: string;
          promotionKind?: string | null;
          discountType?: string | null;
          discountValue?: number | null;
          autoApply?: boolean;
          hideCode?: boolean;
          giftLabel?: string | null;
          giftProduct?: AppliedPromoReward['giftProduct'];
        }>('/promos/validate', payload, isAuthenticated);
        setReward(
          rewardFromEligibleOffer(
            {
              code: res.code || code,
              discount: res.discount,
              freeDelivery: Boolean(res.freeDelivery) && mode !== 'TAKEAWAY',
              label: res.description || code,
              promotionKind: res.promotionKind,
              discountType: res.discountType,
              discountValue: res.discountValue,
              autoApply: res.autoApply,
              hideCode: res.hideCode,
              giftLabel: res.giftLabel ?? null,
              giftProduct: res.giftProduct ?? null,
            },
            'manual',
          ),
        );
        toast.success(`Promo applied: ${res.description || code}`);
      }
      setPromoInput('');
      promoInputDirty.current = false;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setApplying(false);
    }
  }

  async function pastePromoCode() {
    try {
      const text = (await navigator.clipboard.readText()).trim().toUpperCase().replace(/\s+/g, '');
      if (!text) {
        toast.error('Clipboard is empty');
        return;
      }
      promoInputDirty.current = true;
      setPromoInput(text);
      void applyManualCode(text);
    } catch {
      toast.error('Could not paste');
    }
  }

  function handleClear() {
    dismissCurrentOffer();
  }

  return (
    <div className={`promo-offers-panel${compact ? ' promo-offers-panel--compact' : ''} ${className}`.trim()}>
      {reward && (
        <div className={`promo-offers-panel__applied${locked ? ' promo-offers-panel__applied--locked' : ''}`}>
          <div className="promo-offers-panel__applied-main">
            <Tag size={14} className="shrink-0 text-brand" aria-hidden />
            <div className="min-w-0">
              <p className="promo-offers-panel__applied-label">
                {reward.label.replace(/(\d+)\s+%/g, '$1%')}
              </p>
              {benefit && <p className="promo-offers-panel__applied-benefit">{benefit}</p>}
              {!reward.hideCode && !locked && (
                <p className="promo-offers-panel__applied-code">{reward.code}</p>
              )}
            </div>
          </div>
          <label className="promo-offers-panel__toggle" title="Turn this offer off">
            <span className="sr-only">Offer applied</span>
            <input
              type="checkbox"
              checked
              onChange={handleClear}
              aria-label={`Turn off ${reward.label}`}
            />
            <span className="promo-offers-panel__toggle-track" aria-hidden>
              <span className="promo-offers-panel__toggle-thumb" />
            </span>
          </label>
        </div>
      )}

      {showCarousel && (
        <div className="promo-offers-panel__carousel" aria-label="Available offers">
          <div className="promo-offers-panel__carousel-head">
            <p className="promo-offers-panel__carousel-title">
              {slideCount === 1 ? 'Available offer' : 'Available offers'}
            </p>
            {isFetching && <Loader2 size={12} className="animate-spin text-muted" />}
          </div>

          <div className="promo-offers-panel__carousel-viewport">
            {slideCount > 1 && (
              <button
                type="button"
                className="promo-offers-panel__nav"
                onClick={() => setCarouselIndex((i) => (i - 1 + slideCount) % slideCount)}
                aria-label="Previous offer"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <div className="promo-offers-panel__slide-wrap">
              <AnimatePresence mode="wait" initial={false}>
                {currentSlide && (
                  <motion.div
                    key={currentSlide.code}
                    className="promo-offers-panel__slide"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="promo-offers-panel__slide-body">
                      <p className="promo-offers-panel__slide-title">
                        {(currentSlide.title || currentSlide.label).replace(/(\d+)\s+%/g, '$1%')}
                      </p>
                      <p className="promo-offers-panel__slide-benefit">
                        {formatEligibleOfferBenefit(currentSlide)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary promo-offers-panel__apply-btn"
                      disabled={applying || locked}
                      title={locked ? 'Remove the applied offer first' : 'Apply'}
                      onClick={() => void applyOffer(currentSlide, 'carousel')}
                    >
                      {applying ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {slideCount > 1 && (
              <button
                type="button"
                className="promo-offers-panel__nav"
                onClick={() => setCarouselIndex((i) => (i + 1) % slideCount)}
                aria-label="Next offer"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          {slideCount > 1 && (
            <div className="promo-offers-panel__dots" role="tablist">
              {carouselOffers.map((o, i) => (
                <button
                  key={o.code}
                  type="button"
                  role="tab"
                  aria-selected={i === carouselIndex}
                  className={`promo-offers-panel__dot${i === carouselIndex ? ' promo-offers-panel__dot--active' : ''}`}
                  onClick={() => setCarouselIndex(i)}
                  aria-label={`Offer ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showManualInput && (
        <div className="promo-offers-panel__manual">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-brand shrink-0" aria-hidden />
            <div className="relative min-w-0 flex-1">
              <input
                className="input-field w-full text-sm uppercase font-mono tracking-wide pr-20"
                placeholder="Promo Code"
                value={promoInput}
                onChange={(e) => {
                  promoInputDirty.current = true;
                  setPromoInput(e.target.value.toUpperCase().replace(/\s+/g, ''));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (promoInput.trim().length >= 3) void applyManualCode();
                  }
                }}
                aria-label="Promo or spin code"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {applying ? (
                  <span className="flex h-8 w-8 items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-muted" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void pastePromoCode()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                    aria-label="Paste promo code"
                  >
                    <ClipboardPaste size={15} />
                  </button>
                )}
                {promoInput && (
                  <button
                    type="button"
                    onClick={() => setPromoInput('')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    aria-label="Clear input"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
