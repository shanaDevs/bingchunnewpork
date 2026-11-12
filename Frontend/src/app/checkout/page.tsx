'use client';
import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, CheckCircle, Store, MapPin, Phone, User, Pencil, Loader2, Gift } from 'lucide-react';
import Link from 'next/link';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useSpinStore } from '@/store/spinStore';
import { api, getStoredUser, setUser } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { AddressMapPicker, type AddressSelection } from '@/components/order/AddressMapPicker';
import ProductImage from '@/components/ui/ProductImage';
import type { DeliveryValidation, DeliveryBranchOption, Address, User as UserType } from '@/types';
import { branchManuallyClosedMessage } from '@/lib/storeOrderingHours';
import toast from 'react-hot-toast';

function isDeliveryBranchOrderable(branch: DeliveryBranchOption): boolean {
  return branch.suggested && !branch.branchClosed;
}
import { getFrontendOrigin } from '@/lib/apiBase';
import { markOrderForCelebration, markOrderAwaitingPayment, clearOrderPaymentFlags } from '@/lib/orderCelebration';
import { openPayHereCheckout, preparePayHereScript } from '@/lib/openPayHereCheckout';
import { openWebXPayCheckout } from '@/lib/openWebXPayCheckout';
import type { PayHereSession } from '@/components/payment/PayHereCheckout';
import {
  appliesConvenienceFee,
  chargedConvenienceFee,
  computeConvenienceFee,
  formatConvenienceFeeLabel,
  resolveCheckoutConvenienceRates,
} from '@/lib/fees';
import {
  formatDrinkOptionLine,
  normalizeIceLevel,
  normalizeSugarLevel,
} from '@/lib/drinkOptions';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { isPlaceholderCustomerName, resolveCheckoutContactName } from '@/lib/customerName';
import OrderSchedulePicker from '@/components/order/OrderSchedulePicker';
import {
  clampScheduledAt,
  getScheduleTimeBounds,
  isScheduledAtInPast,
  isSchedulingLocked,
  scheduledAtFromPresetMinutes,
  schedulePickupTimeLabel,
  validateScheduledAt,
} from '@/lib/orderSchedule';
import { useBranchOrderingHours } from '@/hooks/useBranchOrderingHours';
import OnlineOrderingClosedBanner from '@/components/order/OnlineOrderingClosedBanner';
import { formatPhoneInput, isValidSriLankanPhone, normalizePhone, userNeedsPhoneNumber } from '@/lib/phone';
import { useCheckoutPhoneAuth } from '@/hooks/useCheckoutPhoneAuth';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { getPaymentMethodIcon } from '@/lib/paymentMethodIcons';
import {
  PICKUP_ONLINE_PAYMENT_THRESHOLD,
  requiresOnlinePaymentForPickup,
  filterCheckoutPaymentMethods,
  activePickupMaxOrderAmount,
  isPickupOrderOverMaxAmount,
} from '@/lib/pickupPayment';
import {
  isCheckoutReservationActive,
  startCheckoutReservation,
} from '@/lib/inventoryReservation';
import { rewardFromSpinClaim } from '@/lib/spinClaim';
import PromoOffersPanel from '@/components/promotions/PromoOffersPanel';
import { isLoyaltyCampaignOffer } from '@/lib/promotionAutoApply';
import { usePromoStore, rewardFromEligibleOffer } from '@/store/promoStore';
import { usePromoSubtotalDiscount } from '@/hooks/usePromoSubtotalDiscount';
import { freeProductBenefitLabel, displayPaidSubtotal, showsFreeProductSummaryLine } from '@/lib/promoFreeProduct';
import { rewardDiscountForSubtotal } from '@/lib/promoSubtotalDiscount';
import { cartItemsToPromoPayload } from '@/lib/promoCartLines';
import CheckoutPointsRedeem from '@/components/checkout/CheckoutPointsRedeem';
import {
  calcCheckoutPointsRedeem,
  DEFAULT_LOYALTY_SETTINGS,
  estimateLoyaltyPoints,
  isCheckoutRedeemUnlocked,
  type LoyaltySummary,
} from '@/lib/loyalty';
import { queryClient } from '@/lib/queryClient';
import { invalidateCustomerOrderLists } from '@/lib/orderCache';

const DEFAULT_OPEN_TIME = '08:00';
const DEFAULT_CLOSE_TIME = '23:00';

type SavedDeliveryInfo = NonNullable<ReturnType<typeof useCartStore.getState>['deliveryInfo']>;

function validationFromDeliveryInfo(info: SavedDeliveryInfo): DeliveryValidation {
  return {
    eligible: true,
    store: {
      id: info.storeId,
      name: info.storeName,
      address: '',
      openTime: info.openTime,
      closeTime: info.closeTime,
    },
    zone: { id: info.zoneId, name: '', fee: info.fee, minOrder: info.minOrder },
    estimatedMinutes: info.estimatedMinutes,
  };
}

