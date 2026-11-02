'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, CheckCircle2, Loader2, ChevronLeft, MapPin, Search, Crosshair, Truck, ShoppingBag, Home, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCartStore, type OrderMode } from '@/store/cartStore';
import { AddressMapPicker, type AddressSelection } from './AddressMapPicker';
import type { Store as StoreType, DeliveryValidation, DeliveryBranchOption } from '@/types';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/store/confirmStore';
import { getCurrentPositionWithFallback, DEFAULT_LOCATION } from '@/lib/geolocation';
import { MASCOT_IMAGES } from '@/lib/mascotImages';
import { playModeSelectSound, playLocationPinSound, playConfirmClickSound } from '@/lib/uiSounds';
import { toMapLatLng } from '@/lib/storeCoordinates';
import { branchManuallyClosedMessage, isBranchManuallyClosed } from '@/lib/storeOrderingHours';

function isDeliveryBranchOrderable(branch: DeliveryBranchOption): boolean {
  return branch.suggested && !branch.branchClosed;
}

interface OrderModeSelectorProps {
  onComplete?: () => void;
  onBackToHome?: () => void;
  showContinueButton?: boolean;
  onModeChange?: (mode: OrderMode) => void;
  onStepChange?: (step: 'choose' | 'setup') => void;
  /** True while the order modal is open — used to refresh nearest branches on reopen. */
  modalOpen?: boolean;
  /** Skip step 1 and open setup for this mode (from navbar Delivery/Pickup buttons). */
  initialMode?: OrderMode;
  startAtSetup?: boolean;
}

const PickupMap = dynamic(() => import('./DeliveryMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[220px] rounded-xl border border-navy-border bg-navy-light flex items-center justify-center text-muted text-sm">
      Loading map...
    </div>
  ),
});

const TAKEAWAY_MAX_KM = 7;
const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '23:00';

function orderingFieldsFromStore(store: {
  openTime?: string;
  closeTime?: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number | null;
  branchClosedAt?: string | null;
}) {
  return {
    openTime: store.openTime ?? DEFAULT_OPEN_TIME,
    closeTime: store.closeTime ?? DEFAULT_CLOSE_TIME,
    onlineOrderStartTime: store.onlineOrderStartTime,
    onlineOrderStopTime: store.onlineOrderStopTime,
    pickupCutoffMinutes: store.pickupCutoffMinutes ?? undefined,
    branchClosedAt: store.branchClosedAt,
  };
}

function storeMatchesPickupSearch(store: StoreType, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    store.name.toLowerCase().includes(q) ||
    store.city.toLowerCase().includes(q) ||
    store.district.toLowerCase().includes(q) ||
    store.addressLine.toLowerCase().includes(q)
  );
}

