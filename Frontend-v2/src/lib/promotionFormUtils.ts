import type { PromotionOwnership, ContributionSource } from '@/lib/promotionCriteria';
import { defaultBranchShareSplit, parseBranchShareSplits, seedBranchShareSplits } from '@/lib/promotionCriteria';
import type { PromotionCardDesignSet } from '@/lib/promotionCardDesign';
import { normalizeCardDesignSet } from '@/lib/promotionCardDesign';
import type { PromotionKind, PromotionRules, PromotionUsageLimits } from '@/lib/promotionTypes';
import { getPromotionTypeOption, resolvePromoCodeForSave } from '@/lib/promotionTypes';
import type { PromotionFormState } from '@/components/admin/promotions/PromotionCreatePanel';
import { emptyPromotionForm } from '@/components/admin/promotions/PromotionCreatePanel';

export function isPromotionEndDateValid(expiresAt: string): boolean {
  return expiresAt.trim().length > 0;
}

export function hasPromotionSetupBasics(
  form: Pick<PromotionFormState, 'promotionKind' | 'code' | 'activateImmediately' | 'startsAt' | 'expiresAt'>,
  needsCode: boolean,
): boolean {
  if (!form.promotionKind) return false;
  if (needsCode && form.code.trim().length < 3) return false;
  if (!form.activateImmediately && !form.startsAt.trim()) return false;
  return isPromotionEndDateValid(form.expiresAt);
}

export interface PromoFormSource {
  code: string;
  title?: string | null;
  description?: string | null;
  promotionKind?: string | null;
  promotionRules?: unknown;
  usageLimits?: unknown;
  discountType: string;
  discountValue: number;
  minOrderValue: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  criteria?: unknown;
  ownership?: string | null;
  contributionSource?: string | null;
  branchSharePct?: number | null;
  platformSharePct?: number | null;
  branchShareSplits?: unknown;
  cardDesign?: unknown;
  storeIds?: unknown;
  showOnHome?: boolean | null;
}

export interface AdminPromoRow extends PromoFormSource {
  id: string;
  usedCount: number;
  sortOrder?: number;
  createdAt?: string;
}

export function parsePromoJsonField<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as T;
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

