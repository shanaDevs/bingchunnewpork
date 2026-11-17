'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  Clock,
  House,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Store,
  Trash2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { selectActiveStoreId, useCartStore, type LocalCartItem, type OrderMode } from '@/store/cartStore';
import { type AddressSelection } from './AddressMapPicker';
import { DeliveryLocationChooser, reverseGeocodeAddress } from './DeliveryLocationChooser';
import { SetOnMapModal } from './SetOnMapModal';
import type { Store as StoreType, DeliveryValidation, DeliveryBranchOption } from '@/types';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/store/confirmStore';
import { getCurrentPosition } from '@/lib/geolocation';
import { MASCOT_IMAGES } from '@/lib/mascotImages';
import { playModeSelectSound, playLocationPinSound, playConfirmClickSound } from '@/lib/uiSounds';
import { branchManuallyClosedMessage, isBranchManuallyClosed } from '@/lib/storeOrderingHours';
import { findCartItemsUnavailableAt } from '@/lib/branchCartConflicts';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import { cn } from '@/components/home-redesign/lib/cn';
import {
  ORDER_FLOW_FOCUS_RING,
  formatOrderFlowDistance,
  formatOrderFlowHour,
  orderFlowPrimaryButton,
  orderFlowSecondaryButton,
  orderingFieldsFromStore,
  shortOrderAddress,
} from '@/components/order/orderFlowUi';

function isDeliveryBranchOrderable(branch: DeliveryBranchOption): boolean {
  return branch.suggested && !branch.branchClosed;
}

/**
 * saved – a branch was set up before: continue with it, or choose again (small panel).
 * type – step 1, Pickup or Delivery (small panel).
 * location – search / current location / set on map (page-like panel), for both Pickup and Delivery.
 * setup – nearest-branch list after a place is confirmed (page-like panel).
 * conflict – the chosen branch can't supply some items in the cup: remove them and switch, or go back (small panel).
 */
export type OrderFlowStep = 'saved' | 'type' | 'location' | 'setup' | 'conflict';

interface OrderModeSelectorProps {
  onComplete?: () => void;
  onBackToHome?: () => void;
  onModeChange?: (mode: OrderMode) => void;
  onStepChange?: (step: OrderFlowStep) => void;
  /** True while the order modal is open — used to refresh nearest branches on reopen. */
  modalOpen?: boolean;
  /** Skip step 1 and open setup for this mode (from navbar Delivery/Pickup buttons). */
  initialMode?: OrderMode;
  startAtSetup?: boolean;
}

/** A choice held back by the conflict step: the cup lines it would remove, and how to apply it. */
type PendingSwitch = {
  storeName: string;
  lines: LocalCartItem[];
  apply: () => void;
  from: OrderFlowStep;
};

