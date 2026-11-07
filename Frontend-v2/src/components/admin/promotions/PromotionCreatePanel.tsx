'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import type { PromotionOwnership, BranchShareSplit, ContributionSource } from '@/lib/promotionCriteria';
import { validateSharedPromotionShares, validateSelectedBranchShareSplits, seedBranchShareSplits, defaultBranchShareSplit, syncCriteriaWithPrimary } from '@/lib/promotionCriteria';
import type { PromotionCardDesignSet } from '@/lib/promotionCardDesign';
import { defaultCardDesignSet, syncCardDesignSetFromPromotion, normalizeCardDesignSet } from '@/lib/promotionCardDesign';
import type { PromotionKind, PromotionRules, PromotionUsageLimits } from '@/lib/promotionTypes';
import { defaultRulesForKind, getPromotionTypeOption, kindUsesDiscountValue, promotionKindRequiresCode } from '@/lib/promotionTypes';
import PromotionCriteriaSelector from '@/components/admin/promotions/PromotionCriteriaSelector';
import PromotionBranchSelector from '@/components/admin/promotions/PromotionBranchSelector';
import PromotionCardDesigner from '@/components/admin/promotions/PromotionCardDesigner';
import PromotionTypeSelector, { PromotionRulesForm } from '@/components/admin/promotions/PromotionTypeSelector';
import PromotionBannerSetup from '@/components/admin/promotions/PromotionBannerSetup';
import PromotionUsageLimitsForm from '@/components/admin/promotions/PromotionUsageLimitsForm';
import PromotionCardDesignModePicker, {
  cardDesignModeFromKind,
  type CardDesignMode,
} from '@/components/admin/promotions/PromotionCardDesignModePicker';
import { hasPromotionSetupBasics, mergePromotionFormInitial } from '@/lib/promotionFormUtils';

export interface PromotionFormState {
  code: string;
  title: string;
  description: string;
  promotionKind: PromotionKind | '';
  promotionRules: PromotionRules;
  usageLimits: PromotionUsageLimits;
  /** Legacy fields kept for checkout API compatibility */
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: string;
  minOrderValue: string;
  maxUses: string;
  activateImmediately: boolean;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  criteria: string[];
  ownership: PromotionOwnership | '';
  contributionSource: ContributionSource;
  branchSharePct: number | '';
  platformSharePct: number | '';
  branchShareSplits: Record<string, BranchShareSplit>;
  branchScope: 'all' | 'selected';
  storeIds: string[];
  cardDesign: PromotionCardDesignSet;
  showOnHome: boolean;
}

