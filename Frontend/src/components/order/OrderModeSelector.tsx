'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCartStore, type OrderMode } from '@/store/cartStore';
import { AddressMapPicker, type AddressSelection } from './AddressMapPicker';
import type { Store as StoreType, DeliveryValidation, DeliveryBranchOption } from '@/types';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/store/confirmStore';
import { getCurrentPositionWithFallback } from '@/lib/geolocation';
import { playModeSelectSound, playLocationPinSound, playConfirmClickSound } from '@/lib/uiSounds';
import { branchManuallyClosedMessage, isBranchManuallyClosed } from '@/lib/storeOrderingHours';
import {
  TAKEAWAY_MAX_KM,
  buildDeliveryBranchRows,
  buildPickupBranchRows,
  branchRowsToLatLngMarkers,
  branchRowsToMapBranches,
  isDeliveryBranchOrderable,
  orderingFieldsFromStore,
  selectableBranchIds,
  storeMatchesPickupSearch,
} from '@/components/order-redesign/orderSetupBranches';
import {
  buildOrderSetupFooterState,
  type OrderSetupFooterState,
} from '@/components/order-redesign/orderSetupFooter';
import { OrderModeChooseLegacy } from '@/components/order/OrderModeChooseLegacy';
import { OrderSetupLegacyDeliverySheet } from '@/components/order/OrderSetupLegacyDeliverySheet';
import { OrderSetupLegacyPickupStage } from '@/components/order/OrderSetupLegacyPickupStage';