function parsePromoRules(raw: unknown): PromotionRules {
  const parsed = parsePromoJsonField<unknown>(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as PromotionRules;
}

export function parsePromoStringArray(raw: unknown): string[] {
  const parsed = parsePromoJsonField<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
}

export function parsePromoUsageLimits(raw: unknown, maxUses?: number | null): PromotionUsageLimits {
  const parsed = parsePromoJsonField<unknown>(raw, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as PromotionUsageLimits;
  }
  return maxUses != null ? { maxTotal: maxUses } : {};
}

function normalizePromotionKind(raw: string | null | undefined): PromotionKind | '' {
  const upper = (raw ?? '').trim().toUpperCase();
  if (!upper) return '';
  if (getPromotionTypeOption(upper as PromotionKind)) return upper as PromotionKind;
  return upper as PromotionKind;
}

function toDatetimeLocalValue(raw?: string | null): string {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw.length >= 16 ? raw.slice(0, 16) : '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function coerceSharePct(raw: unknown): number | '' {
  if (raw == null || raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : '';
}

function normalizeOwnership(raw: unknown): PromotionOwnership | '' {
  const upper = String(raw ?? '').trim().toUpperCase();
  if (upper === 'BRANCH' || upper === 'SHARED' || upper === 'PLATFORM') return upper;
  return '';
}

function inferLegacyKindAndRules(promo: PromoFormSource): {
  promotionKind: PromotionKind | '';
  promotionRules: PromotionRules;
} {
  const discountType = (promo.discountType ?? '').toUpperCase();
  const minSpend = promo.minOrderValue ?? 0;
  if (discountType === 'PERCENTAGE') {
    return {
      promotionKind: 'PERCENTAGE_DISCOUNT',
      promotionRules: {
        discountPercent: promo.discountValue,
        minSpend,
      },
    };
  }
  if (discountType === 'FIXED') {
    return {
      promotionKind: 'FIXED_DISCOUNT',
      promotionRules: {
        discountAmount: promo.discountValue,
        minSpend,
      },
    };
  }
  return { promotionKind: '', promotionRules: {} };
}

export function buildPromotionFormStateFromPromo(promo: PromoFormSource): PromotionFormState {
  const storeIds = parsePromoStringArray(promo.storeIds);
  const savedSplits = parseBranchShareSplits(parsePromoJsonField(promo.branchShareSplits, promo.branchShareSplits));
  const branchScope: 'all' | 'selected' = storeIds.length > 0 ? 'selected' : 'all';
  const branchSharePct = coerceSharePct(promo.branchSharePct);
  const platformSharePct = coerceSharePct(promo.platformSharePct);
  const fallback = defaultBranchShareSplit(branchSharePct, platformSharePct);
  let promotionKind = normalizePromotionKind(promo.promotionKind);
  let promotionRules = parsePromoRules(promo.promotionRules);

  if (!promotionKind) {
    const legacy = inferLegacyKindAndRules(promo);
    promotionKind = legacy.promotionKind;
    if (Object.keys(promotionRules).length === 0) {
      promotionRules = legacy.promotionRules;
    }
  }

  return {
    code: promo.code,
    title: promo.title ?? '',
    description: promo.description ?? '',
    promotionKind,
    promotionRules,
    usageLimits: parsePromoUsageLimits(promo.usageLimits, promo.maxUses),
    discountType: promo.discountType as 'PERCENTAGE' | 'FIXED',
    discountValue: String(promo.discountValue),
    minOrderValue: String(promo.minOrderValue),
    maxUses: promo.maxUses ? String(promo.maxUses) : '',
    activateImmediately: !promo.startsAt,
    startsAt: toDatetimeLocalValue(promo.startsAt),
    expiresAt: toDatetimeLocalValue(promo.expiresAt),
    isActive: promo.isActive,
    criteria: parsePromoStringArray(promo.criteria),
    ownership: normalizeOwnership(promo.ownership),
    contributionSource:
      (promo.contributionSource === 'PLATFORM' ? 'PLATFORM' : 'JASON') as ContributionSource,
    branchSharePct,
    platformSharePct,
    // Selected: seed only chosen branches. All-branches: keep saved per-branch splits as-is.
    branchShareSplits:
      branchScope === 'selected'
        ? seedBranchShareSplits(storeIds, savedSplits, fallback)
        : savedSplits,
    branchScope,
    storeIds,
    cardDesign: normalizeCardDesignSet(
      (() => {
        const raw = parsePromoJsonField<unknown>(promo.cardDesign, null);
        if (!raw || typeof raw !== 'object') return undefined;
        return raw as PromotionCardDesignSet;
      })(),
      promo.code,
    ),
    showOnHome: promo.showOnHome !== false,
  };
}

function deriveDiscountFields(form: PromotionFormState) {
  const kind = form.promotionKind as PromotionKind;
  let discountType: 'PERCENTAGE' | 'FIXED' = 'PERCENTAGE';
  let discountValue = 1;
  let minOrderValue = parseInt(form.minOrderValue, 10) || 0;

  if (kind === 'PERCENTAGE_DISCOUNT') {
    discountType = 'PERCENTAGE';
    discountValue = form.promotionRules.discountPercent ?? 1;
  } else if (kind === 'FIXED_DISCOUNT') {
    discountType = 'FIXED';
    discountValue = form.promotionRules.discountAmount ?? 1;
  } else if (kind === 'WELCOME' || kind === 'REFERRAL') {
    const mode = form.promotionRules.referralDiscountMode
      ?? (form.promotionRules.discountAmount && !form.promotionRules.discountPercent ? 'FIXED' : 'PERCENTAGE');
    if (mode === 'FIXED') {
      discountType = 'FIXED';
      discountValue = form.promotionRules.discountAmount ?? 1;
    } else {
      discountType = 'PERCENTAGE';
      discountValue = form.promotionRules.discountPercent ?? 1;
    }
  } else if (kind === 'UPLOAD_BANNER') {
    discountType = 'FIXED';
    discountValue = form.promotionRules.displayPrice ?? 1;
  } else if (form.promotionRules.discountPercent) {
    discountType = 'PERCENTAGE';
    discountValue = form.promotionRules.discountPercent;
  } else if (form.promotionRules.discountAmount) {
    discountType = 'FIXED';
    discountValue = form.promotionRules.discountAmount;
  } else {
    discountType = 'FIXED';
    discountValue = 1;
  }

  if (form.promotionRules.minSpend != null) {
    minOrderValue = form.promotionRules.minSpend;
  }

  return { discountType, discountValue, minOrderValue };
}

function buildBranchShareSplitsPayload(
  form: PromotionFormState,
  mode: 'create' | 'update',
): Record<string, { branchSharePct: number; platformSharePct: number }> | null | undefined {
  if (form.ownership === 'SHARED' && form.branchScope === 'selected' && form.storeIds.length > 0) {
    return Object.fromEntries(
      form.storeIds.map((id) => [
        id,
        form.branchShareSplits[id] ?? { branchSharePct: 50, platformSharePct: 50 },
      ]),
    );
  }
  // All branches + SHARED: persist any per-branch splits the admin set (varies by branch).
  if (form.ownership === 'SHARED' && form.branchScope === 'all') {
    const entries = Object.entries(form.branchShareSplits);
    if (entries.length === 0) return null;
    return Object.fromEntries(
      entries.map(([id, split]) => [
        id,
        split ?? { branchSharePct: 50, platformSharePct: 50 },
      ]),
    );
  }
  if (form.ownership === 'BRANCH' || form.ownership === 'PLATFORM') {
    return null;
  }
  if (mode === 'update') {
    return undefined;
  }
  return null;
}

export function formToPayload(form: PromotionFormState, mode: 'create' | 'update' = 'create') {
  const { discountType, discountValue, minOrderValue } = deriveDiscountFields(form);
  const maxUses = form.usageLimits.maxTotal ?? (form.maxUses ? parseInt(form.maxUses, 10) : undefined);
  const firstSelectedSplit = form.storeIds
    .map((id) => form.branchShareSplits[id])
    .find((split) => split != null);
  const branchShareSplits = buildBranchShareSplitsPayload(form, mode);

  const payload: Record<string, unknown> = {
    code: resolvePromoCodeForSave(form.promotionKind, form.code, form.title),
    title: form.title || undefined,
    description: form.description || undefined,
    promotionKind: form.promotionKind || undefined,
    promotionRules: form.promotionRules,
    usageLimits: Object.keys(form.usageLimits).length ? form.usageLimits : undefined,
    discountType,
    discountValue,
    minOrderValue,
    maxUses,
    startsAt: form.activateImmediately ? null : form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
    isActive: form.isActive,
    criteria: form.criteria.length ? form.criteria : undefined,
    ownership: form.ownership || undefined,
    contributionSource: form.ownership === 'SHARED' ? form.contributionSource : undefined,
    branchSharePct:
      form.ownership === 'SHARED'
        ? (typeof form.branchSharePct === 'number'
          ? form.branchSharePct
          : firstSelectedSplit?.branchSharePct ?? 50)
        : form.ownership === 'BRANCH'
          ? 100
          : form.ownership === 'PLATFORM'
            ? 0
            : undefined,
    platformSharePct:
      form.ownership === 'SHARED'
        ? (typeof form.platformSharePct === 'number'
          ? form.platformSharePct
          : firstSelectedSplit?.platformSharePct ?? 50)
        : form.ownership === 'BRANCH'
          ? 0
          : form.ownership === 'PLATFORM'
            ? 100
            : undefined,
    cardDesign: form.cardDesign,
    storeIds: form.branchScope === 'selected' && form.storeIds.length > 0 ? form.storeIds : null,
    showOnHome: form.showOnHome,
  };

  if (branchShareSplits !== undefined) {
    payload.branchShareSplits = branchShareSplits;
  }

  return payload;
}

export function mergePromotionFormInitial(
  initial?: Partial<PromotionFormState>,
  branchMode = false,
): PromotionFormState {
  return {
    ...emptyPromotionForm(),
    ...(branchMode
      ? { ownership: 'BRANCH' as const, branchSharePct: 100, platformSharePct: 0 }
      : {}),
    ...initial,
    ...(branchMode
      ? { ownership: 'BRANCH' as const, branchSharePct: 100, platformSharePct: 0 }
      : {}),
    cardDesign: normalizeCardDesignSet(initial?.cardDesign, initial?.code ?? 'PROMO'),
  };
}