const STEPS = [
  { id: 'setup', label: 'Type & Rules' },
  { id: 'criteria', label: 'Targeting' },
  { id: 'design', label: 'Card Design' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export function emptyPromotionForm(): PromotionFormState {
  return {
    code: '',
    title: '',
    description: '',
    promotionKind: '',
    promotionRules: {},
    usageLimits: {},
    discountType: 'PERCENTAGE',
    discountValue: '',
    minOrderValue: '0',
    maxUses: '',
    activateImmediately: true,
    startsAt: '',
    expiresAt: '',
    isActive: true,
    criteria: [],
    ownership: '',
    contributionSource: 'JASON',
    branchSharePct: '',
    platformSharePct: '',
    branchShareSplits: {},
    branchScope: 'all',
    storeIds: [],
    cardDesign: defaultCardDesignSet(),
    showOnHome: true,
  };
}

interface PromotionCreatePanelProps {
  initial?: Partial<PromotionFormState>;
  editKey?: string | null;
  usedCount?: number;
  onSubmit: (data: PromotionFormState) => void;
  onCancel: () => void;
  isPending?: boolean;
  mode?: 'create' | 'edit';
  /** Branch admins: ownership locked to BRANCH. */
  branchMode?: boolean;
  layout?: 'page' | 'modal';
}

export default function PromotionCreatePanel({
  initial,
  editKey = null,
  usedCount = 0,
  onSubmit,
  onCancel,
  isPending = false,
  mode = 'create',
  branchMode = false,
  layout = 'page',
}: PromotionCreatePanelProps) {
  const [step, setStep] = useState<StepId>('setup');
  const lastStandardKind = useRef<PromotionKind>('PERCENTAGE_DISCOUNT');
  const [form, setForm] = useState<PromotionFormState>(() => mergePromotionFormInitial(initial, branchMode));

  const [portalReady, setPortalReady] = useState(false);
  const isModal = layout === 'modal';

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!isModal || !portalReady) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [isModal, portalReady, onCancel]);

  useEffect(() => {
    if (mode !== 'edit' || !editKey || !initial) return;
    setForm(mergePromotionFormInitial(initial, branchMode));
    setStep('setup');
    const kind = initial.promotionKind;
    if (kind && kind !== 'UPLOAD_BANNER' && kind !== 'CUSTOM') {
      lastStandardKind.current = kind as PromotionKind;
    }
  }, [mode, editKey, initial, branchMode]);

  useEffect(() => {
    const kind = initial?.promotionKind;
    if (kind && kind !== 'UPLOAD_BANNER' && kind !== 'CUSTOM') {
      lastStandardKind.current = kind as PromotionKind;
    }
  }, [initial?.promotionKind]);

  useEffect(() => {
    if (step !== 'criteria' || !form.promotionKind) return;
    const primary = getPromotionTypeOption(form.promotionKind as PromotionKind)?.criteriaKey;
    if (!primary) return;
    setForm((f) => {
      const synced = syncCriteriaWithPrimary(primary, f.criteria);
      if (synced.length === f.criteria.length && synced.every((k, i) => k === f.criteria[i])) return f;
      return { ...f, criteria: synced };
    });
  }, [step, form.promotionKind]);

  function cardSourceFromForm(f: PromotionFormState) {
    return {
      code: f.code,
      title: f.title,
      description: f.description,
      promotionKind: f.promotionKind,
      promotionRules: f.promotionRules,
    };
  }

  function syncCardFromSetup(f: PromotionFormState): PromotionFormState {
    return {
      ...f,
      cardDesign: syncCardDesignSetFromPromotion(f.cardDesign, cardSourceFromForm(f)),
    };
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function nextStep() {
    if (stepIndex >= STEPS.length - 1) return;
    if (step === 'criteria') {
      const criteriaErr = validateCriteriaStep();
      if (criteriaErr) {
        toast.error(criteriaErr);
        return;
      }
    }
    const next = STEPS[stepIndex + 1].id;
    if (next === 'design') {
      setForm((f) => syncCardFromSetup(f));
    }
    setStep(next);
  }

  function prevStep() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id);
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || step === 'design') return;
    const el = e.target as HTMLElement;
    if (el.tagName === 'TEXTAREA') return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      e.preventDefault();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 'design') {
      nextStep();
      return;
    }
    const criteriaErr = validateCriteriaStep();
    if (criteriaErr) {
      toast.error(criteriaErr);
      setStep('criteria');
      return;
    }
    onSubmit(syncCardFromSetup(form));
  }

  function handleKindChange(kind: PromotionKind, criteriaKey: string) {
    if (kind !== 'UPLOAD_BANNER' && kind !== 'CUSTOM') {
      lastStandardKind.current = kind;
    }
    const rules = defaultRulesForKind(kind);
    const isCustomerOffer = kind === 'WELCOME' || kind === 'REFERRAL';
    setForm((f) => ({
      ...f,
      promotionKind: kind,
      promotionRules: rules,
      criteria: syncCriteriaWithPrimary(criteriaKey, f.criteria),
      discountType: kind === 'FIXED_DISCOUNT' || rules.referralDiscountMode === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
      discountValue:
        kind === 'PERCENTAGE_DISCOUNT' || (isCustomerOffer && rules.referralDiscountMode !== 'FIXED')
          ? String(rules.discountPercent ?? '')
          : kind === 'FIXED_DISCOUNT' || (isCustomerOffer && rules.referralDiscountMode === 'FIXED')
            ? String(rules.discountAmount ?? '')
            : f.discountValue,
      minOrderValue: rules.minSpend != null ? String(rules.minSpend) : f.minOrderValue,
      usageLimits: isCustomerOffer
        ? { ...f.usageLimits, maxPerCustomer: f.usageLimits.maxPerCustomer ?? 1 }
        : f.usageLimits,
    }));
  }

  function handleDesignModeChange(mode: CardDesignMode) {
    setForm((f) => {
      if (mode === 'banner') {
        return {
          ...f,
          promotionKind: 'UPLOAD_BANNER',
          promotionRules: f.promotionKind === 'UPLOAD_BANNER'
            ? f.promotionRules
            : defaultRulesForKind('UPLOAD_BANNER'),
          criteria: syncCriteriaWithPrimary('display::Upload Banner', f.criteria),
        };
      }
      const kind = f.promotionKind === 'UPLOAD_BANNER'
        ? lastStandardKind.current
        : f.promotionKind;
      return {
        ...f,
        promotionKind: kind || lastStandardKind.current,
      };
    });
  }

  function needsPromoCode() {
    return promotionKindRequiresCode(form.promotionKind);
  }

  function validateCriteriaStep(): string | null {
    if (!branchMode && !form.ownership) {
      return 'Select promotion ownership (Branch, Shared, or Platform)';
    }
    const perBranchErr = validateSelectedBranchShareSplits(
      form.ownership,
      form.branchScope,
      form.storeIds,
      form.branchShareSplits,
    );
    if (perBranchErr) return perBranchErr;
    if (form.branchScope !== 'selected') {
      const shareErr = validateSharedPromotionShares(form.ownership, form.branchSharePct, form.platformSharePct);
      if (shareErr) return shareErr;
    }
    if (form.branchScope === 'selected' && form.storeIds.length === 0) {
      return 'Select at least one branch, or switch to All branches';
    }
    return null;
  }

  function isPromotionFormValid() {
    if (!hasPromotionSetupBasics(form, needsPromoCode())) return false;
    if (kindUsesDiscountValue(form.promotionKind as PromotionKind)) {
      const rules = form.promotionRules;
      if (form.promotionKind === 'PERCENTAGE_DISCOUNT') return (rules.discountPercent ?? 0) > 0;
      if (form.promotionKind === 'FIXED_DISCOUNT') return (rules.discountAmount ?? 0) > 0;
      if (form.promotionKind === 'WELCOME' || form.promotionKind === 'REFERRAL') {
        const mode = rules.referralDiscountMode
          ?? (rules.discountAmount && !rules.discountPercent ? 'FIXED' : 'PERCENTAGE');
        return mode === 'FIXED' ? (rules.discountAmount ?? 0) > 0 : (rules.discountPercent ?? 0) > 0;
      }
    }
    if (form.promotionKind === 'BOGO' || form.promotionKind === 'BXGY') {
      return (form.promotionRules.buyQty ?? 0) > 0
        && (form.promotionRules.getQty ?? 0) > 0
        && (form.promotionRules.selectedProducts?.length ?? 0) === 1;
    }
    if (form.promotionKind === 'GIFT_ITEM') {
      return Boolean(form.promotionRules.giftProduct?.id ?? form.promotionRules.giftProductId);
    }
    if (form.promotionKind === 'COMBO_OFFER') {
      return (form.promotionRules.comboProducts?.length ?? 0) >= 2;
    }
    if (form.promotionKind === 'NEW_PRODUCT') {
      return (form.promotionRules.selectedProducts?.length ?? 0) > 0;
    }
    if (form.promotionKind === 'CATEGORY_OFF') {
      return Boolean(form.promotionRules.categoryName);
    }
    if (form.promotionKind === 'UPLOAD_BANNER') {
      return Boolean(form.promotionRules.bannerImageUrl?.trim()) && Boolean(form.title.trim());
    }
    if (form.promotionKind === 'CUSTOM') {
      return Boolean(form.promotionRules.customBenefit?.trim());
    }
    if (validateCriteriaStep()) return false;
    return true;
  }

  function canProceedFromSetup() {
    if (!hasPromotionSetupBasics(form, needsPromoCode())) return false;
    if (form.promotionKind === 'UPLOAD_BANNER' || form.promotionKind === 'CUSTOM') return true;
    if (kindUsesDiscountValue(form.promotionKind as PromotionKind)) {
      const rules = form.promotionRules;
      if (form.promotionKind === 'PERCENTAGE_DISCOUNT') return (rules.discountPercent ?? 0) > 0;
      if (form.promotionKind === 'FIXED_DISCOUNT') return (rules.discountAmount ?? 0) > 0;
      if (form.promotionKind === 'WELCOME' || form.promotionKind === 'REFERRAL') {
        const mode = rules.referralDiscountMode
          ?? (rules.discountAmount && !rules.discountPercent ? 'FIXED' : 'PERCENTAGE');
        return mode === 'FIXED' ? (rules.discountAmount ?? 0) > 0 : (rules.discountPercent ?? 0) > 0;
      }
    }
    if (form.promotionKind === 'BOGO' || form.promotionKind === 'BXGY') {
      return (form.promotionRules.buyQty ?? 0) > 0
        && (form.promotionRules.getQty ?? 0) > 0
        && (form.promotionRules.selectedProducts?.length ?? 0) === 1;
    }
    if (form.promotionKind === 'GIFT_ITEM') {
      return Boolean(form.promotionRules.giftProduct?.id ?? form.promotionRules.giftProductId);
    }
    if (form.promotionKind === 'COMBO_OFFER') {
      return (form.promotionRules.comboProducts?.length ?? 0) >= 2;
    }
    if (form.promotionKind === 'NEW_PRODUCT') {
      return (form.promotionRules.selectedProducts?.length ?? 0) > 0;
    }
    if (form.promotionKind === 'CATEGORY_OFF') {
      return Boolean(form.promotionRules.categoryName);
    }
    return true;
  }

  const designMode = cardDesignModeFromKind(form.promotionKind);

  const panel = (
      <div
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal || undefined}
        aria-labelledby="promo-create-title"
        className={`promo-create-panel${isModal ? ' promo-create-modal' : ' promo-create-panel--page'}`}
      >
      <div className="promo-create-panel__header">
        <div className="promo-create-panel__header-text">
          <h3 id="promo-create-title" className="text-xl font-semibold text-fg">
            {mode === 'edit' ? 'Edit Promotion' : 'Create Promotion'}
          </h3>
          {mode === 'edit' && (
            <p className="text-base text-white font-medium truncate">
              {form.title.trim() || form.code.trim() || 'Untitled promotion'}
            </p>
          )}
        </div>
        <div className="promo-create-panel__steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`promo-create-panel__step${step === s.id ? ' promo-create-panel__step--active' : ''}${i < stepIndex ? ' promo-create-panel__step--done' : ''}`}
              onClick={() => {
                if (s.id === 'design') setForm((f) => syncCardFromSetup(f));
                setStep(s.id);
              }}
            >
              <span className="promo-create-panel__step-num">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="promo-create-panel__close"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <form className="promo-create-panel__form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <div className="promo-create-panel__body">
          <div className="promo-create-panel__body-inner">
            <AnimatePresence mode="wait">
          {step === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="promo-setup">
              <PromotionTypeSelector
                kind={form.promotionKind}
                onChange={handleKindChange}
                onClear={() => setForm((f) => ({ ...f, promotionKind: '', promotionRules: {} }))}
              />

              <div className="promo-setup-grid">
                <div className="promo-setup-card">
                  <h4 className="promo-schedule__title">Offer details</h4>
                  <label className="promo-create-panel__field">
                    Display Title
                    <input
                      className="input-field"
                      placeholder="Buy 1 Get 1 — Milk Tea"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>
                  {form.promotionKind !== 'UPLOAD_BANNER' && (
                    <label className="promo-create-panel__field">
                      Description
                      <input
                        className="input-field"
                        placeholder="Short description shown to customers"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </label>
                  )}
                  <label className="promo-create-panel__field">
                    {form.promotionKind
                      ? (needsPromoCode() ? 'Promo Code *' : 'Promo Code (optional)')
                      : 'Promo Code'}
                    <input
                      className="input-field uppercase font-mono"
                      placeholder={
                        !form.promotionKind
                          ? 'Select a type first'
                          : needsPromoCode()
                            ? 'BOGO2026'
                            : 'Optional'
                      }
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      disabled={!form.promotionKind}
                      required={Boolean(form.promotionKind) && needsPromoCode()}
                    />
                  </label>
                </div>

                <div className="promo-setup-card">
                  <h4 className="promo-schedule__title">Schedule &amp; visibility</h4>

                  <label className="promo-schedule__option">
                    <input
                      type="checkbox"
                      className="promo-schedule__checkbox"
                      checked={form.activateImmediately}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        activateImmediately: e.target.checked,
                        startsAt: e.target.checked ? '' : f.startsAt,
                      }))}
                    />
                    <span className="promo-schedule__option-body">
                      <span className="promo-schedule__option-label">Activate immediately</span>
                    </span>
                  </label>

                  <div className={`promo-schedule__dates${form.activateImmediately ? ' promo-schedule__dates--single' : ''}`}>
                    {!form.activateImmediately && (
                      <label className="promo-create-panel__field">
                        Start date *
                        <input
                          className="input-field"
                          type="datetime-local"
                          value={form.startsAt}
                          onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                          required={!form.activateImmediately}
                        />
                      </label>
                    )}
                    <label className="promo-create-panel__field">
                      End date *
                      <input
                        className="input-field"
                        type="datetime-local"
                        value={form.expiresAt}
                        onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                        required
                      />
                    </label>
                  </div>

                  <label className="promo-schedule__option promo-schedule__option--last">
                    <input
                      type="checkbox"
                      className="promo-schedule__checkbox"
                      checked={form.showOnHome}
                      onChange={(e) => setForm((f) => ({ ...f, showOnHome: e.target.checked }))}
                    />
                    <span className="promo-schedule__option-body">
                      <span className="promo-schedule__option-label">Show on home page</span>
                    </span>
                  </label>
                </div>
              </div>

              {form.promotionKind && form.promotionKind !== 'UPLOAD_BANNER' && form.promotionKind !== 'CUSTOM' && (
                <PromotionRulesForm
                  kind={form.promotionKind}
                  rules={form.promotionRules}
                  onChange={(promotionRules) => setForm((f) => ({ ...f, promotionRules }))}
                  promoTitle={form.title}
                  promoDescription={form.description}
                  promoCode={form.code || 'PROMO'}
                />
              )}

              <PromotionUsageLimitsForm
                limits={form.usageLimits}
                usedCount={usedCount}
                onChange={(usageLimits) => setForm((f) => ({ ...f, usageLimits }))}
              />
            </motion.div>
          )}

          {step === 'criteria' && (
            <motion.div key="criteria" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 1, x: 0 }}>
              <div className="promo-create-panel__criteria-content">
              <PromotionCriteriaSelector
                selected={form.criteria}
                primaryCriteriaKey={
                  form.promotionKind
                    ? getPromotionTypeOption(form.promotionKind as PromotionKind)?.criteriaKey
                    : undefined
                }
                ownership={form.ownership}
                branchScope={form.branchScope}
                contributionSource={form.contributionSource}
                branchSharePct={form.branchSharePct}
                platformSharePct={form.platformSharePct}
                lockOwnership={branchMode ? 'BRANCH' : undefined}
                onCriteriaChange={(criteria) => setForm((f) => ({ ...f, criteria }))}
                onOwnershipChange={(ownership) =>
                  setForm((f) => ({
                    ...f,
                    ownership,
                    contributionSource: ownership === 'SHARED' ? f.contributionSource : 'JASON',
                  }))
                }
                onContributionSourceChange={(contributionSource) =>
                  setForm((f) => ({ ...f, contributionSource }))
                }
                onShareChange={(branchSharePct, platformSharePct) =>
                  setForm((f) => ({ ...f, branchSharePct, platformSharePct }))
                }
              >
                <PromotionBranchSelector
                  branchScope={form.branchScope}
                  storeIds={form.storeIds}
                  promotionRules={form.promotionRules}
                  ownership={form.ownership}
                  contributionSource={form.contributionSource}
                  branchShareSplits={form.branchShareSplits}
                  promotionTitle={form.title}
                  promotionCode={form.code}
                  fallbackSplit={defaultBranchShareSplit(form.branchSharePct, form.platformSharePct)}
                  onScopeChange={(branchScope) => setForm((f) => ({
                    ...f,
                    branchScope,
                    storeIds: branchScope === 'all' ? [] : f.storeIds,
                  }))}
                  onChange={(storeIds) => setForm((f) => ({
                    ...f,
                    storeIds,
                    branchShareSplits: seedBranchShareSplits(
                      storeIds,
                      f.branchShareSplits,
                      defaultBranchShareSplit(f.branchSharePct, f.platformSharePct),
                    ),
                  }))}
                  onSplitChange={(storeId, split) => setForm((f) => ({
                    ...f,
                    branchShareSplits: { ...f.branchShareSplits, [storeId]: split },
                  }))}
                  onSplitStoresChange={(ids) => setForm((f) => {
                    if (f.ownership !== 'SHARED') return f;
                    const next = seedBranchShareSplits(
                      ids,
                      f.branchShareSplits,
                      defaultBranchShareSplit(f.branchSharePct, f.platformSharePct),
                    );
                    const sameKeys =
                      Object.keys(next).length === Object.keys(f.branchShareSplits).length
                      && ids.every((id) => f.branchShareSplits[id]);
                    if (sameKeys) return f;
                    return { ...f, branchShareSplits: next };
                  })}
                />
              </PromotionCriteriaSelector>
              </div>
            </motion.div>
          )}

          {step === 'design' && (
            <motion.div key="design" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <PromotionCardDesignModePicker mode={designMode} onChange={handleDesignModeChange} />

              {designMode === 'banner' && (
                <PromotionBannerSetup
                  className="mt-4"
                  rules={form.promotionRules}
                  onChange={(promotionRules) => setForm((f) => ({ ...f, promotionRules }))}
                  promoTitle={form.title}
                  promoCode={form.code || 'PROMO'}
                />
              )}

              {designMode === 'standard' && (
                <div className="mt-4">
                  <PromotionCardDesigner
                    designSet={form.cardDesign}
                    promoCode={form.code || 'PROMO'}
                    promotionSource={cardSourceFromForm(form)}
                    onChange={(cardDesign) =>
                      setForm((f) => ({
                        ...f,
                        cardDesign: typeof cardDesign === 'function' ? cardDesign(f.cardDesign) : cardDesign,
                      }))
                    }
                    onSyncFromSetup={() => setForm((f) => syncCardFromSetup(f))}
                  />
                </div>
              )}
            </motion.div>
          )}
            </AnimatePresence>
          </div>
        </div>

        <div className="promo-create-panel__footer">
          <div className="promo-create-panel__footer-actions">
            {stepIndex > 0 && (
              <button type="button" className="btn-outline px-4 py-2.5 text-sm" onClick={prevStep}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button type="button" className="btn-outline px-4 py-2.5 text-sm" onClick={onCancel}>
              Cancel
            </button>
            {stepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                className="btn-primary px-4 py-2.5 text-sm"
                onClick={(e) => {
                  e.preventDefault();
                  nextStep();
                }}
                disabled={step === 'setup' && !canProceedFromSetup()}
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button type="submit" disabled={isPending || !isPromotionFormValid()} className="btn-primary px-6 py-2.5 text-sm">
                <Save size={16} />
                {isPending ? 'Saving...' : mode === 'edit' ? 'Update Promotion' : 'Create Promotion'}
              </button>
            )}
          </div>
        </div>
      </form>
      </div>
  );

  if (!isModal) return panel;
  if (!portalReady) return null;

  return createPortal(
    <>
      <motion.div
        key="promo-create-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="promo-create-modal-backdrop"
        aria-hidden
      />
      <motion.div
        key="promo-create-dialog"
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="promo-create-modal-motion"
      >
        {panel}
      </motion.div>
    </>,
    document.body,
  );
}