export function OrderModeSelector({
  onComplete,
  onBackToHome,
  onModeChange,
  onStepChange,
  initialMode,
  startAtSetup = false,
}: OrderModeSelectorProps) {
  const {
    orderMode,
    setOrderMode,
    setDeliveryInfo,
    setTakeawayInfo,
    deliveryInfo,
    takeawayInfo,
    items,
    clearCart,
    clearMode,
    removeItem,
  } = useCartStore();
  const activeStoreId = selectActiveStoreId({ orderMode, deliveryInfo, takeawayInfo });

  const hasSavedSetup = Boolean(
    (orderMode === 'DELIVERY' && deliveryInfo) || (orderMode === 'TAKEAWAY' && takeawayInfo)
  );
  const [step, setStep] = useState<OrderFlowStep>(() => {
    if (startAtSetup && initialMode) return 'setup';
    return hasSavedSetup ? 'saved' : 'type';
  });
  /** Map first; the nearest-branch list appears only after the place is confirmed. */
  const [setupPhase, setSetupPhase] = useState<'place' | 'branches'>('place');
  const [mode, setMode] = useState<OrderMode>(() => {
    if (initialMode) return initialMode;
    if (orderMode === 'TAKEAWAY' || takeawayInfo) return 'TAKEAWAY';
    if (orderMode === 'DELIVERY' || deliveryInfo) return 'DELIVERY';
    return 'DELIVERY';
  });
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [checkingBranch, setCheckingBranch] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === 'setup') {
      onStepChange?.('location');
      return;
    }
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (step === 'setup') onModeChange?.(mode);
  }, [mode, step, onModeChange]);

  // Each step swaps the panel's content; start the new step at its heading.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

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
  const [detectingDeliveryLocation, setDetectingDeliveryLocation] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const userPickedStore = useRef(false);
  /** After confirming a pickup place, don't auto-select the last-used branch on the nearest list. */
  const skipSavedPickupSelection = useRef(false);
  const validateSeq = useRef(0);

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
    enabled: mode === 'TAKEAWAY' && step === 'setup' && pickupCoords != null,
  });

  const sortedStores = useMemo(
    () => [...allStores].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)),
    [allStores],
  );

  const suggestedDeliveryBranches = useMemo(
    () => validation?.suggestedBranches?.filter((b) => b.suggested) ?? [],
    [validation],
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
    if (mode !== 'TAKEAWAY' || skipSavedPickupSelection.current || !takeawayInfo?.storeId || allStores.length === 0) return;
    const saved = allStores.find((s) => s.id === takeawayInfo.storeId);
    if (saved) {
      setSelectedStore(saved);
      userPickedStore.current = true;
    }
  }, [mode, allStores, takeawayInfo]);

  const validateDeliveryAt = useCallback(async (sel: AddressSelection, silent = true): Promise<DeliveryValidation | null> => {
    setValidating(true);
    const seq = ++validateSeq.current;
    try {
      const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
        lat: sel.lat,
        lng: sel.lng,
        address: sel.address,
      });
      if (seq !== validateSeq.current) return null;
      setValidation(result);
      if (!silent && !result.eligible) {
        toast.error(result.message || 'Delivery not available to this address');
      }
      return result;
    } catch {
      if (seq !== validateSeq.current) return null;
      setValidation(null);
      setSelectedDeliveryStoreId(null);
      if (!silent) toast.error('Could not check delivery for this location');
      return null;
    } finally {
      if (seq === validateSeq.current) setValidating(false);
    }
  }, []);

  // Refresh nearest branches if the saved pin changes while the list is open.
  useEffect(() => {
    if (mode !== 'DELIVERY' || step !== 'setup' || setupPhase !== 'branches' || !addressSelection?.address) return;
    const timer = setTimeout(() => {
      void validateDeliveryAt(addressSelection, true);
    }, 500);
    return () => clearTimeout(timer);
  }, [addressSelection, mode, step, setupPhase, validateDeliveryAt]);

  async function applyPickupLocation(sel: AddressSelection) {
    playLocationPinSound();
    setAddressSelection(sel);
    setPickupCoords({ lat: sel.lat, lng: sel.lng });
    setSelectedStore(null);
    skipSavedPickupSelection.current = true;
    setDetectingLocation(true);
    try {
      const params = new URLSearchParams({
        lat: String(sel.lat),
        lng: String(sel.lng),
      });
      const withDist = await api.get<StoreType[]>(`/stores?${params.toString()}`);
      if (withDist.length === 0) {
        toast.error('No branches found near this location. Try another spot.');
        return;
      }
      playConfirmClickSound();
      setMapModalOpen(false);
      setSetupPhase('branches');
    } catch {
      toast.error('Could not find nearby branches. Try another location.');
    } finally {
      setDetectingLocation(false);
    }
  }

  async function applyLocation(sel: AddressSelection) {
    if (mode === 'DELIVERY') {
      playLocationPinSound();
      setAddressSelection(sel);
      setSelectedDeliveryStoreId(null);
      const result = await validateDeliveryAt(sel, false);
      if (!result) return;
      const branches = result.suggestedBranches?.filter((b) => b.suggested) ?? [];
      if (result.eligible && branches.length > 0) {
        playConfirmClickSound();
        setMapModalOpen(false);
        setSetupPhase('branches');
        return;
      }
      if (result.eligible && branches.length === 0) {
        toast.error('No branches can deliver to this spot. Try another location.');
      }
      return;
    }
    await applyPickupLocation(sel);
  }

  async function useCurrentPlace() {
    setDetectingDeliveryLocation(true);
    try {
      const coords = await getCurrentPosition();
      const sel = await reverseGeocodeAddress(coords.lat, coords.lng);
      await applyLocation(sel);
    } catch {
      toast.error('Could not detect your location. Allow location access, or set it on the map.');
    } finally {
      setDetectingDeliveryLocation(false);
    }
  }

  /**
   * Before a different branch is saved: if some items in the cup can't be ordered there, hold the choice on
   * the conflict step (remove them and switch, or go back); otherwise apply it straight away. The branch the
   * cup was filled at needs no check.
   */
  async function guardBranchSwitch(storeId: string, storeName: string, apply: () => void) {
    if (items.length === 0 || storeId === activeStoreId) {
      apply();
      return;
    }
    setCheckingBranch(true);
    try {
      const lines = await findCartItemsUnavailableAt(items, storeId);
      if (lines.length > 0) {
        setPending({ storeName, lines, apply, from: step });
        setStep('conflict');
        return;
      }
    } finally {
      setCheckingBranch(false);
    }
    apply();
  }

  function switchAndRemove() {
    if (!pending) return;
    for (const line of pending.lines) removeItem(line.id);
    const count = pending.lines.length;
    toast.success(`Removed ${count} ${count === 1 ? 'item' : 'items'} from your cup`);
    pending.apply();
    setPending(null);
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
    const sel = addressSelection;
    setSelectedDeliveryStoreId(branch.id);
    setValidating(true);
    try {
      const result = await api.post<DeliveryValidation>('/stores/validate-delivery', {
        lat: sel.lat,
        lng: sel.lng,
        address: sel.address,
        storeId: branch.id,
      });
      setValidation(result);
      if (result.eligible && result.store && result.zone) {
        await guardBranchSwitch(result.store.id, result.store.name, () => {
          playConfirmClickSound();
          if (saveDeliveryFromValidation(result, sel)) {
            toast.success(`Delivering from ${result.store!.name} · ~${result.estimatedMinutes ?? 30} min`);
            onComplete?.();
          }
        });
      } else {
        toast.error(result.message || 'Delivery not available from this branch');
      }
    } catch {
      toast.error('Could not select this branch');
    } finally {
      setValidating(false);
    }
  }

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
    setSetupPhase('place');
    setValidation(null);
    setSelectedStore(null);
    setSelectedDeliveryStoreId(null);
    setPickupCoords(null);
    setMapModalOpen(false);
    userPickedStore.current = false;
    skipSavedPickupSelection.current = false;
  }

  function goBackToChoose() {
    setStep('type');
    setValidation(null);
    setSetupPhase('place');
  }


  /** From the branch list, Back returns to Choose Location. From there, Back returns to Pickup or Delivery. */
  function goBackFromSetup() {
    if (setupPhase === 'branches') {
      setSetupPhase('place');
      setMapModalOpen(false);
      return;
    }
    setMapModalOpen(false);
    goBackToChoose();
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

  async function confirmTakeawayStore(store: StoreType) {
    if (isBranchManuallyClosed(store)) {
      toast.error('This branch is temporarily closed for online orders.');
      return;
    }
    userPickedStore.current = true;
    setSelectedStore(store);
    await guardBranchSwitch(store.id, store.name, () => {
      playConfirmClickSound();
      setOrderMode('TAKEAWAY');
      setTakeawayInfo({
        storeId: store.id,
        storeName: store.name,
        ...orderingFieldsFromStore(store),
      });
      toast.success(`Pickup from ${store.name}`);
      onComplete?.();
    });
  }

  /** Saved step: carry on with the branch set up before. */
  function continueWithSaved() {
    playConfirmClickSound();
    onComplete?.();
  }

  // --- Branch options, as shown in the list (md+) and the phone cards ---

  const deliveryOptions: BranchOptionView[] = suggestedDeliveryBranches.map((branch, index) => ({
    id: branch.id,
    name: branch.name,
    badges: [
      ...(index === 0 ? [{ label: 'Nearest', tone: 'nearest' as const }] : []),
      ...(branch.id === deliveryInfo?.storeId ? [{ label: 'Last used', tone: 'last' as const }] : []),
      ...(branch.branchClosed ? [{ label: 'Closed', tone: 'closed' as const }] : []),
    ],
    distance: `${formatOrderFlowDistance(branch.distanceKm)} away`,
    extra: branch.branchClosed ? 'Not accepting orders' : `LKR ${branch.fee.toLocaleString()} delivery`,
    disabled: !isDeliveryBranchOrderable(branch),
  }));
  const selectedDeliveryBranch =
    suggestedDeliveryBranches.find((b) => b.id === selectedDeliveryStoreId && isDeliveryBranchOrderable(b)) ?? null;

  const pickupOptions: BranchOptionView[] = sortedStores.map((store, index) => {
    const closed = isBranchManuallyClosed(store);
    return {
      id: store.id,
      name: store.name,
      badges: [
        ...(pickupCoords && index === 0 && store.distanceKm != null
          ? [{ label: 'Nearest', tone: 'nearest' as const }]
          : []),
        ...(store.id === takeawayInfo?.storeId ? [{ label: 'Last used', tone: 'last' as const }] : []),
        ...(closed ? [{ label: 'Closed', tone: 'closed' as const }] : store.isBusy ? [{ label: 'Busy', tone: 'busy' as const }] : []),
      ],
      distance: store.distanceKm != null ? `${formatOrderFlowDistance(store.distanceKm)} away` : undefined,
      extra: store.city,
      disabled: closed,
    };
  });

  const selectPickupById = (id: string) => {
    const store = allStores.find((s) => s.id === id);
    if (store) void confirmTakeawayStore(store);
  };
  const selectDeliveryById = (id: string) => {
    const branch = suggestedDeliveryBranches.find((b) => b.id === id);
    if (branch) void confirmDeliveryBranch(branch);
  };

  // --- Header ---

  const kicker =
    step === 'saved' ? 'Welcome back' : step === 'conflict' ? 'Heads up' : 'Before you order';
  const heading =
    step === 'type' ? (
      <>
        How would you like to <Highlight>order?</Highlight>
      </>
    ) : step === 'saved' ? (
      <>
        Same as <Highlight>last time?</Highlight>
      </>
    ) : step === 'conflict' ? (
      <>
        Switch <Highlight>branches?</Highlight>
      </>
    ) : setupPhase === 'branches' ? (
      <>
        Choose a <Highlight>branch</Highlight>
      </>
    ) : (
      <>
        Where&apos;s your <Highlight>happiness</Highlight> heading?
      </>
    );

  return (
    <>
      {/* Landscape phones (short:): tighter header, no kicker; the setup step's heading is only read out. */}
      {step === 'setup' && setupPhase === 'place' ? (
        <header className="relative flex shrink-0 items-center justify-center px-4 py-3.5">
          <button
            type="button"
            onClick={goBackFromSetup}
            aria-label="Back"
            className={cn(
              'absolute left-3 grid size-10 place-items-center rounded-full text-slate-900 transition-colors hover:bg-slate-100',
              ORDER_FLOW_FOCUS_RING,
            )}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <h2
            ref={headingRef}
            id="order-popup-heading"
            tabIndex={-1}
            className="text-[17px] font-semibold text-slate-900 outline-none"
          >
            Choose Location
          </h2>
        </header>
      ) : (
      <header className="relative shrink-0 px-5 pt-6 pb-4 sm:px-8 sm:pt-8 short:pt-4 short:pb-3">
        {step === 'setup' ? (
          <div className="flex items-center gap-2 pr-12">
            {/* 40px tall below desktop, an easy tap target. */}
            <button
              type="button"
              onClick={goBackFromSetup}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50 max-lg:h-10 max-lg:pr-4 max-lg:pl-3',
                ORDER_FLOW_FOCUS_RING,
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 max-lg:h-10">
              {mode === 'TAKEAWAY' ? <Store className="size-4" aria-hidden /> : <Bike className="size-4" aria-hidden />}
              {mode === 'TAKEAWAY' ? 'Pickup' : 'Delivery'}
            </span>
          </div>
        ) : (
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase short:hidden">{kicker}</p>
        )}
        <h2
          ref={headingRef}
          id="order-popup-heading"
          tabIndex={-1}
          className={cn(
            "font-display pr-12 text-[clamp(1.75rem,4.2vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.01em] text-black uppercase outline-none [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.12em] short:mt-0 short:text-2xl",
            step === 'setup' ? 'mt-3 short:sr-only' : 'mt-2',
          )}
        >
          {heading}
        </h2>
      </header>
      )}

      {/* Keyed by step, so each step fades in. */}
      <div
        key={step}
        className="flex min-h-0 flex-1 flex-col transition-opacity duration-300 ease-out starting:opacity-0"
      >
        {step === 'type' && (
          // -mt-1 pt-1: room above the cards inside this scroll area, so a card lifted on hover isn't clipped at the top.
          <div className="-mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-1 pb-6 sm:px-8 sm:pb-8 short:pb-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {MODES.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => void pickMode(option.mode)}
                  className={cn(
                    'group flex flex-col items-center rounded-[1.5rem] bg-white px-3 pt-5 pb-4 text-center ring-1 ring-brand-100 ring-inset transition-[background-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-lg hover:ring-2 hover:shadow-brand-600/10 hover:ring-brand-600 sm:px-5 sm:pt-6 sm:pb-5 short:pt-3 short:pb-3',
                    ORDER_FLOW_FOCUS_RING,
                  )}
                >
                  <span className="grid size-24 place-items-center rounded-full bg-brand-50 transition-colors group-hover:bg-white sm:size-32 short:size-18">
                    <Image
                      src={option.image}
                      alt=""
                      width={500}
                      height={500}
                      sizes="128px"
                      unoptimized
                      className="size-22 object-contain transition-transform duration-300 ease-out group-hover:scale-105 group-hover:-rotate-3 sm:size-30 short:size-16"
                    />
                  </span>
                  <span className="mt-4 flex items-center gap-2 text-lg font-semibold text-brand-900 sm:text-xl short:mt-2">
                    <option.icon className="size-5 text-brand-600" aria-hidden />
                    {option.title}
                  </span>
                  <span className="mt-1 text-[0.8125rem] leading-snug text-slate-600 sm:text-sm">{option.text}</span>
                  <span
                    aria-hidden
                    className="mt-4 grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-snow short:mt-2"
                  >
                    <ArrowRight className="size-4" />
                  </span>
                </button>
              ))}
            </div>
            <FlowLinks onBackToHome={onBackToHome} />
          </div>
        )}

        {step === 'saved' && (
          <SavedStep
            mode={orderMode === 'TAKEAWAY' ? 'TAKEAWAY' : 'DELIVERY'}
            storeName={(orderMode === 'TAKEAWAY' ? takeawayInfo?.storeName : deliveryInfo?.storeName) ?? ''}
            address={orderMode === 'DELIVERY' ? deliveryInfo?.address : undefined}
            openTime={(orderMode === 'TAKEAWAY' ? takeawayInfo?.openTime : deliveryInfo?.openTime) ?? DEFAULT_OPEN_TIME}
            closeTime={(orderMode === 'TAKEAWAY' ? takeawayInfo?.closeTime : deliveryInfo?.closeTime) ?? DEFAULT_CLOSE_TIME}
            closed={isBranchManuallyClosed({
              branchClosedAt: (orderMode === 'TAKEAWAY' ? takeawayInfo?.branchClosedAt : deliveryInfo?.branchClosedAt) ?? null,
            })}
            onContinue={continueWithSaved}
            onChange={() => setStep('type')}
          >
            <FlowLinks onBackToHome={onBackToHome} />
          </SavedStep>
        )}

        {step === 'conflict' && pending && (
          <ConflictStep
            pending={pending}
            onBack={() => {
              setStep(pending.from);
              setPending(null);
            }}
            onSwitch={switchAndRemove}
          />
        )}

        {step === 'setup' && (
          <>
            {/* The panel itself never scrolls: the map fills it, and only the branch list scrolls. */}
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                setupPhase === 'place' ? 'pb-3' : 'px-5 pb-3 sm:px-8',
              )}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                {setupPhase === 'place' ? (
                  <>
                    <DeliveryLocationChooser
                      currentAddress={addressSelection?.address}
                      locating={detectingDeliveryLocation}
                      busy={validating || detectingLocation}
                      onSelectLocation={(sel) => void applyLocation(sel)}
                      onUseCurrentLocation={() => void useCurrentPlace()}
                      onOpenMap={() => setMapModalOpen(true)}
                    />
                    {(validating || detectingLocation) && (
                      <div className="px-5 sm:px-8">
                        <StatusLine icon={Loader2} spin>
                          {mode === 'DELIVERY'
                            ? 'Checking which branches can deliver here…'
                            : 'Finding branches near you…'}
                        </StatusLine>
                      </div>
                    )}
                    {mode === 'DELIVERY' && validation && !validation.eligible && (
                      <p className="px-5 pt-3 text-xs leading-5 text-red-700 sm:px-8">
                        {validation.message || "We don't deliver there yet. Try another location, or switch to pickup."}{' '}
                        {validation.reason === 'out-of-range' && (
                          <button
                            type="button"
                            onClick={() => void pickMode('TAKEAWAY')}
                            className={cn('font-semibold text-brand-700 underline underline-offset-2', ORDER_FLOW_FOCUS_RING)}
                          >
                            Switch to Pickup
                          </button>
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    {addressSelection && (
                      <p className="text-sm leading-snug text-slate-600">
                        {mode === 'DELIVERY' ? 'Delivering to' : 'Pickup near'}{' '}
                        <strong className="font-semibold text-brand-900">{addressSelection.address}</strong>
                      </p>
                    )}
                    {mode === 'DELIVERY' ? (
                      <NearestBranches
                        fill
                        options={deliveryOptions}
                        selectedId={selectedDeliveryBranch?.id ?? null}
                        onSelect={selectDeliveryById}
                        pending={validating || Boolean(addressSelection && !validation)}
                        empty={
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {validation?.message || 'No branches can deliver to this spot. Go back and try another location.'}
                          </p>
                        }
                      />
                    ) : (
                      <NearestBranches
                        fill
                        options={pickupOptions}
                        selectedId={selectedStore?.id ?? null}
                        onSelect={selectPickupById}
                        pending={checkingBranch || detectingLocation || (storesLoading && pickupOptions.length === 0)}
                        empty={
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            No branches found near this location. Go back and try another spot.
                          </p>
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <SetOnMapModal
        open={mapModalOpen}
        initial={addressSelection}
        confirming={validating || detectingLocation}
        onConfirm={(sel) => void applyLocation(sel)}
        onClose={() => setMapModalOpen(false)}
      />
    </>
  );
}

/** Pickup first, as in the prototype; the order type sent to the backend stays TAKEAWAY. */
const MODES: { mode: OrderMode; title: string; text: string; image: string; icon: typeof Store }[] = [
  { mode: 'TAKEAWAY', title: 'Pickup', text: 'Collect from a branch near you', image: MASCOT_IMAGES.takeaway, icon: Store },
  { mode: 'DELIVERY', title: 'Delivery', text: "We'll bring it to your door", image: MASCOT_IMAGES.delivery, icon: Bike },
];

/** Brand highlight: blue word on a tilted yellow marker stroke, as in the homepage headings. */
function Highlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate inline-block px-[0.1em] text-brand-700">
      <span aria-hidden className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.45em] -rotate-2 rounded-full bg-sun-300" />
      {children}
    </span>
  );
}

/** "Back to Home", under the first steps when the popup was opened away from the home and menu pages. */
function FlowLinks({ onBackToHome }: { onBackToHome?: () => void }) {
  if (!onBackToHome) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm short:mt-3">
      {onBackToHome && (
        <button
          type="button"
          onClick={onBackToHome}
          className={cn('inline-flex items-center gap-1.5 rounded font-semibold text-brand-600 hover:text-brand-800', ORDER_FLOW_FOCUS_RING)}
        >
          <House className="size-4" aria-hidden />
          Back to Home
        </button>
      )}
    </div>
  );
}

/** One line under the search (prototype: LocationStatus): how the location is used, or what is loading. */
function StatusLine({
  icon: Icon,
  tone,
  spin = false,
  children,
}: {
  icon: typeof Search;
  tone?: 'pending' | 'found';
  spin?: boolean;
  children: ReactNode;
}) {
  return (
    <p role="status" className="mt-2 flex shrink-0 items-start gap-1.5 text-xs leading-5 text-slate-500">
      <Icon
        className={cn(
          'mt-0.75 size-3.5 shrink-0',
          spin && 'animate-spin text-brand-500',
          tone === 'pending' && 'text-brand-500 motion-safe:animate-pulse',
          tone === 'found' && 'text-emerald-600',
        )}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

type BranchBadge = { label: string; tone: 'nearest' | 'last' | 'closed' | 'busy' };

/** A branch as listed: name, badges, distance and one more detail (fee or city). */
type BranchOptionView = {
  id: string;
  name: string;
  badges: BranchBadge[];
  distance?: string;
  extra?: string;
  /** Closed (or can't deliver here): shown greyed out, not selectable. */
  disabled: boolean;
};

const BADGE_TONE: Record<BranchBadge['tone'], string> = {
  nearest: 'bg-brand-100 text-brand-800',
  last: 'bg-sun-300 text-brand-900',
  closed: 'bg-red-100 text-red-700',
  busy: 'bg-amber-100 text-amber-800',
};

/** One branch as a radio option. */
function BranchOption({
  option,
  group,
  card = false,
  selected,
  onSelect,
}: {
  option: BranchOptionView;
  /** The list and the phone cards are separate radio groups, so each keeps its own checked radio. */
  group: string;
  /** Phones: a white card laid over the map, a little tighter. */
  card?: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <label
      className={cn(
        // relative: keeps the visually hidden radio inside this row, so it scrolls with the list.
        'relative flex gap-3 rounded-[1rem] ring-1 ring-brand-100 ring-inset transition-[background-color,box-shadow]',
        card ? 'h-full items-center bg-white p-3 shadow-lg shadow-brand-950/15' : 'items-start p-4',
        option.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-brand-50/60',
        'has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-600',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600',
      )}
    >
      <input
        type="radio"
        name={group}
        value={option.id}
        checked={selected}
        disabled={option.disabled}
        onChange={() => onSelect(option.id)}
        className="sr-only"
      />
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full transition-colors',
          selected ? 'bg-brand-600 text-snow' : 'bg-brand-50 text-brand-600',
        )}
      >
        {selected ? <Check className="size-5" strokeWidth={3} aria-hidden /> : <MapPin className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-brand-900">{option.name}</span>
          {option.badges.map((badge) => (
            <span key={badge.label} className={cn('rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold', BADGE_TONE[badge.tone])}>
              {badge.label}
            </span>
          ))}
        </span>
        {(option.distance || option.extra) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {option.distance && (
              <span className="flex items-center gap-1 font-semibold text-brand-700">
                <Navigation className="size-3.5" aria-hidden />
                {option.distance}
              </span>
            )}
            {option.extra && <span>{option.extra}</span>}
          </span>
        )}
      </span>
    </label>
  );
}


/** The branch list under the map, after the place is confirmed. */
function BranchList({
  options,
  selectedId,
  onSelect,
}: {
  options: BranchOptionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // A branch picked on the map is brought into view in the list.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-branch="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);
  return (
    <ul
      ref={listRef}
      aria-label="Nearest branches"
      className="-mx-1 mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => (
        <li key={option.id} data-branch={option.id}>
          <BranchOption option={option} group="branch" selected={option.id === selectedId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function NearestBranches({
  options,
  selectedId,
  onSelect,
  pending,
  empty,
  fill = false,
}: {
  options: BranchOptionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  pending?: boolean;
  empty?: ReactNode;
  fill?: boolean;
}) {
  return (
    <section
      aria-label="Nearest branches"
      className={cn('flex flex-col', fill ? 'min-h-0 flex-1' : 'h-[clamp(8.5rem,38%,17rem)] shrink-0')}
    >
      <p className="shrink-0 text-xs font-semibold tracking-[0.16em] text-brand-600 uppercase">Nearest branches</p>
      {options.length > 0 ? (
        <BranchList options={options} selectedId={selectedId} onSelect={onSelect} />
      ) : pending ? (
        <StatusLine icon={Loader2} spin>
          Finding the nearest branches…
        </StatusLine>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">{empty}</div>
      )}
    </section>
  );
}

function SavedStep({
  mode,
  storeName,
  address,
  openTime,
  closeTime,
  closed,
  onContinue,
  onChange,
  children,
}: {
  mode: OrderMode;
  storeName: string;
  address?: string;
  openTime: string;
  closeTime: string;
  /** The branch has stopped taking online orders for now: continuing is off until another is chosen. */
  closed: boolean;
  onContinue: () => void;
  onChange: () => void;
  children?: ReactNode;
}) {
  const ModeIcon = mode === 'TAKEAWAY' ? Store : Bike;
  // One row per detail, each with its icon in the same column, so the lines align (left from sm, centred on phones).
  const row = 'flex items-start gap-2 max-sm:justify-center';
  const rowIcon = 'mt-0.5 size-4 shrink-0 text-brand-600';
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 sm:px-8 sm:pb-8 short:pb-4">
      <div className="flex flex-col items-center gap-5 rounded-[1.5rem] bg-brand-50/70 p-6 ring-1 ring-brand-100 ring-inset sm:flex-row sm:gap-8 sm:p-8 short:py-4">
        <Image src={MASCOT_IMAGES.welcome} alt="" width={500} height={500} sizes="144px" unoptimized className="size-28 shrink-0 object-contain sm:size-36 short:size-24" />
        <div className="min-w-0 flex-1 max-sm:text-center">
          <p className="text-sm font-semibold tracking-[0.12em] text-brand-600 uppercase">Your last order</p>
          <ul className="mt-3 flex flex-col gap-2 text-slate-700">
            <li className={row}>
              <ModeIcon className={rowIcon} aria-hidden />
              {mode === 'TAKEAWAY' ? (
                <span>Pickup</span>
              ) : (
                <span>
                  Delivery to <strong className="font-semibold text-brand-900">{address ? shortOrderAddress(address) : 'your address'}</strong>
                </span>
              )}
            </li>
            <li className={row}>
              <MapPin className={rowIcon} aria-hidden />
              <strong className="font-semibold text-brand-900">{storeName}</strong>
            </li>
            <li className={cn(row, 'text-sm', closed ? 'font-semibold text-red-700' : 'text-slate-500')}>
              <Clock className={cn(rowIcon, closed ? 'text-red-600' : 'text-slate-400')} aria-hidden />
              {closed ? 'Closed for online orders right now' : `Open ${formatOrderFlowHour(openTime)} – ${formatOrderFlowHour(closeTime)}`}
            </li>
          </ul>
        </div>
      </div>
      {/* Equal halves from sm; stacked on phones with the main action first. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 short:mt-3">
        <button type="button" onClick={onChange} className={cn(orderFlowSecondaryButton, 'w-full max-sm:order-last')}>
          Choose a different branch
        </button>
        <button type="button" onClick={onContinue} disabled={closed} className={cn(orderFlowPrimaryButton, 'w-full')}>
          Continue to Menu
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * Shown instead of switching when the chosen branch can't supply some items in the cup: which ones, with the
 * choice to remove them and switch, or go back and keep them.
 */
function ConflictStep({ pending, onBack, onSwitch }: { pending: PendingSwitch; onBack: () => void; onSwitch: () => void }) {
  const count = pending.lines.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 sm:px-8 sm:pb-8 short:pb-4">
      <div className="flex flex-col items-center gap-4 rounded-[1.5rem] bg-brand-50/70 p-5 ring-1 ring-brand-100 ring-inset sm:flex-row sm:items-start sm:gap-6 sm:p-6 short:py-4">
        <Image src={MASCOT_IMAGES.thinkingLoading} alt="" width={500} height={500} sizes="112px" unoptimized className="size-24 shrink-0 object-contain sm:size-28 short:size-20" />
        <div className="min-w-0 flex-1">
          <p className="text-slate-700 max-sm:text-center">
            <strong className="font-semibold text-brand-900">{pending.storeName}</strong> doesn&apos;t have{' '}
            {count === 1 ? 'this item' : `these ${count} items`} from your cup right now. Switching will remove{' '}
            {count === 1 ? 'it' : 'them'}.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {pending.lines.map((line) => {
              const src = resolveProductImageUrl(line.product.imageUrl);
              return (
                <li key={line.id} className="flex items-center gap-3 rounded-[1rem] bg-white p-2 pr-3 ring-1 ring-brand-100 ring-inset">
                  <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[0.75rem] bg-brand-50">
                    {src ? (
                      <Image src={src} alt="" fill unoptimized sizes="44px" className="object-contain p-1" />
                    ) : (
                      <span aria-hidden className="text-xl">🧋</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-brand-950">{line.product.name}</span>
                    {line.size === 'LARGE' && <span className="text-xs text-slate-500">Large</span>}
                  </span>
                  <span className="font-numeric shrink-0 text-sm font-semibold text-slate-500">× {line.quantity}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* Equal halves from sm; stacked on phones with the main action first. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 short:mt-3">
        <button type="button" onClick={onBack} className={cn(orderFlowSecondaryButton, 'w-full max-sm:order-last')}>
          <ArrowLeft className="size-4" aria-hidden />
          Keep my items
        </button>
        <button type="button" onClick={onSwitch} className={cn(orderFlowPrimaryButton, 'w-full')}>
          <Trash2 className="size-4" aria-hidden />
          Remove &amp; switch
        </button>
      </div>
    </div>
  );
}