export function OrderModeSelector({
  onComplete,
  onBackToHome,
  showContinueButton = false,
  onModeChange,
  onStepChange,
  modalOpen = true,
  initialMode,
  startAtSetup = false,
}: OrderModeSelectorProps) {
  const { orderMode, setOrderMode, setDeliveryInfo, setTakeawayInfo, deliveryInfo, takeawayInfo, items, clearCart, clearMode } =
    useCartStore();

  const hasSavedSetup = Boolean(
    (orderMode === 'DELIVERY' && deliveryInfo) || (orderMode === 'TAKEAWAY' && takeawayInfo)
  );
  const [step, setStep] = useState<'choose' | 'setup'>(() => {
    if (startAtSetup && initialMode) return 'setup';
    return hasSavedSetup ? 'setup' : 'choose';
  });
  const [mode, setMode] = useState<OrderMode>(() => {
    if (initialMode) return initialMode;
    if (orderMode === 'TAKEAWAY' || takeawayInfo) return 'TAKEAWAY';
    if (orderMode === 'DELIVERY' || deliveryInfo) return 'DELIVERY';
    return 'DELIVERY';
  });
  const [choiceHighlight, setChoiceHighlight] = useState<OrderMode | null>(null);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (step === 'setup') onModeChange?.(mode);
  }, [mode, step, onModeChange]);

  const [addressSelection, setAddressSelection] = useState<AddressSelection | null>(() => {
    if (deliveryInfo?.address && deliveryInfo.lat != null && deliveryInfo.lng != null) {
      return { address: deliveryInfo.address, lat: deliveryInfo.lat, lng: deliveryInfo.lng };
    }
    return null;
  });
  const [validation, setValidation] = useState<DeliveryValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreType | null>(null);
  const [selectedDeliveryStoreId, setSelectedDeliveryStoreId] = useState<string | null>(
    () => deliveryInfo?.storeId ?? null,
  );
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [pickupAreaLabel, setPickupAreaLabel] = useState<string | null>(null);
  const userPickedStore = useRef(false);
  const validateSeq = useRef(0);
  const nearestDetectSeq = useRef(0);
  const pickupAutoDetectStarted = useRef(false);

  const { data: allStores = [], isFetching: storesLoading } = useQuery<StoreType[]>({
    queryKey: ['stores', 'takeaway', pickupCoords?.lat, pickupCoords?.lng],
    queryFn: () => {
      const params = new URLSearchParams();
      if (pickupCoords?.lat != null && pickupCoords?.lng != null) {
        params.set('lat', String(pickupCoords.lat));
        params.set('lng', String(pickupCoords.lng));
      }
      const qs = params.toString();
      return api.get(`/stores${qs ? `?${qs}` : ''}`);
    },
    enabled: mode === 'TAKEAWAY' && step === 'setup',
  });

  const sortedStores = useMemo(
    () => [...allStores].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)),
    [allStores],
  );

  const branchSearchQuery = branchSearch.trim();
  const pickupStoresList = useMemo(
    () => sortedStores.filter((store) => storeMatchesPickupSearch(store, branchSearchQuery)),
    [sortedStores, branchSearchQuery],
  );

  const pickupBranchMarkers = useMemo(
    () =>
      pickupStoresList
        .map((s) => {
          const point = toMapLatLng(s.lat, s.lng);
          if (!point) return null;
          return { id: s.id, name: s.name, lat: point.lat, lng: point.lng };
        })
        .filter((marker): marker is { id: string; name: string; lat: number; lng: number } => marker != null),
    [pickupStoresList],
  );

  const suggestedDeliveryBranches = useMemo(
    () => validation?.suggestedBranches?.filter((b) => b.suggested) ?? [],
    [validation],
  );

  const deliveryBranchMarkers = useMemo(
    () =>
      suggestedDeliveryBranches
        .map((b) => {
          const point = toMapLatLng(b.lat, b.lng);
          if (!point) return null;
          return { id: b.id, name: b.name, lat: point.lat, lng: point.lng };
        })
        .filter((marker): marker is { id: string; name: string; lat: number; lng: number } => marker != null),
    [suggestedDeliveryBranches],
  );

  useEffect(() => {
    if (deliveryInfo?.address && deliveryInfo.lat != null && deliveryInfo.lng != null && !addressSelection) {
      setAddressSelection({
        address: deliveryInfo.address,
        lat: deliveryInfo.lat,
        lng: deliveryInfo.lng,
      });
    }
  }, [deliveryInfo, addressSelection]);

  useEffect(() => {
    if (mode !== 'TAKEAWAY' || !takeawayInfo?.storeId || allStores.length === 0) return;
    const saved = allStores.find((s) => s.id === takeawayInfo.storeId);
    if (saved) {
      setSelectedStore(saved);
      userPickedStore.current = true;
    }
  }, [mode, allStores, takeawayInfo]);

  const validateDeliveryAt = useCallback(async (sel: AddressSelection, storeId?: string, silent = true) => {
    setValidating(true);
    const seq = ++validateSeq.current;
    try {
      const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
        lat: sel.lat,
        lng: sel.lng,
        address: sel.address,
        ...(storeId ? { storeId } : {}),
      });
      if (seq !== validateSeq.current) return;
      setValidation(result);
      if (result.eligible && result.store) {
        setSelectedDeliveryStoreId(result.store.id);
      } else if (!storeId && result.suggestedBranches?.length) {
        const firstOrderable = result.suggestedBranches.find((b) => isDeliveryBranchOrderable(b));
        setSelectedDeliveryStoreId(firstOrderable?.id ?? null);
      }
      if (!silent && !result.eligible) {
        toast.error(result.message || 'Delivery not available to this address');
      }
    } catch {
      if (seq !== validateSeq.current) return;
      setValidation(null);
      setSelectedDeliveryStoreId(null);
      if (!silent) toast.error('Could not check delivery for this location');
    } finally {
      if (seq === validateSeq.current) setValidating(false);
    }
  }, []);

  // Automatically fetch delivery branch suggestions when location updates (500ms typing/location debounce to save server load)
  useEffect(() => {
    if (mode !== 'DELIVERY' || step !== 'setup' || !addressSelection?.address) return;
    const timer = setTimeout(() => {
      void validateDeliveryAt(addressSelection, undefined, true);
    }, 500);
    return () => clearTimeout(timer);
  }, [addressSelection, mode, step, validateDeliveryAt]);

  function searchDeliveryBranches() {
    if (!addressSelection) {
      toast.error('Set your delivery location on the map first');
      return;
    }
    void validateDeliveryAt(addressSelection, undefined, false);
  }

  async function confirmDeliveryBranch(branch: DeliveryBranchOption) {
    if (!isDeliveryBranchOrderable(branch)) {
      toast.error(
        branch.branchClosed
          ? branchManuallyClosedMessage()
          : 'This branch cannot deliver to your location. Please choose a suggested branch.',
      );
      return;
    }
    if (!addressSelection) return;
    setSelectedDeliveryStoreId(branch.id);
    setValidating(true);
    try {
      const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
        lat: addressSelection.lat,
        lng: addressSelection.lng,
        address: addressSelection.address,
        storeId: branch.id,
      });
      setValidation(result);
      if (result.eligible && result.store && result.zone) {
        playConfirmClickSound();
        if (saveDeliveryFromValidation(result, addressSelection)) {
          toast.success(`Delivering from ${result.store.name} · ~${result.estimatedMinutes ?? 30} min`);
          onComplete?.();
        }
      } else {
        toast.error(result.message || 'Delivery not available from this branch');
      }
    } catch {
      toast.error('Could not select this branch');
    } finally {
      setValidating(false);
    }
  }

  function handleDeliveryBranchClick(branch: DeliveryBranchOption) {
    if (!isDeliveryBranchOrderable(branch)) {
      if (branch.branchClosed) {
        toast.error(branchManuallyClosedMessage());
      } else {
        toast.error('This branch cannot deliver to your location. Please choose a suggested branch.');
      }
      return;
    }
    if (selectedDeliveryStoreId === branch.id) {
      void confirmDeliveryBranch(branch);
      return;
    }
    setSelectedDeliveryStoreId(branch.id);
    playModeSelectSound('DELIVERY');
  }

  function selectDeliveryBranchFromMap(branchId: string) {
    const branch = suggestedDeliveryBranches.find((b) => b.id === branchId);
    if (branch) handleDeliveryBranchClick(branch);
  }

  const detectPickupLocation = useCallback(async (showToast = true) => {
    const seq = ++nearestDetectSeq.current;
    setDetectingLocation(true);
    try {
      const coords = await getCurrentPositionWithFallback();
      if (seq !== nearestDetectSeq.current) return;

      setPickupCoords(coords);

      const params = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
      });
      const withDist = await api.get<StoreType[]>(`/stores?${params.toString()}`);
      if (seq !== nearestDetectSeq.current) return;

      const nearest = withDist.find(
        (s) => s.distanceKm != null && s.distanceKm <= TAKEAWAY_MAX_KM
      );

      if (showToast) {
        if (nearest) {
          const label = nearest.name.replace('Bing Chun - ', '');
          toast(`Nearest: ${label} (${nearest.distanceKm!.toFixed(1)} km) — tap to select`, { icon: '📍' });
        } else {
          toast('No outlet within 7 km — search for a branch below.', { icon: '📍' });
        }
      }
    } catch {
      if (seq !== nearestDetectSeq.current) return;
      if (showToast) {
        toast.error('Could not detect location. Please search for a branch manually.');
      }
    } finally {
      if (seq === nearestDetectSeq.current) setDetectingLocation(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'TAKEAWAY' || step !== 'setup' || pickupCoords) return;
    if (pickupAutoDetectStarted.current) return;
    pickupAutoDetectStarted.current = true;
    setPickupAreaLabel('your location');
    void detectPickupLocation(false);
  }, [mode, step, pickupCoords, detectPickupLocation]);

  async function pickMode(next: OrderMode) {
    if (orderMode && orderMode !== next && items.length > 0) {
      const ok = await confirmDialog({
        title: 'Switch order type?',
        message: 'Switching order type will empty your cup. Do you want to continue?',
        confirmLabel: 'Continue',
        cancelLabel: 'Keep my cup',
      });
      if (!ok) return;
      clearCart();
      clearMode();
    }
    playModeSelectSound(next);
    setMode(next);
    setStep('setup');
    setValidation(null);
    setSelectedStore(null);
    setSelectedDeliveryStoreId(null);
    setPickupCoords(null);
    setBranchSearch('');
    setPickupAreaLabel(null);
    pickupAutoDetectStarted.current = false;
    userPickedStore.current = false;
  }

  function goBackToChoose() {
    setStep('choose');
    setValidation(null);
  }

  function saveDeliveryFromValidation(result: DeliveryValidation, sel: AddressSelection) {
    if (!result.eligible || !result.store || !result.zone) return false;
    setOrderMode('DELIVERY');
    setDeliveryInfo({
      storeId: result.store.id,
      storeName: result.store.name,
      zoneId: result.zone.id,
      fee: result.zone.fee,
      minOrder: result.zone.minOrder,
      estimatedMinutes: result.estimatedMinutes!,
      address: sel.address,
      lat: sel.lat,
      lng: sel.lng,
      ...orderingFieldsFromStore(result.store),
    });
    return true;
  }

  async function validateAndSaveDelivery() {
    if (!addressSelection?.address) {
      toast.error('Please set your delivery location on the map');
      return;
    }

    if (validation?.eligible && validation.store && validation.zone) {
      playConfirmClickSound();
      if (saveDeliveryFromValidation(validation, addressSelection)) {
        toast.success(`Delivering from ${validation.store.name} · ~${validation.estimatedMinutes} min`);
        onComplete?.();
      }
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
      if (result.eligible) {
        playConfirmClickSound();
        if (saveDeliveryFromValidation(result, addressSelection)) {
          toast.success(`Delivery available · ETA ${result.estimatedMinutes} min`);
          onComplete?.();
        }
      } else {
        toast.error(result.message || 'Delivery not available to this address');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not validate address');
    } finally {
      setValidating(false);
    }
  }

  function confirmTakeawayStore(store: StoreType) {
    if (isBranchManuallyClosed(store)) {
      toast.error('This branch is temporarily closed for online orders.');
      return;
    }
    userPickedStore.current = true;
    setSelectedStore(store);
    playConfirmClickSound();
    setOrderMode('TAKEAWAY');
    setTakeawayInfo({
      storeId: store.id,
      storeName: store.name,
      ...orderingFieldsFromStore(store),
    });
    toast.success(`Pickup from ${store.name}`);
    onComplete?.();
  }

  function handleTakeawayStoreClick(store: StoreType) {
    if (selectedStore?.id === store.id) {
      confirmTakeawayStore(store);
      return;
    }
    userPickedStore.current = true;
    setSelectedStore(store);
    playModeSelectSound('TAKEAWAY');
  }

  function confirmTakeaway() {
    if (!selectedStore) {
      toast.error('Please select a store for pickup');
      return;
    }
    confirmTakeawayStore(selectedStore);
  }

  return (
    <div className={`order-flow${step === 'setup' ? ' order-flow--map' : ''}`}>
      <AnimatePresence mode="wait">
        {step === 'choose' ? (
          <motion.div
            key="choose"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28 }}
            className="order-flow-step"
          >
            <div className="order-flow-step__header flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-center sm:text-left">
              <div>
                <span className="order-flow-step__badge">Step 1 of 2</span>
                <h3 className="order-flow-step__title">How would you like to order?</h3>
                {/* <p className="order-flow-step__sub">Choose delivery or pickup.</p> */}
              </div>
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-muted hover:text-brand transition-colors py-2 px-3.5 rounded-xl border border-navy-border hover:border-brand/40 bg-navy-light/60 self-center sm:self-start shrink-0 shadow-sm"
                >
                  <Home size={15} />
                  Back to Home
                </button>
              )}
            </div>

            <div className="order-mode-choices order-mode-choices--pizza">
              <div
                role="button"
                tabIndex={0}
                className={`order-mode-choice order-mode-choice--pizza${
                  choiceHighlight === 'DELIVERY' ? ' order-mode-choice--selected' : ''
                }`}
                aria-pressed={choiceHighlight === 'DELIVERY'}
                onClick={() => {
                  if (choiceHighlight === 'DELIVERY') {
                    void pickMode('DELIVERY');
                    return;
                  }
                  setChoiceHighlight('DELIVERY');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (choiceHighlight === 'DELIVERY') {
                      void pickMode('DELIVERY');
                      return;
                    }
                    setChoiceHighlight('DELIVERY');
                  }
                }}
              >
                <span className="order-mode-choice__mascot" aria-hidden>
                  <Image src={MASCOT_IMAGES.delivery} alt="" width={88} height={88} className="object-contain" unoptimized />
                </span>
                <span className="order-mode-choice__title">Delivery</span>
                <button
                  type="button"
                  className="order-mode-choice__action"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChoiceHighlight('DELIVERY');
                    void pickMode('DELIVERY');
                  }}
                >
                  <Truck size={14} aria-hidden />
                  Select Delivery
                </button>
              </div>

              <div
                role="button"
                tabIndex={0}
                className={`order-mode-choice order-mode-choice--pizza${
                  choiceHighlight === 'TAKEAWAY' ? ' order-mode-choice--selected' : ''
                }`}
                aria-pressed={choiceHighlight === 'TAKEAWAY'}
                onClick={() => {
                  if (choiceHighlight === 'TAKEAWAY') {
                    void pickMode('TAKEAWAY');
                    return;
                  }
                  setChoiceHighlight('TAKEAWAY');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (choiceHighlight === 'TAKEAWAY') {
                      void pickMode('TAKEAWAY');
                      return;
                    }
                    setChoiceHighlight('TAKEAWAY');
                  }
                }}
              >
                <span className="order-mode-choice__mascot" aria-hidden>
                  <Image src={MASCOT_IMAGES.takeaway} alt="" width={88} height={88} className="object-contain" />
                </span>
                <span className="order-mode-choice__title">Takeaway</span>
                <button
                  type="button"
                  className="order-mode-choice__action"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChoiceHighlight('TAKEAWAY');
                    void pickMode('TAKEAWAY');
                  }}
                >
                  <ShoppingBag size={14} aria-hidden />
                  Select Pickup
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`setup-${mode}`}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.28 }}
            className={`order-flow-step ${step === 'setup' ? 'order-flow-step--map' : ''}`}
          >
            {mode === 'DELIVERY' ? (
              <div className="order-delivery-stage">
                <div className="order-delivery-stage__chrome">
                  <button type="button" onClick={goBackToChoose} className="order-flow-back order-flow-back--overlay">
                    <ChevronLeft size={16} />
                    Change order type
                  </button>
                </div>

                <AddressMapPicker
                  value={addressSelection}
                  variant="prominent"
                  layout="mapOverlay"
                  autoDetectOnMount={!addressSelection}
                  branchMarkers={deliveryBranchMarkers}
                  selectedBranchId={selectedDeliveryStoreId}
                  onBranchSelect={selectDeliveryBranchFromMap}
                  showRoute
                  routeAnimation="delivery"
                  onLocationResolved={playLocationPinSound}
                  overlayHeader={
                    <div className="order-delivery-stage__heading">
                      <h3 className="order-flow-step__title">Where should we deliver?</h3>
                    </div>
                  }
                  onChange={(sel) => {
                    setAddressSelection(sel);
                    setValidation(null);
                    setSelectedDeliveryStoreId(null);
                  }}
                >
                  <div className="order-delivery-sheet">
                    {(validating || validation) && (
                      <>
                        {validating && !suggestedDeliveryBranches.length ? (
                          <div className="order-branch-slide order-branch-slide--loading">
                            <Loader2 size={16} className="animate-spin shrink-0 text-brand" />
                            <span className="text-sm text-brand">Finding nearest branches...</span>
                          </div>
                        ) : suggestedDeliveryBranches.length > 0 ? (
                          <>
                            <p className="order-delivery-sheet__label">Suggested branches</p>
                            <div className="order-branch-slider" role="list">
                              {suggestedDeliveryBranches.map((branch, index) => {
                                const closed = Boolean(branch.branchClosed);
                                const orderable = isDeliveryBranchOrderable(branch);
                                const selected = orderable && selectedDeliveryStoreId === branch.id;
                                return (
                                  <button
                                    key={branch.id}
                                    type="button"
                                    role="listitem"
                                    disabled={closed}
                                    aria-disabled={closed}
                                    onClick={() => handleDeliveryBranchClick(branch)}
                                    className={`order-branch-slide ${
                                      selected ? 'order-branch-slide--selected' : ''
                                    }${closed ? ' order-branch-slide--disabled' : ''}`}
                                  >
                                    <span className="order-branch-slide__thumb" aria-hidden>
                                      <Store size={20} className={closed ? 'text-muted' : 'text-brand'} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-fg text-sm truncate block">
                                          {branch.name}
                                        </span>
                                        {index === 0 && (
                                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand/15 text-brand-dark shrink-0">
                                            Nearest
                                          </span>
                                        )}
                                        {closed && (
                                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500/12 text-red-500 shrink-0">
                                            Closed
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-xs text-muted mt-0.5 block">
                                        {branch.distanceKm} km · Fee LKR {branch.fee}
                                        {closed ? ' · Not accepting orders' : ''}
                                      </span>
                                    </span>
                                    {selected ? (
                                      <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                                    ) : (
                                      <span className="order-branch-slide__ring" aria-hidden />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="order-delivery-sheet__hint">
                              Tap a branch to confirm
                            </p>
                          </>
                        ) : (
                          <div className="order-delivery-sheet__empty">
                            <div className="flex items-start gap-2 text-sm text-red-400">
                              <MapPin size={16} className="shrink-0 mt-0.5" />
                              <span>
                                {validation?.message ||
                                  'Delivery not available here. Try takeaway or move the pin.'}
                              </span>
                            </div>
                            {validation?.reason === 'out-of-range' && (
                              <button
                                type="button"
                                onClick={() => void pickMode('TAKEAWAY')}
                                className="text-sm text-brand hover:text-brand-light font-medium mt-2"
                              >
                                Switch to Pickup instead
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </AddressMapPicker>
              </div>
            ) : (
              <div className="order-delivery-stage">
                <div className="order-delivery-stage__chrome">
                  <button type="button" onClick={goBackToChoose} className="order-flow-back order-flow-back--overlay">
                    <ChevronLeft size={16} />
                    Change order type
                  </button>
                </div>

                <div className="address-map-overlay">
                  <div className="address-map-overlay__map">
                    <PickupMap
                      lat={pickupCoords?.lat ?? DEFAULT_LOCATION.lat}
                      lng={pickupCoords?.lng ?? DEFAULT_LOCATION.lng}
                      onLocationChange={(la, ln) => {
                        setPickupCoords({ lat: la, lng: ln });
                        setPickupAreaLabel('pinned location');
                      }}
                      branchMarkers={pickupBranchMarkers}
                      selectedBranchId={selectedStore?.id ?? null}
                      onBranchSelect={(id) => {
                        const store = allStores.find((s) => s.id === id);
                        if (store) handleTakeawayStoreClick(store);
                      }}
                      showRoute={Boolean(selectedStore && pickupCoords)}
                      routeAnimation="pickup"
                      className="h-full min-h-0 delivery-map-wrap--bleed"
                    />
                  </div>

                  <div className="address-map-overlay__top">
                    <div className="address-map-overlay__panel">
                      <div className="order-delivery-stage__heading">
                        <h3 className="order-flow-step__title">Choose your pickup store</h3>
                      </div>
                      <div className="input-icon-wrap input-icon-wrap--both address-map-overlay__branch-search relative">
                        <Search size={16} className="input-icon" aria-hidden />
                        <input
                          type="search"
                          value={branchSearch}
                          onChange={(e) => setBranchSearch(e.target.value)}
                          placeholder="Search all branches, e.g. Nugegoda..."
                          className="input-field w-full"
                          autoComplete="off"
                          aria-label="Search all pickup branches by name or city"
                        />
                        <div className="address-map-overlay__search-actions">
                          {branchSearchQuery ? (
                            <button
                              type="button"
                              onClick={() => setBranchSearch('')}
                              title="Clear search"
                              aria-label="Clear branch search"
                              className="input-action text-muted hover:text-fg"
                            >
                              <X size={16} strokeWidth={2} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setPickupAreaLabel('your location');
                              setBranchSearch('');
                              void detectPickupLocation(true);
                            }}
                            disabled={detectingLocation}
                            title="Use my current location"
                            aria-label="Use my current location to find the nearest outlet"
                            className="input-action text-brand hover:text-brand-dark disabled:opacity-50"
                          >
                            {detectingLocation ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Crosshair size={18} strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {(detectingLocation || (storesLoading && pickupCoords)) && (
                      <div className="flex items-center gap-2 text-sm text-brand p-3 rounded-xl bg-white/95 border border-navy-border shadow-md">
                        <Loader2 size={16} className="animate-spin shrink-0" />
                        Finding the nearest outlet...
                      </div>
                    )}
                  </div>

                  <div className="address-map-overlay__bottom">
                    <div className="order-delivery-sheet">
                      <p className="order-delivery-sheet__label">
                        {branchSearchQuery
                          ? `Matching branches · “${branchSearchQuery}”`
                          : pickupCoords
                            ? `Nearby branches${pickupAreaLabel ? ` · ${pickupAreaLabel}` : ''}`
                            : 'All branches'}
                      </p>
                      {pickupStoresList.length === 0 && !storesLoading ? (
                        <div className="order-delivery-sheet__empty">
                          <p className="text-sm text-muted text-center py-2">
                            {branchSearchQuery
                              ? `No branches match “${branchSearchQuery}”. Try another name or city.`
                              : 'No branches available.'}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="order-branch-slider" role="list">
                            {pickupStoresList.map((store, index) => {
                              const selected = selectedStore?.id === store.id;
                              return (
                                <button
                                  key={store.id}
                                  type="button"
                                  role="listitem"
                                  onClick={() => handleTakeawayStoreClick(store)}
                                  className={`order-branch-slide ${
                                    selected ? 'order-branch-slide--selected' : ''
                                  }`}
                                >
                                  <span className="order-branch-slide__thumb" aria-hidden>
                                    <Store size={20} className="text-brand" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-fg text-sm truncate block">
                                        {store.name}
                                      </span>
                                      {pickupCoords && !branchSearchQuery && index === 0 && store.distanceKm != null && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand/15 text-brand-dark shrink-0">
                                          Nearest
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-xs text-muted mt-0.5 block truncate">
                                      {store.distanceKm != null
                                        ? `${store.distanceKm.toFixed(1)} km · `
                                        : ''}
                                      {store.city}
                                      {isBranchManuallyClosed(store)
                                        ? ' · Closed'
                                        : store.isBusy
                                          ? ' · Busy'
                                          : ' · Open'}
                                    </span>
                                  </span>
                                  {selected ? (
                                    <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                                  ) : (
                                    <span className="order-branch-slide__ring" aria-hidden />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="order-delivery-sheet__hint">
                            Tap a branch to confirm
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