function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    items,
    orderMode,
    subtotal,
    deliveryInfo,
    takeawayInfo,
    setDeliveryInfo,
    completeOrder,
    scheduledAt,
    setScheduledAt,
    scheduleMode,
    setScheduleMode,
    reservationUuid,
    reservationExpiresAt,
    setReservation,
    clearReservation,
    getFulfillmentStoreId,
  } = useCartStore();
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const authHydrated = useAuthHydrated();
  const cartHydrated = useCartHydrated();
  const { claim, hydrate, clearClaim } = useSpinStore();
  const sub = subtotal();
  usePromoSubtotalDiscount(sub);
  const promoCartItems = useMemo(() => cartItemsToPromoPayload(items), [items]);
  const isTakeaway = orderMode === 'TAKEAWAY';
  const branchOrdering = useBranchOrderingHours();
  const orderingConfig = branchOrdering.config;
  const resolvedHours = branchOrdering.resolved;
  const storeOpenTime = resolvedHours?.scheduleOpenTime ?? DEFAULT_OPEN_TIME;
  const storeCloseTime = resolvedHours?.scheduleCloseTime ?? DEFAULT_CLOSE_TIME;
  const pickupCutoffMinutes = resolvedHours?.pickupCutoffMinutes ?? 50;
  const schedulingLocked = isSchedulingLocked(storeCloseTime, new Date(), pickupCutoffMinutes);
  const onlineOrderingOpen = branchOrdering.isOpen;
  const onlineOrderingClosedText = branchOrdering.closedMessage || 'Online ordering is currently closed.';

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [placing, setPlacing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [userDisabledRedeem, setUserDisabledRedeem] = useState(false);
  const [usePointsRaw, setUsePointsRaw] = useState<number | null>(null);
  const completingOrderRef = useRef(false);
  const paymentErrorHandledRef = useRef(false);
  const placeOrderIdempotencyKey = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `checkout-${Date.now()}`,
  );

  const handleProfileFilled = useCallback((profile: { name: string; phone: string; email?: string }) => {
    if (!isPlaceholderCustomerName(profile.name)) {
      setGuestName(profile.name);
    }
    setGuestPhone(profile.phone);
    if (profile.email) setGuestEmail(profile.email);
  }, []);

  const needsPhoneVerification = Boolean(isAuthenticated && user && userNeedsPhoneNumber(user));
  const hasVerifiedContact = Boolean(isAuthenticated && user && !needsPhoneVerification);

  const phoneAuth = useCheckoutPhoneAuth({
    phone: guestPhone,
    name: guestName,
    email: guestEmail,
    enabled: !isAuthenticated || needsPhoneVerification,
    mode: needsPhoneVerification ? 'link' : 'guest',
    onProfileFilled: handleProfileFilled,
  });
  const hasSavedDelivery = orderMode === 'DELIVERY' && Boolean(deliveryInfo?.storeId && deliveryInfo?.address);
  const [editingDelivery, setEditingDelivery] = useState(false);
  const reward = usePromoStore((s) => s.reward);
  const setReward = usePromoStore((s) => s.setReward);
  const clearReward = usePromoStore((s) => s.clearReward);
  const skipAutoApply = usePromoStore((s) => s.skipAutoApply);
  const dismissedCodes = usePromoStore((s) => s.dismissedCodes);
  const rewardAutoTried = useRef(false);
  const promoDismissedByUser = useRef(false);

  const [addressSelection, setAddressSelection] = useState<AddressSelection | null>(
    deliveryInfo?.address && deliveryInfo.lat != null && deliveryInfo.lng != null
      ? { address: deliveryInfo.address, lat: deliveryInfo.lat, lng: deliveryInfo.lng }
      : null
  );
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<DeliveryValidation | null>(() =>
    deliveryInfo?.storeId ? validationFromDeliveryInfo(deliveryInfo) : null
  );
  const [selectedDeliveryStoreId, setSelectedDeliveryStoreId] = useState<string | null>(
    () => deliveryInfo?.storeId ?? null,
  );

  const { data: savedAddresses = [] } = useQuery<Address[]>({
    queryKey: ['addresses'],
    queryFn: () => api.get('/addresses', true),
    enabled: isAuthenticated && orderMode === 'DELIVERY',
  });

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-checkout'],
    queryFn: () =>
      api.get<{ pickupMaxOrderAmount?: number | null }>('/settings/app'),
    enabled: isTakeaway,
    staleTime: 60_000,
  });

  const pickupMaxOrderAmount = activePickupMaxOrderAmount(appSettings?.pickupMaxOrderAmount);

  const { data: paymentConfig } = useQuery({
    queryKey: ['payment-methods', orderMode, sub],
    queryFn: () =>
      api.get<{
        methods: { id: string; label: string; icon?: string }[];
        activeOnlineGateway?: 'PAYHERE' | 'WEBXPAY';
        payhereSandbox: boolean;
        payhereConfigured: boolean;
        webxpayConfigured?: boolean;
        onlineGatewayConfigured?: boolean;
        convenientFeeRate?: number;
        convenientFeePercent?: number;
        pickupConvenientFeeRate?: number;
        deliveryConvenientFeeRate?: number;
        pickupOnlinePaymentThreshold?: number;
      }>(`/settings/payment-methods?orderMode=${orderMode}&orderSubtotal=${sub}`),
    enabled: !!orderMode && sub > 0,
    staleTime: 0,
  });

  const { data: loyalty } = useQuery<LoyaltySummary>({
    queryKey: ['loyalty-summary', getFulfillmentStoreId() ?? ''],
    queryFn: () => {
      const storeId = getFulfillmentStoreId();
      const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
      return api.get(`/loyalty/summary${qs}`, true);
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: freshProfile } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<UserType>('/auth/me', true),
    enabled: isAuthenticated && authHydrated,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (freshProfile) updateUser(freshProfile);
  }, [freshProfile, updateUser]);

  const paymentMethods = paymentConfig?.methods ?? [];
  const availablePaymentMethods = useMemo(
    () => filterCheckoutPaymentMethods(paymentMethods, orderMode, sub, pickupMaxOrderAmount),
    [paymentMethods, orderMode, sub, pickupMaxOrderAmount],
  );
  const baseDeliveryFee =
    orderMode === 'DELIVERY' ? (deliveryInfo?.fee ?? validation?.zone?.fee ?? 0) : 0;
  const deliveryFee = reward?.freeDelivery ? 0 : baseDeliveryFee;
  const convenienceRates = resolveCheckoutConvenienceRates(paymentConfig);
  const convenienceFee = chargedConvenienceFee(sub, orderMode, paymentMethod, convenienceRates);
  const paymentForFeePreview =
    paymentMethod ||
    (isTakeaway
      ? (availablePaymentMethods.find((m) => m.id === 'PAYHERE' || m.id === 'CARD')?.id ??
        availablePaymentMethods[0]?.id)
      : '');
  const displayConvenienceFee = paymentForFeePreview
    ? computeConvenienceFee(sub, orderMode, paymentForFeePreview, convenienceRates)
    : 0;
  const showWaivedPickupConvenienceFee =
    isTakeaway &&
    displayConvenienceFee > 0 &&
    (!paymentMethod || appliesConvenienceFee(orderMode, paymentMethod));
  const discount = reward ? rewardDiscountForSubtotal(reward, sub) : 0;
  const freeProductLine = showsFreeProductSummaryLine(reward, promoCartItems)
    ? freeProductBenefitLabel(reward)
    : null;
  const paidSubtotal = displayPaidSubtotal(sub, reward, promoCartItems);
  const hasPromoApplied = Boolean(reward);
  const discountPercentLabel =
    reward?.discountType?.toUpperCase() === 'PERCENTAGE' &&
    reward.discountValue != null &&
    reward.discountValue > 0
      ? reward.discountValue
      : (() => {
          if (sub <= 0 || discount <= 0) return null;
          const pct = Math.round((discount / sub) * 100);
          if (pct < 1 || pct > 100) return null;
          return Math.floor((sub * pct) / 100) === discount ? pct : null;
        })();
  const remainingBeforeLoyalty = Math.max(0, sub + deliveryFee + convenienceFee - discount);
  const availablePoints = loyalty?.points ?? user?.loyaltyPoints ?? 0;
  const redeemValue = loyalty?.settings?.redeemValue ?? DEFAULT_LOYALTY_SETTINGS.redeemValue;
  const checkoutRedeemEnabled = loyalty?.settings?.checkoutRedeemEnabled !== false;
  const minPointsToRedeem =
    loyalty?.settings?.minPointsToRedeem ?? DEFAULT_LOYALTY_SETTINGS.minPointsToRedeem ?? 100;
  const lifetimePointsEarned = loyalty?.lifetimePointsEarned ?? 0;
  const checkoutRedeemUnlocked =
    loyalty?.checkoutRedeemUnlocked ??
    isCheckoutRedeemUnlocked({
      lifetimePointsEarned,
      minPointsToRedeem,
    });
  const redeemCap = calcCheckoutPointsRedeem({
    usePoints: 0,
    availablePoints,
    redeemValue,
    subtotal: sub,
    remainingPayable: remainingBeforeLoyalty,
  });
  const redeemEnabled =
    isAuthenticated &&
    checkoutRedeemEnabled &&
    checkoutRedeemUnlocked &&
    redeemCap.maxPoints > 0 &&
    !userDisabledRedeem &&
    !hasPromoApplied;
  const redeemCalc = calcCheckoutPointsRedeem({
    usePoints: redeemEnabled ? (usePointsRaw ?? redeemCap.maxPoints) : 0,
    availablePoints,
    redeemValue,
    subtotal: sub,
    remainingPayable: remainingBeforeLoyalty,
  });
  const loyaltyDiscount = redeemEnabled ? redeemCalc.discountLkr : 0;
  const usePoints = redeemEnabled ? redeemCalc.points : 0;
  const pointsRedeemActive = redeemEnabled;
  const total = Math.max(0, remainingBeforeLoyalty - loyaltyDiscount);
  const pickupOverMaxAmount =
    isTakeaway && isPickupOrderOverMaxAmount(total, pickupMaxOrderAmount);

  useEffect(() => {
    if (!hasPromoApplied) return;
    setUserDisabledRedeem(true);
    setUsePointsRaw(0);
  }, [hasPromoApplied]);

  useEffect(() => {
    hydrate();
    const claim = useSpinStore.getState().claim;
    const current = usePromoStore.getState().reward;
    const code = current?.code?.toUpperCase() ?? '';
    if (code.startsWith('SPIN-') && (!claim || claim.claimCode.toUpperCase() !== code)) {
      clearReward();
    }
  }, [hydrate, clearReward]);

  useEffect(() => {
    preparePayHereScript();
  }, []);

  useEffect(() => {
    if (!reservationUuid) return;
    if (!isCheckoutReservationActive(reservationUuid, reservationExpiresAt)) {
      clearReservation();
    }
  }, [reservationUuid, reservationExpiresAt, clearReservation]);

  useEffect(() => {
    if (paymentErrorHandledRef.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'failed') return;

    paymentErrorHandledRef.current = true;
    clearOrderPaymentFlags();
    clearReservation();
    const reason = params.get('reason')?.trim();
    const message = reason || 'Payment failed. Your order was not placed — please try again.';
    setPaymentError(message);
    toast.error(message, { duration: 5000 });
    router.replace('/checkout', { scroll: false });
  }, [router, clearReservation]);

  useEffect(() => {
    if (!paymentError) {
      paymentErrorHandledRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => setPaymentError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [paymentError]);

  useEffect(() => {
    if (!cartHydrated) return;
    if (completingOrderRef.current) return;
    if (items.length === 0) router.replace('/menu');
    if (!orderMode) router.replace('/cart');
  }, [cartHydrated, items.length, orderMode, router]);

  useEffect(() => {
    if (!availablePaymentMethods.length) return;

    if (isTakeaway && requiresOnlinePaymentForPickup(sub) && paymentMethod === 'CASH_AT_COUNTER') {
      const onlineMethod =
        availablePaymentMethods.find((method) => method.id === 'PAYHERE' || method.id === 'CARD') ??
        availablePaymentMethods[0];
      if (onlineMethod) {
        setPaymentMethod(onlineMethod.id);
        return;
      }
    }

    if (!availablePaymentMethods.some((method) => method.id === paymentMethod)) {
      setPaymentMethod(availablePaymentMethods[0]?.id ?? 'PAYHERE');
    }
  }, [availablePaymentMethods, paymentMethod, isTakeaway, sub]);

  useEffect(() => {
    if (user) {
      if (!isPlaceholderCustomerName(user.name)) {
        setGuestName(user.name);
      }
      if (user.phone && !userNeedsPhoneNumber(user)) {
        setGuestPhone(user.phone);
      }
      if (user.email) setGuestEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (orderMode !== 'DELIVERY' || !deliveryInfo?.storeId || editingDelivery) return;
    setValidation(validationFromDeliveryInfo(deliveryInfo));
    if (deliveryInfo.address && deliveryInfo.lat != null && deliveryInfo.lng != null) {
      setAddressSelection({
        address: deliveryInfo.address,
        lat: deliveryInfo.lat,
        lng: deliveryInfo.lng,
      });
    }
  }, [orderMode, deliveryInfo, editingDelivery]);

  useEffect(() => {
    if (orderMode !== 'DELIVERY' || !editingDelivery || !addressSelection?.lat) return;
    const t = setTimeout(() => {
      void (async () => {
        setValidating(true);
        try {
          const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
            lat: addressSelection.lat,
            lng: addressSelection.lng,
            address: addressSelection.address,
          });
          setValidation(result);
          if (result.eligible && result.store) {
            setSelectedDeliveryStoreId(result.store.id);
          }
        } catch {
          setValidation(null);
        } finally {
          setValidating(false);
        }
      })();
    }, 650);
    return () => clearTimeout(t);
  }, [addressSelection, orderMode, editingDelivery]);

  useEffect(() => {
    if (!isTakeaway) {
      if (scheduledAt) setScheduledAt(null);
      if (scheduleMode) setScheduleMode(null);
      return;
    }
    const bounds = getScheduleTimeBounds(storeOpenTime, storeCloseTime, new Date(), pickupCutoffMinutes);
    if (bounds.locked || !bounds.canSchedule) {
      if (scheduledAt) setScheduledAt(null);
      if (scheduleMode) setScheduleMode(null);
      return;
    }
    if (
      scheduledAt &&
      isScheduledAtInPast(scheduledAt, storeOpenTime, storeCloseTime, undefined, scheduleMode, pickupCutoffMinutes)
    ) {
      const clamped = clampScheduledAt(
        scheduledAt,
        storeOpenTime,
        storeCloseTime,
        undefined,
        scheduleMode,
        pickupCutoffMinutes,
      );
      setScheduledAt(clamped);
      return;
    }
    if (!scheduledAt) {
      const iso = scheduledAtFromPresetMinutes(15, storeOpenTime, storeCloseTime, new Date(), pickupCutoffMinutes);
      if (iso) {
        setScheduledAt(iso);
        setScheduleMode(15);
      }
    }
  }, [isTakeaway, storeOpenTime, storeCloseTime, pickupCutoffMinutes, scheduledAt, scheduleMode, setScheduledAt, setScheduleMode]);

  useEffect(() => {
    if (!isTakeaway) return;
    const id = window.setInterval(() => {
      const current = useCartStore.getState().scheduledAt;
      const currentMode = useCartStore.getState().scheduleMode;
      if (!current) return;
      const freshNow = new Date();
      if (!isScheduledAtInPast(current, storeOpenTime, storeCloseTime, freshNow, currentMode, pickupCutoffMinutes)) return;
      const clamped = clampScheduledAt(
        current,
        storeOpenTime,
        storeCloseTime,
        freshNow,
        currentMode,
        pickupCutoffMinutes,
      );
      setScheduledAt(clamped);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isTakeaway, storeOpenTime, storeCloseTime, pickupCutoffMinutes, setScheduledAt]);

  // Auto-apply spin reward once after a spin; recalculate when subtotal changes.
  useEffect(() => {
    if (!claim?.claimCode) return;
    if (pointsRedeemActive) return;
    if (promoDismissedByUser.current) return;

    const promo = usePromoStore.getState();
    const current = promo.reward;
    const claimCode = claim.claimCode.toUpperCase();
    if (promo.skipAutoApply || promo.dismissedCodes.includes(claimCode)) return;
    if (current?.locked && current.source !== 'spin') return;

    const currentCode = current?.code?.toUpperCase();

    if (current?.source === 'spin' && currentCode === claimCode) {
      setReward(rewardFromSpinClaim(claim, sub, orderMode));
      return;
    }

    if (current && current.source !== 'spin') return;

    if (!current) {
      setReward(rewardFromSpinClaim(claim, sub, orderMode));
    }
  }, [claim, orderMode, sub, setReward, pointsRedeemActive]);

  useEffect(() => {
    if (!claim?.claimCode || rewardAutoTried.current) return;
    if (promoDismissedByUser.current) return;
    if (usePromoStore.getState().reward?.locked) return;
    rewardAutoTried.current = true;
  }, [claim]);

  const handlePromoDismiss = useCallback(() => {
    promoDismissedByUser.current = true;
  }, []);

  // Prefill from /promotions "Use at checkout" → /checkout?promo=CODE (manual only if unlocked)
  useEffect(() => {
    const fromQuery = (searchParams.get('promo') || searchParams.get('code') || '').trim().toUpperCase();
    if (!fromQuery || fromQuery.length < 3) return;
    if (pointsRedeemActive) return;
    if (promoDismissedByUser.current) return;
    const current = usePromoStore.getState().reward;
    if (current?.locked) return;
    if (current?.code?.toUpperCase() === fromQuery) return;

    let cancelled = false;
    (async () => {
      try {
        if (fromQuery.startsWith('SPIN-')) return;
        const payload: Record<string, unknown> = {
          code: fromQuery,
          orderTotal: Math.floor(sub),
          channel: 'WEB',
        };
        if (orderMode === 'DELIVERY' || orderMode === 'TAKEAWAY') {
          payload.orderMode = orderMode;
        }
        const storeId = getFulfillmentStoreId();
        if (storeId) payload.storeId = storeId;
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
        }>('/promos/validate', payload, isAuthenticated);
        if (cancelled) return;
        if (pointsRedeemActive) return;
        if (usePromoStore.getState().reward?.locked) return;
        setReward(
          rewardFromEligibleOffer(
            {
              code: res.code || fromQuery,
              discount: res.discount,
              freeDelivery: Boolean(res.freeDelivery) && orderMode !== 'TAKEAWAY',
              label: res.description || fromQuery,
              promotionKind: res.promotionKind,
              discountType: res.discountType,
              discountValue: res.discountValue,
              autoApply: res.autoApply,
              hideCode: res.hideCode,
            },
            res.autoApply ? 'auto' : 'manual',
          ),
        );
      } catch {
        /* ignore invalid query codes */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function validateDelivery() {
    if (!addressSelection?.address) {
      toast.error('Please select your delivery address on the map');
      return;
    }
    setValidating(true);
    try {
      const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
        lat: addressSelection.lat,
        lng: addressSelection.lng,
        address: addressSelection.address,
        ...(selectedDeliveryStoreId ? { storeId: selectedDeliveryStoreId } : {}),
      });
      setValidation(result);
      if (result.eligible && result.store) {
        setSelectedDeliveryStoreId(result.store.id);
        setDeliveryInfo({
          storeId: result.store.id,
          storeName: result.store.name,
          zoneId: result.zone!.id,
          fee: result.zone!.fee,
          minOrder: result.zone!.minOrder,
          estimatedMinutes: result.estimatedMinutes!,
          address: addressSelection.address,
          lat: addressSelection.lat,
          lng: addressSelection.lng,
          openTime: result.store.openTime ?? DEFAULT_OPEN_TIME,
          closeTime: result.store.closeTime ?? DEFAULT_CLOSE_TIME,
          onlineOrderStartTime: result.store.onlineOrderStartTime,
          onlineOrderStopTime: result.store.onlineOrderStopTime,
          pickupCutoffMinutes: result.store.pickupCutoffMinutes,
          branchClosedAt: result.store.branchClosedAt,
        });
        setEditingDelivery(false);
      } else {
        toast.error(result.message || 'Delivery not available to this address');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not validate address');
    } finally {
      setValidating(false);
    }
  }

  function selectCheckoutDeliveryBranch(branch: DeliveryBranchOption) {
    if (!isDeliveryBranchOrderable(branch)) {
      toast.error(
        branch.branchClosed
          ? branchManuallyClosedMessage()
          : 'This branch cannot deliver to your location. Please choose a suggested branch.',
      );
      return;
    }
    setSelectedDeliveryStoreId(branch.id);
    if (!addressSelection) return;
    void (async () => {
      setValidating(true);
      try {
        const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
          lat: addressSelection.lat,
          lng: addressSelection.lng,
          address: addressSelection.address,
          storeId: branch.id,
        });
        setValidation(result);
      } catch {
        toast.error('Could not validate branch for this location');
      } finally {
        setValidating(false);
      }
    })();
  }

  const suggestedDeliveryBranches = validation?.suggestedBranches?.filter((b) => b.suggested) ?? [];
  const deliveryBranchMarkers = suggestedDeliveryBranches.map((b) => ({
    id: b.id,
    name: b.name,
    lat: b.lat,
    lng: b.lng,
  }));

  async function placeOrder() {
    if (!paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    if (pickupOverMaxAmount && pickupMaxOrderAmount != null) {
      toast.error(
        `Pickup orders above LKR ${pickupMaxOrderAmount.toLocaleString()} cannot be placed online`,
      );
      return;
    }
    if (isTakeaway && requiresOnlinePaymentForPickup(sub) && paymentMethod === 'CASH_AT_COUNTER') {
      toast.error(
        `Takeaway orders of LKR ${PICKUP_ONLINE_PAYMENT_THRESHOLD.toLocaleString()} or more must be paid online`,
      );
      setPaymentMethod('PAYHERE');
      return;
    }
    const storedUser = getStoredUser() as UserType | null;
    const contactName = resolveCheckoutContactName(
      guestName,
      user?.name ?? storedUser?.name,
    );
    const contactPhone = normalizePhone(
      needsPhoneVerification ? guestPhone : (user?.phone ?? storedUser?.phone ?? guestPhone),
    );
    if (!isAuthenticated || !hasVerifiedContact) {
      toast.error('Please verify your mobile number before placing the order');
      return;
    }
    if (isPlaceholderCustomerName(contactName)) {
      toast.error('Please enter your name to continue');
      return;
    }
    if (!contactName || !isValidSriLankanPhone(contactPhone)) {
      toast.error('Please enter a valid mobile number');
      return;
    }

    if (!onlineOrderingOpen) {
      toast.error(onlineOrderingClosedText);
      return;
    }

    const storeId = useCartStore.getState().getFulfillmentStoreId();

    if (!storeId) {
      toast.error(
        orderMode === 'DELIVERY'
          ? 'Please validate your delivery address'
          : 'Please select a pickup store from the menu first'
      );
      return;
    }

    if (orderMode === 'DELIVERY' && !deliveryInfo?.storeId) {
      toast.error('Please set up delivery from the menu first');
      return;
    }

    if (isTakeaway && !schedulingLocked && !scheduledAt) {
      toast.error('Please select a pickup time');
      return;
    }

    if (isTakeaway && !schedulingLocked && scheduledAt) {
      const scheduleCheck = validateScheduledAt(
        scheduledAt,
        storeOpenTime,
        storeCloseTime,
        new Date(),
        scheduleMode,
        pickupCutoffMinutes,
      );
      if (!scheduleCheck.ok) {
        toast.error(scheduleCheck.error);
        const clamped = clampScheduledAt(
          scheduledAt,
          storeOpenTime,
          storeCloseTime,
          new Date(),
          scheduleMode,
          pickupCutoffMinutes,
        );
        if (clamped) setScheduledAt(clamped);
        return;
      }
    }

    setPlacing(true);
    let reservationForOrder = reservationUuid;
    try {
      const useAuth = true;

      const resolvedContactName = contactName;
      const resolvedContactPhone = contactPhone;

      const orderItems = items.map((item) => ({
        productId: item.product.id,
        size: item.size,
        sugarLevel: normalizeSugarLevel(item.sugarLevel),
        iceLevel: normalizeIceLevel(item.iceLevel),
        toppingIds: item.toppings.map((t) => t.id),
        quantity: item.quantity,
      }));

      const isOnlinePaymentMethod =
        paymentMethod === 'PAYHERE' || paymentMethod === 'CARD';

      if (isOnlinePaymentMethod) {
        try {
          const session = await startCheckoutReservation(
            storeId,
            items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              productName: item.product.name,
            })),
            reservationUuid,
            useAuth,
            reservationExpiresAt,
          );
          reservationForOrder = session.reservationUuid;
          setReservation(session.reservationUuid, session.expiresAt);
        } catch (reservationErr) {
          toast.error(
            reservationErr instanceof Error
              ? reservationErr.message
              : 'Could not reserve items — please try again',
          );
          return;
        }
      }

      const loyaltyAutoApplySkipped = dismissedCodes.some((code) =>
        isLoyaltyCampaignOffer({ code }),
      );
      const loyaltyAutoAppliedOnCup =
        reward != null &&
        isLoyaltyCampaignOffer(reward) &&
        reward.source === 'auto' &&
        reward.locked;

      const body: Record<string, unknown> = {
        orderMode,
        storeId,
        deliveryZoneId: deliveryInfo?.zoneId,
        paymentMethod,
        guestName: resolvedContactName,
        guestPhone: resolvedContactPhone,
        guestEmail: guestEmail.trim() || undefined,
        pickupTime: isTakeaway ? schedulePickupTimeLabel(scheduledAt) : undefined,
        scheduledAt: isTakeaway && !schedulingLocked ? scheduledAt ?? undefined : undefined,
        scheduleMode: isTakeaway && !schedulingLocked ? scheduleMode ?? undefined : undefined,
        ...(usePoints > 0
          ? { usePoints }
          : {
              promoCode: loyaltyAutoAppliedOnCup ? undefined : reward?.code,
              ...(loyaltyAutoApplySkipped ? { skipLoyaltyAutoApply: true } : {}),
            }),
        items: orderItems,
        frontendOrigin: getFrontendOrigin(),
        platform: 0,
        channel: 'WEB',
        ...(reservationForOrder ? { reservationUuid: reservationForOrder } : {}),
      };

      const deliveryAddress = addressSelection ?? (
        deliveryInfo?.address && deliveryInfo.lat != null && deliveryInfo.lng != null
          ? { address: deliveryInfo.address, lat: deliveryInfo.lat, lng: deliveryInfo.lng }
          : null
      );
      if (orderMode === 'DELIVERY' && deliveryAddress) {
        let city = 'Colombo';
        let district = 'Colombo';
        try {
          const geo = await api.get<{ city: string; district: string }>(
            `/stores/address/geocode?address=${encodeURIComponent(deliveryAddress.address)}`,
          );
          if (geo.city) city = geo.city;
          if (geo.district) district = geo.district;
        } catch {
          // Geocoder unavailable — proceed with fallback locality.
        }
        body.deliveryAddress = {
          addressLine: deliveryAddress.address,
          city,
          district,
          lat: deliveryAddress.lat,
          lng: deliveryAddress.lng,
        };
      }

      const res = await api.post<{
        order: { orderNumber: string; trackToken?: string };
        paymentUrl?: string;
        payhere?: PayHereSession;
      }>(
        '/orders',
        body,
        useAuth,
        { 'Idempotency-Key': placeOrderIdempotencyKey.current },
      );

      const orderNumber = res.order.orderNumber;
      const trackToken = res.order.trackToken;
      const { rememberOrderTrackToken } = await import('@/lib/orderTrackSession');
      rememberOrderTrackToken(orderNumber, trackToken);
      invalidateCustomerOrderLists(queryClient);
      if (usePoints > 0) {
        const nextPoints = Math.max(0, availablePoints - usePoints);
        updateUser({ loyaltyPoints: nextPoints });
        const stored = getStoredUser() as UserType | null;
        if (stored) setUser({ ...stored, loyaltyPoints: nextPoints });
        void queryClient.invalidateQueries({ queryKey: ['loyalty-summary'] });
      }
      const activeGateway = paymentConfig?.activeOnlineGateway ?? 'PAYHERE';

      const isOnlinePayment =
        paymentMethod === 'PAYHERE' || paymentMethod === 'CARD' || Boolean(res.paymentUrl);

      if (isOnlinePayment) {
        markOrderForCelebration(orderNumber);
        markOrderAwaitingPayment(orderNumber);
        if (reward?.code?.toUpperCase().startsWith('SPIN-')) clearClaim();
        if (paymentMethod === 'PAYHERE' || paymentMethod === 'CARD') {
          if (activeGateway === 'WEBXPAY') {
            await openWebXPayCheckout({
              orderNumber,
              trackToken,
              router,
              paymentUrl: res.paymentUrl,
            });
            return;
          }
          toast.success('Opening secure payment…', { icon: '💳' });
          await openPayHereCheckout({
            orderNumber,
            trackToken,
            router,
            payhere: res.payhere,
            paymentUrl: res.paymentUrl,
            onDismiss: () => {
              toast('Payment window closed. Your items are still in your cup.', { icon: '🧋' });
            },
          });
          return;
        }
        if (res.paymentUrl) {
          window.location.href = res.paymentUrl;
          return;
        }
      }

      markOrderForCelebration(orderNumber);
      completingOrderRef.current = true;
      if (reward?.code?.toUpperCase().startsWith('SPIN-')) clearClaim();
      clearReward();
      completeOrder();
      router.push(
        trackToken
          ? `/order/${encodeURIComponent(trackToken)}`
          : `/order/${encodeURIComponent(orderNumber)}`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  }

  const canPlaceOrder =
    onlineOrderingOpen &&
    ((orderMode === 'DELIVERY' && Boolean(deliveryInfo?.storeId)) ||
      (isTakeaway && Boolean(takeawayInfo?.storeId)));

  const canPay = Boolean(paymentMethod);
  const sessionReady = authHydrated;
  const hasRealContactName =
    !isPlaceholderCustomerName(guestName) || !isPlaceholderCustomerName(user?.name);
  const canSubmitOrder =
    canPlaceOrder &&
    canPay &&
    sessionReady &&
    hasVerifiedContact &&
    hasRealContactName &&
    !pickupOverMaxAmount;

  if (!cartHydrated) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-brand" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full">
      {paymentError && (
        <div className="mb-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm">
          <p className="font-semibold text-red-200">Payment failed</p>
          <p className="text-red-100/90 mt-1">{paymentError}</p>
          <p className="text-muted text-xs mt-2">Your items are still in your cup. Update details and pay again below.</p>
        </div>
      )}

      {!onlineOrderingOpen && orderingConfig && (
        <OnlineOrderingClosedBanner
          className="mb-4"
          message={onlineOrderingClosedText}
          detail={
            resolvedHours
              ? `Store hours ${resolvedHours.openTime} – ${resolvedHours.closeTime}${
                  resolvedHours.pickupCutoffMinutes > 0
                    ? ` · Pickup orders stop ${resolvedHours.pickupCutoffMinutes} min before close`
                    : ''
                }`
              : undefined
          }
        />
      )}

      {paymentConfig && !paymentConfig.onlineGatewayConfigured && paymentMethods.some((m) => m.id === 'PAYHERE') && (
        <div className="mb-4 p-3 rounded-xl alert-error text-sm">
          Online payment is not available yet. Please try again later.
        </div>
      )}

      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <Link href="/cart" className="btn-outline p-2 shrink-0">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">Checkout</h1>
          <p className="text-muted text-sm truncate">
            {orderMode === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)] gap-5 sm:gap-8">
        <div className="space-y-4 sm:space-y-5">
          {/* Location / branch */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="step-badge step-badge-active">1</div>
              <h3 className="font-semibold text-fg">
                {orderMode === 'DELIVERY' ? 'Delivery Address' : 'Pickup Store'}
              </h3>
            </div>

            {orderMode === 'DELIVERY' ? (
              hasSavedDelivery && !editingDelivery ? (
                <div className="space-y-4">
                  <div className="order-branch-card">
                    <div className="order-branch-card__icon">
                      <Store size={20} className="text-brand" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Delivering from</p>
                      <p className="font-semibold text-fg">{deliveryInfo!.storeName}</p>
                      <p className="text-xs text-muted mt-0.5">
                        Fee LKR {deliveryInfo!.fee} · ~{deliveryInfo!.estimatedMinutes} min
                      </p>
                    </div>
                    <CheckCircle size={20} className="text-green-500 shrink-0" />
                  </div>

                  <div className="p-3 rounded-xl border border-navy-border bg-navy-light/40">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">Delivery address</p>
                    <p className="text-sm text-fg flex items-start gap-1.5">
                      <MapPin size={14} className="text-brand shrink-0 mt-0.5" />
                      {deliveryInfo!.address}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingDelivery(true)}
                    className="text-sm text-brand hover:underline flex items-center gap-1.5"
                  >
                    <Pencil size={14} />
                    Change delivery address
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {hasSavedDelivery && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDelivery(false);
                        if (deliveryInfo) setValidation(validationFromDeliveryInfo(deliveryInfo));
                      }}
                      className="text-sm text-muted hover:text-fg"
                    >
                      ← Use saved delivery details
                    </button>
                  )}

                  {savedAddresses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted font-medium">Saved Addresses</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {savedAddresses.map((addr) => (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() => {
                              setAddressSelection({
                                address: `${addr.addressLine}, ${addr.city}`,
                                lat: addr.lat ?? 6.9271,
                                lng: addr.lng ?? 79.8612,
                              });
                              setValidation(null);
                            }}
                            className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                              addressSelection?.address === `${addr.addressLine}, ${addr.city}`
                                ? 'border-brand bg-brand-subtle'
                                : 'border-navy-border hover:border-brand'
                            }`}
                          >
                            <span className="text-xs font-medium text-brand">{addr.label}</span>
                            <p className="text-fg text-sm mt-0.5">{addr.addressLine}, {addr.city}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <AddressMapPicker
                    value={addressSelection}
                    variant="prominent"
                    branchMarkers={deliveryBranchMarkers}
                    selectedBranchId={selectedDeliveryStoreId}
                    onBranchSelect={(id) => {
                      const branch = suggestedDeliveryBranches.find((b) => b.id === id);
                      if (branch) selectCheckoutDeliveryBranch(branch);
                    }}
                    showRoute
                    routeAnimation="delivery"
                    onChange={(sel) => {
                      setAddressSelection(sel);
                      setValidation(null);
                      setSelectedDeliveryStoreId(null);
                    }}
                  />

                  {validation && suggestedDeliveryBranches.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted font-medium">Choose delivery branch</p>
                      {suggestedDeliveryBranches.map((branch) => {
                        const closed = Boolean(branch.branchClosed);
                        const orderable = isDeliveryBranchOrderable(branch);
                        const selected = orderable && selectedDeliveryStoreId === branch.id;
                        return (
                          <button
                            key={branch.id}
                            type="button"
                            disabled={closed}
                            onClick={() => selectCheckoutDeliveryBranch(branch)}
                            className={`order-branch-card w-full text-left transition-all ${
                              selected ? 'order-branch-card--selected' : ''
                            }${closed ? ' order-branch-slide--disabled' : ''}`}
                          >
                            <div className="order-branch-card__icon">
                              <Store size={20} className={closed ? 'text-muted' : 'text-brand'} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-fg truncate text-sm">{branch.name}</p>
                              <p className="text-xs text-muted mt-0.5">
                                {branch.distanceKm} km · Fee LKR {branch.fee}
                                {closed ? ' · Closed' : ''}
                              </p>
                            </div>
                            {selected && (
                              <CheckCircle size={18} className="text-green-500 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={validateDelivery}
                    disabled={validating || !addressSelection || !selectedDeliveryStoreId}
                    className="btn-primary px-5 py-2.5 text-sm w-full sm:w-auto"
                  >
                    {validating ? 'Checking...' : validation?.eligible ? 'Update Delivery' : 'Check Delivery'}
                  </button>

                  {validation && (
                    <div className={`p-3 rounded-xl text-sm ${validation.eligible ? 'alert-success' : 'alert-error'}`}>
                      {validation.eligible
                        ? `Delivery available · ETA ${validation.estimatedMinutes} min · Fee LKR ${validation.zone?.fee}`
                        : validation.message}
                    </div>
                  )}
                </div>
              )
            ) : takeawayInfo ? (
              <div className="space-y-4">
                <div className="order-branch-card">
                  <div className="order-branch-card__icon">
                    <Store size={20} className="text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Your branch</p>
                    <p className="font-semibold text-fg">{takeawayInfo.storeName}</p>
                    <p className="text-xs text-muted mt-0.5">Selected when you started your order</p>
                  </div>
                  <CheckCircle size={20} className="text-green-500 shrink-0" />
                </div>

                <p className="text-xs text-muted flex items-center gap-1.5">
                  <MapPin size={12} className="text-brand shrink-0" />
                  Pick up from this branch when your order is ready.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                No pickup store selected.{' '}
                <Link href="/menu" className="text-brand hover:underline">
                  Go back to menu
                </Link>{' '}
                and choose takeaway first.
              </p>
            )}
          </div>

          {/* Schedule — pickup only */}
          {canPlaceOrder && isTakeaway && (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="step-badge step-badge-active">2</div>
                <h3 className="font-semibold text-fg text-sm sm:text-base">Pickup Time</h3>
              </div>
              <OrderSchedulePicker
                value={scheduledAt}
                onChange={setScheduledAt}
                scheduleMode={scheduleMode}
                onScheduleModeChange={setScheduleMode}
                orderMode={orderMode}
                openTime={storeOpenTime}
                closeTime={storeCloseTime}
                pickupCutoffMinutes={pickupCutoffMinutes}
              />
            </div>
          )}

          {/* Contact */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="step-badge step-badge-active">{isTakeaway ? 3 : 2}</div>
              <h3 className="font-semibold text-fg">Contact Details</h3>
            </div>

            {hasVerifiedContact && user && !isPlaceholderCustomerName(user.name) ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-navy-border bg-navy-light/50">
                  <User size={18} className="text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{user.name}</p>
                    <p className="text-sm text-muted flex items-center gap-1.5 mt-0.5">
                      <Phone size={12} />
                      {user.phone}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Signed in — your orders appear in{' '}
                  <Link href="/account/orders" className="text-brand hover:underline">
                    order history
                  </Link>
                  .
                </p>
              </div>
            ) : hasVerifiedContact && user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-navy-border bg-navy-light/50">
                  <Phone size={18} className="text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{user.phone}</p>
                    <p className="text-xs text-muted mt-0.5">Mobile verified</p>
                  </div>
                </div>
                <input
                  className="input-field w-full"
                  placeholder="Full Name *"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoComplete="name"
                />
                <p className="text-xs text-muted">
                  Signed in — your orders appear in{' '}
                  <Link href="/account/orders" className="text-brand hover:underline">
                    order history
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {isAuthenticated && user && needsPhoneVerification && (
                  <div className="rounded-xl border border-brand/25 bg-brand/5 p-3 text-sm text-fg">
                    <p className="font-medium">Add your mobile number</p>
                    <p className="text-xs text-muted mt-1">
                      Signed in as {user.name}. We need your Sri Lankan mobile number to send order updates by SMS.
                    </p>
                  </div>
                )}
                <input
                  className="input-field w-full"
                  placeholder="Full Name *"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  disabled={
                    phoneAuth.isChecking ||
                    phoneAuth.isVerifyingOtp ||
                    (isAuthenticated && !isPlaceholderCustomerName(guestName))
                  }
                />
                <div className="relative">
                  <input
                    className="input-field w-full pr-10"
                    placeholder="Mobile Number * (07XXXXXXXX)"
                    type="tel"
                    inputMode="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                    disabled={phoneAuth.isVerifyingOtp}
                  />
                  {phoneAuth.isChecking && (
                    <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand" />
                  )}
                </div>
                <input
                  className="input-field w-full"
                  placeholder="Email (optional)"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  disabled={phoneAuth.isVerifyingOtp}
                />

                {phoneAuth.showDeletedChoice && (
                  <div className="space-y-2.5 rounded-xl border border-amber-600/30 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                      This number was linked to a deleted account.
                    </p>
                    <p className="text-xs text-amber-900/90 dark:text-amber-100/85">
                      Recover your old profile or start fresh with a new account.
                    </p>
                    <button
                      type="button"
                      onClick={() => void phoneAuth.sendOtp('recover')}
                      disabled={phoneAuth.isSendingOtp}
                      className="btn-primary w-full py-2.5 text-sm"
                    >
                      Recover account
                    </button>
                    <button
                      type="button"
                      onClick={() => void phoneAuth.sendOtp('create_new')}
                      disabled={phoneAuth.isSendingOtp}
                      className="btn-outline w-full py-2.5 text-sm"
                    >
                      Create new account
                    </button>
                  </div>
                )}

                {phoneAuth.showSendOtp && (
                  <button
                    type="button"
                    onClick={() => void phoneAuth.sendOtp()}
                    disabled={
                      phoneAuth.isSendingOtp ||
                      (!needsPhoneVerification && guestName.trim().length < 2)
                    }
                    className="btn-primary w-full py-2.5 text-sm"
                  >
                    {phoneAuth.isSendingOtp ? 'Sending OTP…' : 'Send OTP'}
                  </button>
                )}

                {phoneAuth.showOtpInput && (
                  <div className="space-y-3 rounded-xl border border-brand/25 bg-brand/5 p-3">
                    <input
                      className="input-field w-full text-center tracking-[0.35em] font-semibold"
                      placeholder="6-digit OTP"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={phoneAuth.otpCode}
                      onChange={(e) => phoneAuth.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <button
                      type="button"
                      onClick={() => void phoneAuth.verifyOtp()}
                      disabled={phoneAuth.isVerifyingOtp || phoneAuth.otpCode.length !== 6}
                      className="btn-primary w-full py-2.5 text-sm"
                    >
                      {phoneAuth.isVerifyingOtp ? 'Verifying…' : 'Verify OTP'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void phoneAuth.sendOtp()}
                      disabled={phoneAuth.isSendingOtp}
                      className="btn-outline w-full py-2.5 text-sm"
                    >
                      {phoneAuth.isSendingOtp ? 'Sending…' : 'Resend OTP'}
                    </button>
                  </div>
                )}

                <p className="text-xs text-muted">
                  {phoneAuth.isChecking
                    ? 'Checking your account…'
                    : phoneAuth.showDeletedChoice
                      ? 'Choose how you want to continue before we send an OTP.'
                    : phoneAuth.showSendOtp || phoneAuth.showOtpInput
                      ? 'New number — verify with OTP before placing your order.'
                      : 'Enter your 10-digit mobile number. Existing accounts sign in automatically.'}
                </p>
              </div>
            )}
          </div>

          {/* Payment */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="step-badge step-badge-active">{isTakeaway ? 4 : 3}</div>
              <h3 className="font-semibold text-fg">Payment</h3>
            </div>

            {isTakeaway && (
              <p className="text-xs text-muted mb-3">
                {requiresOnlinePaymentForPickup(sub)
                  ? `Takeaway orders of LKR ${PICKUP_ONLINE_PAYMENT_THRESHOLD.toLocaleString()} or more must be paid online.`
                  : `Takeaway orders under LKR ${PICKUP_ONLINE_PAYMENT_THRESHOLD.toLocaleString()} can be paid at the counter or online.`}
              </p>
            )}

            {availablePaymentMethods.length === 0 ? (
              <p className="text-sm text-muted">Loading payment options…</p>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Payment method">
                {availablePaymentMethods.map((method) => {
                  const Icon = getPaymentMethodIcon(method.id);
                  const selected = paymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPaymentMethod(method.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'border-brand bg-brand-subtle/40'
                          : 'border-navy-border hover:border-brand/50'
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          selected ? 'bg-brand text-white' : 'bg-navy-surface text-muted'
                        }`}
                      >
                        <Icon size={20} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-fg">{method.label}</span>
                        {/* {method.id === 'CASH_AT_COUNTER' && (
                          <span className="block text-xs text-muted mt-0.5">
                            Pay with cash when you collect your order
                          </span>
                        )} */}
                        {/* {method.id === 'PAYHERE' && (
                          <span className="block text-xs text-muted mt-0.5">
                            Secure online payment via PayHere
                          </span>
                        )} */}
                      </span>
                      {selected && <CheckCircle size={18} className="text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {paymentMethod === 'PAYHERE' && (
              <p className="text-xs text-muted mt-3">
                You&apos;ll complete payment securely after placing your order.
              </p>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4 sm:p-5">
            <h3 className="font-semibold text-fg mb-4">Order Summary</h3>
            <div className="space-y-2.5 mb-4 max-h-64 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 text-sm">
                  <ProductImage
                    name={item.product.name}
                    imageUrl={item.product.imageUrl}
                    className="h-10 w-10 shrink-0 rounded-lg bg-navy-light"
                    contain
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg text-xs font-medium line-clamp-1">{item.product.name}</p>
                    <p className="text-muted text-[11px]">
                      {[
                        `× ${item.quantity}`,
                        item.size || null,
                        formatDrinkOptionLine({
                          iceLevel: item.iceLevel,
                          sugarLevel: item.sugarLevel,
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="text-fg shrink-0 tabular-nums text-xs font-medium">
                    {formatMoneyAmount(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}

              {(reward?.giftProduct || reward?.giftLabel) && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-2">
                  <div className="flex items-center gap-2">
                    {reward.giftProduct?.imageUrl ? (
                      <ProductImage
                        name={reward.giftProduct.name}
                        imageUrl={reward.giftProduct.imageUrl}
                        className="h-10 w-10 shrink-0 rounded-lg border border-green-500/20 bg-white/5"
                        contain
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
                        <Gift size={16} className="text-green-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-green-400 bg-green-500/15 px-1 py-0.5 rounded">
                        Free gift
                      </span>
                      <p className="text-xs font-medium text-fg mt-0.5 line-clamp-1">
                        {reward.giftProduct?.name
                          ? `${reward.giftProduct.name} × 1`
                          : reward.giftLabel}
                      </p>
                      {reward.giftProduct?.basePrice != null && (
                        <p className="text-[10px] text-muted line-through">
                          LKR {reward.giftProduct.basePrice.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-green-400 shrink-0">FREE</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-navy-border pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Subtotal</span>
                <span className="text-fg tabular-nums">{formatMoneyAmount(paidSubtotal)}</span>
              </div>
              {(baseDeliveryFee > 0 || reward?.freeDelivery) && orderMode === 'DELIVERY' && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Delivery</span>
                  <span className="text-fg tabular-nums">
                    {reward?.freeDelivery ? (
                      <span className="text-green-400">FREE</span>
                    ) : (
                      formatMoneyAmount(baseDeliveryFee)
                    )}
                  </span>
                </div>
              )}
              {freeProductLine && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{freeProductLine}</span>
                  <span className="text-green-400 font-semibold tabular-nums">FREE</span>
                </div>
              )}
              {discount > 0 && !freeProductLine && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    Discount{discountPercentLabel != null ? ` (${discountPercentLabel}%)` : ''}
                  </span>
                  <span className="text-green-400 tabular-nums">− {formatMoneyAmount(discount)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Points ({usePoints.toLocaleString()} pts)</span>
                  <span className="text-green-400 tabular-nums">− {formatMoneyAmount(loyaltyDiscount)}</span>
                </div>
              )}
              {showWaivedPickupConvenienceFee && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted line-through">
                    {formatConvenienceFeeLabel(orderMode, convenienceRates)}
                  </span>
                  <span className="text-muted line-through tabular-nums shrink-0">
                    {formatMoneyAmount(displayConvenienceFee)}
                  </span>
                </div>
              )}
              {!isTakeaway && convenienceFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    {formatConvenienceFeeLabel(orderMode, convenienceRates)}
                  </span>
                  <span className="text-fg tabular-nums">{formatMoneyAmount(convenienceFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t border-navy-border">
                <span className="text-fg">Total</span>
                <span className="text-brand text-lg tabular-nums">{formatMoney(total)}</span>
              </div>
              {pickupOverMaxAmount && pickupMaxOrderAmount != null && (
                <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm">
                  <p className="font-semibold text-amber-200">Pickup order total exceeds the online limit</p>
                  <p className="text-amber-100/90 mt-1 text-xs">
                    The maximum for pickup orders placed online is LKR{' '}
                    {pickupMaxOrderAmount.toLocaleString()}. Reduce your order or contact the store
                    for help.
                  </p>
                </div>
              )}
            </div>

            <PromoOffersPanel
              orderTotal={sub}
              orderMode={orderMode}
              storeId={getFulfillmentStoreId()}
              cartItems={promoCartItems}
              allowManualCode
              className="mt-4"
              promoBlocked={pointsRedeemActive}
              onPromoDismiss={handlePromoDismiss}
            />

            {checkoutRedeemEnabled && (
              <CheckoutPointsRedeem
                availablePoints={availablePoints}
                maxPoints={redeemCalc.maxPoints}
                usePoints={usePoints}
                discountLkr={loyaltyDiscount}
                enabled={redeemEnabled}
                signedIn={isAuthenticated}
                earnPreview={estimateLoyaltyPoints(sub, loyalty?.settings ?? DEFAULT_LOYALTY_SETTINGS)}
                blockedReason={
                  hasPromoApplied
                    ? 'Remove your promo or offer to redeem points on this order.'
                    : !checkoutRedeemUnlocked
                      ? `Earn ${minPointsToRedeem.toLocaleString()} points to unlock checkout redemption (${lifetimePointsEarned.toLocaleString()}/${minPointsToRedeem.toLocaleString()} earned).`
                      : null
                }
                onEnabledChange={(on) => {
                  if (on && hasPromoApplied) {
                    toast.error('Remove your promo or offer to redeem points.');
                    return;
                  }
                  setUserDisabledRedeem(!on);
                  setUsePointsRaw(on ? null : 0);
                }}
                onPointsChange={(points) => {
                  setUsePointsRaw(points);
                }}
              />
            )}

            {claim?.offer.offerType === 'FREE_DELIVERY' && orderMode === 'TAKEAWAY' && Boolean(reward) && (
              <p className="text-xs text-amber-400 mt-2">
                Switch to Delivery to use your free delivery reward.
              </p>
            )}

            <motion.button
              whileHover={{ scale: canSubmitOrder ? 1.02 : 1 }}
              whileTap={{ scale: canSubmitOrder ? 0.98 : 1 }}
              onClick={placeOrder}
              disabled={placing || !canSubmitOrder}
              className="btn-primary w-full py-3.5 sm:py-4 mt-5 text-sm sm:text-base disabled:opacity-50"
            >
              {placing
                ? 'Placing Order...'
                : pickupOverMaxAmount
                  ? 'Pickup total over online limit'
                : !hasVerifiedContact
                  ? 'Verify phone to place order'
                  : paymentMethod === 'PAYHERE'
                    ? isTakeaway
                      ? 'Pay & Place Pickup Order'
                      : 'Pay & Place Order'
                    : paymentMethod === 'CASH_AT_COUNTER'
                      ? 'Place Order — Pay at Counter'
                      : isTakeaway
                        ? 'Place Pickup Order'
                        : 'Place Order'}
            </motion.button>
            {!hasVerifiedContact && canPlaceOrder && canPay && (
              <p className="text-xs text-center text-muted mt-2">
                Verify your mobile number in step {isTakeaway ? 3 : 2} to enable checkout.
              </p>
            )}
          </div>

          <p className="text-xs text-center text-muted px-2">🔒 Secured checkout</p>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPageEntry() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-brand" size={28} />
        </div>
      }
    >
      <CheckoutPage />
    </Suspense>
  );
}