export type { OrderSetupFooterState } from '@/components/order-redesign/orderSetupFooter';
import { OrderTypeStep } from '@/components/order-redesign/OrderTypeStep';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import { OrderSetupSearchField } from '@/components/order-redesign/OrderSetupSearchField';
import { OrderSetupLocationStatus } from '@/components/order-redesign/OrderSetupLocationStatus';
import { OrderSetupBranchList } from '@/components/order-redesign/OrderSetupBranchList';
import { OrderSetupBranchStepShell } from '@/components/order-redesign/OrderSetupBranchStepShell';
import { OrderSetupBranchCarousel } from '@/components/order-redesign/OrderSetupBranchCarousel';
import { OrderSetupBranchMap } from '@/components/order-redesign/OrderSetupBranchMap';
import { cn } from '@/components/home-redesign/lib/cn';

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
  appearance?: 'legacy' | 'redesign';
  onSetupFooterChange?: (footer: OrderSetupFooterState | null) => void;
  onBackToType?: () => void;
  /** When set (e.g. from OrderModeModal), step is driven by the parent — Back returns to order type. */
  flowStep?: 'choose' | 'setup';
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
  appearance = 'legacy',
  onSetupFooterChange,
  onBackToType,
  flowStep,
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
  /** Parent-controlled step from OrderModeModal; avoids fighting local state on Back / pick mode. */
  const viewStep = flowStep ?? step;
  const [mode, setMode] = useState<OrderMode>(() => {
    if (initialMode) return initialMode;
    if (orderMode === 'TAKEAWAY' || takeawayInfo) return 'TAKEAWAY';
    if (orderMode === 'DELIVERY' || deliveryInfo) return 'DELIVERY';
    return 'DELIVERY';
  });
  const [choiceHighlight, setChoiceHighlight] = useState<OrderMode | null>(null);

  useEffect(() => {
    if (flowStep === 'choose') {
      setValidation(null);
    }
  }, [flowStep]);

  useEffect(() => {
    if (flowStep !== undefined) return;
    onStepChange?.(step);
  }, [step, onStepChange, flowStep]);

  useEffect(() => {
    if (viewStep === 'setup') onModeChange?.(mode);
  }, [mode, viewStep, onModeChange]);

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
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);
  const [carouselHeight, setCarouselHeight] = useState(0);
  const pickupListRef = useRef<HTMLUListElement>(null);
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
    enabled: mode === 'TAKEAWAY' && viewStep === 'setup',
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
    () => branchRowsToLatLngMarkers(buildPickupBranchRows(pickupStoresList, branchSearchQuery, pickupCoords)),
    [pickupStoresList, branchSearchQuery, pickupCoords],
  );

  const suggestedDeliveryBranches = useMemo(
    () => validation?.suggestedBranches?.filter((b) => b.suggested) ?? [],
    [validation],
  );

  const pickupBranchRows = useMemo(
    () => buildPickupBranchRows(pickupStoresList, branchSearchQuery, pickupCoords),
    [pickupStoresList, branchSearchQuery, pickupCoords],
  );

  const pickupMapBranches = useMemo(() => branchRowsToMapBranches(pickupBranchRows), [pickupBranchRows]);

  const pickupSelectableIds = useMemo(() => selectableBranchIds(pickupBranchRows), [pickupBranchRows]);

  const deliveryBranchRows = useMemo(
    () => buildDeliveryBranchRows(suggestedDeliveryBranches),
    [suggestedDeliveryBranches],
  );

  const deliveryMapBranches = useMemo(() => branchRowsToMapBranches(deliveryBranchRows), [deliveryBranchRows]);

  const deliverySelectableIds = useMemo(() => selectableBranchIds(deliveryBranchRows), [deliveryBranchRows]);

  const deliveryBranchMarkers = useMemo(
    () => branchRowsToLatLngMarkers(deliveryBranchRows),
    [deliveryBranchRows],
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
    if (mode !== 'DELIVERY' || viewStep !== 'setup' || !addressSelection?.address) return;
    const timer = setTimeout(() => {
      void validateDeliveryAt(addressSelection, undefined, true);
    }, 500);
    return () => clearTimeout(timer);
  }, [addressSelection, mode, viewStep, validateDeliveryAt]);

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
    if (mode !== 'TAKEAWAY' || viewStep !== 'setup' || pickupCoords) return;
    if (pickupAutoDetectStarted.current) return;
    pickupAutoDetectStarted.current = true;
    setPickupAreaLabel('your location');
    void detectPickupLocation(false);
  }, [mode, viewStep, pickupCoords, detectPickupLocation]);

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
    if (flowStep !== undefined) {
      onStepChange?.('setup');
    } else {
      setStep('setup');
    }
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
    setValidation(null);
    if (flowStep !== undefined) {
      onBackToType?.();
      return;
    }
    setStep('choose');
    onBackToType?.();
  }

  useEffect(() => {
    if (appearance !== 'redesign' || viewStep !== 'setup') {
      onSetupFooterChange?.(null);
      return;
    }
    onSetupFooterChange?.(
      buildOrderSetupFooterState({
        mode,
        validating,
        selectedDeliveryStoreId,
        addressSelection,
        suggestedDeliveryBranches,
        selectedStore,
        onConfirmDelivery: () => void validateAndSaveDelivery(),
        onConfirmTakeaway: confirmTakeaway,
      }),
    );
  }, [
    appearance,
    viewStep,
    mode,
    validating,
    selectedDeliveryStoreId,
    addressSelection,
    suggestedDeliveryBranches,
    selectedStore,
    onSetupFooterChange,
  ]);

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

  const isRedesign = appearance === 'redesign';

  return (
    <div
      className={cn(
        'order-flow',
        viewStep === 'setup' && (isRedesign ? 'flex min-h-0 flex-1 flex-col' : 'order-flow--map'),
      )}
    >
      <AnimatePresence mode="wait">
        {viewStep === 'choose' ? (
          isRedesign ? (
            <OrderTypeStep key="choose-redesign" onChoose={(m) => void pickMode(m)} />
          ) : (
            <OrderModeChooseLegacy
              choiceHighlight={choiceHighlight}
              onHighlight={setChoiceHighlight}
              onChoose={(m) => void pickMode(m)}
              onBackToHome={onBackToHome}
            />
          )
        ) : (
          <motion.div
            key={`setup-${mode}`}
            initial={isRedesign ? false : { opacity: 0, x: 28 }}
            animate={isRedesign ? undefined : { opacity: 1, x: 0 }}
            exit={isRedesign ? undefined : { opacity: 0, x: 28 }}
            transition={{ duration: 0.28 }}
            className={cn(
              isRedesign ? 'flex min-h-0 flex-1 flex-col' : `order-flow-step ${viewStep === 'setup' ? 'order-flow-step--map' : ''}`,
            )}
          >
            {mode === 'DELIVERY' ? (
              <div className={cn('order-delivery-stage', isRedesign && 'flex min-h-0 flex-1 flex-col')}>
                {!isRedesign && (
                <div className="order-delivery-stage__chrome">
                  <button type="button" onClick={goBackToChoose} className="order-flow-back order-flow-back--overlay">
                    <ChevronLeft size={16} />
                    Change order type
                  </button>
                </div>
                )}

                {isRedesign ? (
                  <OrderSetupBranchStepShell
                    sidebar={
                      <>
                        <AddressMapPicker
                          value={addressSelection}
                          variant="prominent"
                          layout="stacked"
                          showMap={false}
                          searchAppearance="redesign"
                          autoDetectOnMount={!addressSelection}
                          branchMarkers={deliveryBranchMarkers}
                          selectedBranchId={selectedDeliveryStoreId}
                          onBranchSelect={selectDeliveryBranchFromMap}
                          showRoute={false}
                          routeAnimation="delivery"
                          onLocationResolved={playLocationPinSound}
                          onChange={(sel) => {
                            setAddressSelection(sel);
                            setValidation(null);
                            setSelectedDeliveryStoreId(null);
                          }}
                        />
                        <OrderSetupBranchList
                          branches={deliveryBranchRows}
                          selectedId={selectedDeliveryStoreId}
                          from={
                            addressSelection
                              ? { lat: addressSelection.lat, lng: addressSelection.lng }
                              : null
                          }
                          loading={validating && deliveryBranchRows.length === 0}
                          onSelect={(id) => {
                            const branch = suggestedDeliveryBranches.find((b) => b.id === id);
                            if (branch) handleDeliveryBranchClick(branch);
                          }}
                          onHover={setHoveredBranchId}
                          emptyMessage={
                            addressSelection
                              ? validating
                                ? orderSetupCopy.findingBranches
                                : 'Move the pin or search to find deliverable branches.'
                              : 'Set your delivery location on the map.'
                          }
                        />
                      </>
                    }
                    map={
                      <>
                        <OrderSetupBranchMap
                          branches={deliveryMapBranches}
                          selectableIds={deliverySelectableIds}
                          selectedId={selectedDeliveryStoreId}
                          highlightedId={hoveredBranchId ?? focusedBranchId}
                          focusedId={focusedBranchId}
                          insetBottom={carouselHeight}
                          deliveryPin={
                            addressSelection
                              ? { lat: addressSelection.lat, lng: addressSelection.lng }
                              : null
                          }
                          deliveryPinLabel="Deliver here"
                          deliveryRadiusKm={7}
                          onMoveDeliveryPin={(loc) => {
                            setAddressSelection((prev) =>
                              prev
                                ? { ...prev, lat: loc.lat, lng: loc.lng }
                                : { address: '', lat: loc.lat, lng: loc.lng },
                            );
                            setValidation(null);
                            setSelectedDeliveryStoreId(null);
                          }}
                          userLocation={
                            addressSelection
                              ? { lat: addressSelection.lat, lng: addressSelection.lng }
                              : null
                          }
                          compactWhenZoomedOut
                          onSelect={(id) => selectDeliveryBranchFromMap(id)}
                          onHover={setHoveredBranchId}
                          className="h-full min-h-0 rounded-3xl ring-1 ring-brand-100 ring-inset"
                        />
                        {deliveryBranchRows.length > 0 ? (
                          <OrderSetupBranchCarousel
                            branches={deliveryBranchRows}
                            selectedId={selectedDeliveryStoreId}
                            from={
                              addressSelection
                                ? { lat: addressSelection.lat, lng: addressSelection.lng }
                                : null
                            }
                            onSelect={(id) => {
                              const branch = suggestedDeliveryBranches.find((b) => b.id === id);
                              if (branch) handleDeliveryBranchClick(branch);
                            }}
                            onFocus={setFocusedBranchId}
                            onHeightChange={setCarouselHeight}
                          />
                        ) : null}
                      </>
                    }
                  />
                ) : (
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
                    !isRedesign ? (
                    <div className="order-delivery-stage__heading">
                      <h3 className="order-flow-step__title">Where should we deliver?</h3>
                    </div>
                    ) : undefined
                  }
                  onChange={(sel) => {
                    setAddressSelection(sel);
                    setValidation(null);
                    setSelectedDeliveryStoreId(null);
                  }}
                >
                  <div className="order-delivery-sheet">
                    <OrderSetupLegacyDeliverySheet
                      validating={validating}
                      validation={validation}
                      suggestedDeliveryBranches={suggestedDeliveryBranches}
                      selectedDeliveryStoreId={selectedDeliveryStoreId}
                      onBranchClick={handleDeliveryBranchClick}
                      onSwitchToPickup={() => void pickMode('TAKEAWAY')}
                    />
                  </div>
                </AddressMapPicker>
                )}
              </div>
            ) : isRedesign ? (
              <OrderSetupBranchStepShell
                sidebar={
                  <>
                    <OrderSetupSearchField
                      label={orderSetupCopy.searchBranches}
                      placeholder={orderSetupCopy.searchBranchesPlaceholder}
                      value={branchSearch}
                      onChange={setBranchSearch}
                    />
                    <OrderSetupLocationStatus
                      locating={detectingLocation || (storesLoading && Boolean(pickupCoords))}
                      located={Boolean(pickupCoords)}
                    />
                    <OrderSetupBranchList
                      listRef={pickupListRef}
                      branches={pickupBranchRows}
                      selectedId={selectedStore?.id ?? null}
                      from={pickupCoords}
                      loading={detectingLocation || (storesLoading && !pickupStoresList.length)}
                      onSelect={(id) => {
                        const store = allStores.find((s) => s.id === id);
                        if (store) handleTakeawayStoreClick(store);
                      }}
                      onHover={setHoveredBranchId}
                      emptyMessage={
                        branchSearchQuery
                          ? `No branches match “${branchSearchQuery}”.`
                          : undefined
                      }
                    />
                  </>
                }
                map={
                  <>
                    <OrderSetupBranchMap
                      branches={pickupMapBranches}
                      selectableIds={pickupSelectableIds}
                      selectedId={selectedStore?.id ?? null}
                      highlightedId={hoveredBranchId ?? focusedBranchId}
                      focusedId={focusedBranchId}
                      insetBottom={carouselHeight}
                      userLocation={pickupCoords}
                      compactWhenZoomedOut
                      onSelect={(id) => {
                        const store = allStores.find((s) => s.id === id);
                        if (store) handleTakeawayStoreClick(store);
                      }}
                      onHover={setHoveredBranchId}
                      className="h-full min-h-0 rounded-3xl ring-1 ring-brand-100 ring-inset"
                    />
                    <OrderSetupBranchCarousel
                      branches={pickupBranchRows}
                      selectedId={selectedStore?.id ?? null}
                      from={pickupCoords}
                      onSelect={(id) => {
                        const store = allStores.find((s) => s.id === id);
                        if (store) handleTakeawayStoreClick(store);
                      }}
                      onFocus={setFocusedBranchId}
                      onHeightChange={setCarouselHeight}
                    />
                  </>
                }
              />
            ) : (
              <OrderSetupLegacyPickupStage
                pickupCoords={pickupCoords}
                pickupAreaLabel={pickupAreaLabel}
                branchSearch={branchSearch}
                branchSearchQuery={branchSearchQuery}
                detectingLocation={detectingLocation}
                storesLoading={storesLoading}
                pickupStoresList={pickupStoresList}
                pickupBranchMarkers={pickupBranchMarkers}
                selectedStore={selectedStore}
                onBack={goBackToChoose}
                onBranchSearchChange={setBranchSearch}
                onDetectLocation={() => {
                  setPickupAreaLabel('your location');
                  setBranchSearch('');
                  void detectPickupLocation(true);
                }}
                onPickupCoordsChange={(coords) => {
                  setPickupCoords(coords);
                  setPickupAreaLabel('pinned location');
                }}
                onStoreClick={handleTakeawayStoreClick}
                onMapBranchSelect={(id) => {
                  const store = allStores.find((s) => s.id === id);
                  if (store) handleTakeawayStoreClick(store);
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
