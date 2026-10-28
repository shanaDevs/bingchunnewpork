import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import { promoStatusLabel } from '@/lib/promotionAdminLabels';
import {
  contributionSourceLabel,
  defaultBranchShareSplit,
  parseBranchShareSplits,
  PROMOTION_CONTRIBUTION_SOURCE_OPTIONS,
  PROMOTION_OWNERSHIP_OPTIONS,
  criteriaLabel,
  type BranchShareSplit,
  type ContributionSource,
} from '@/lib/promotionCriteria';
import { buildSharedBranchShareRows, type PromoStore } from '@/lib/promotionBranches';
import {
  parsePromoJsonField,
  parsePromoStringArray,
  parsePromoUsageLimits,
  type AdminPromoRow,
} from '@/lib/promotionFormUtils';
import type { PromotionReportPrintArgs } from '@/lib/promotionReportPrint';
import type { PromotionKind, PromotionRules } from '@/lib/promotionTypes';
import { formatPromotionBenefit, formatUsageLimits, kindLabel } from '@/lib/promotionTypes';

function ownershipLabel(raw: string | null | undefined): string {
  const upper = String(raw ?? '').trim().toUpperCase();
  const opt = PROMOTION_OWNERSHIP_OPTIONS.find((o) => o.value === upper);
  return opt?.label ?? (upper || '—');
}

function contributionPartiesLine(source: string | null | undefined): string | undefined {
  const upper = source === 'PLATFORM' ? 'PLATFORM' : 'JASON';
  const opt = PROMOTION_CONTRIBUTION_SOURCE_OPTIONS.find((o) => o.value === upper);
  if (!opt) return undefined;
  return `Contribution parties  ${opt.label}`;
}

function formatDateTime(raw?: string | null): string {
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBranchAvailabilityDetail(storeIds: string[], stores: PromoStore[]): string {
  if (!storeIds.length) return 'All branches';
  const names = storeIds.map((id) => {
    const store = stores.find((s) => s.id === id);
    return store ? branchDisplayName(store.name) : id;
  });
  return names.join(', ');
}

function fallbackSplitFromPromo(promo: AdminPromoRow): BranchShareSplit {
  const branch =
    promo.branchSharePct != null && Number.isFinite(Number(promo.branchSharePct))
      ? Math.round(Number(promo.branchSharePct))
      : '';
  const platform =
    promo.platformSharePct != null && Number.isFinite(Number(promo.platformSharePct))
      ? Math.round(Number(promo.platformSharePct))
      : '';
  return defaultBranchShareSplit(branch, platform);
}

export function buildPromotionReportPrintArgsFromPromo(
  promo: AdminPromoRow,
  stores: PromoStore[],
  dateLabel: string,
): PromotionReportPrintArgs {
  const storeIds = parsePromoStringArray(promo.storeIds);
  const splits = parseBranchShareSplits(
    parsePromoJsonField(promo.branchShareSplits, promo.branchShareSplits),
  );
  const ownership = String(promo.ownership ?? '').trim().toUpperCase();
  const isShared = ownership === 'SHARED';
  const contributionSource = (promo.contributionSource === 'PLATFORM' ? 'PLATFORM' : 'JASON') as ContributionSource;
  const fallback = fallbackSplitFromPromo(promo);
  const tableStoreIds = storeIds.length > 0 ? storeIds : Object.keys(splits);
  const shareRows = isShared
    ? buildSharedBranchShareRows(tableStoreIds, splits, stores, fallback, branchDisplayName)
    : [];

  const kind = promo.promotionKind as PromotionKind | null | undefined;
  const typeLabel = kind ? kindLabel(kind) : '—';
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const benefit = kind
    ? formatPromotionBenefit(kind, rules, promo.discountValue)
    : promo.discountType === 'PERCENTAGE'
      ? `${promo.discountValue}%`
      : `LKR ${promo.discountValue}`;

  const scheduleLines = [
    promo.startsAt ? `Starts  ${formatDateTime(promo.startsAt)}` : 'Starts  Immediately',
    promo.expiresAt ? `Ends  ${formatDateTime(promo.expiresAt)}` : 'Ends  —',
    promo.showOnHome !== false ? 'Home page  Shown' : 'Home page  Hidden',
  ];

  const criteria = parsePromoStringArray(promo.criteria).map((key) => criteriaLabel(key));

  return {
    reference: promo.code,
    dateLabel,
    logoSrc: '',
    title: promo.title?.trim() || promo.code,
    code: promo.code,
    status: promoStatusLabel(promo),
    typeLabel,
    benefit,
    scheduleLines,
    usage: formatUsageLimits(
      parsePromoUsageLimits(promo.usageLimits, promo.maxUses),
      promo.usedCount,
    ),
    ownershipLine: `Ownership  ${ownershipLabel(promo.ownership)}`,
    contributionPartiesLine: isShared ? contributionPartiesLine(promo.contributionSource) : undefined,
    branchAvailability: formatBranchAvailabilityDetail(storeIds, stores),
    targetingTags: criteria,
    showContributionTable: isShared && shareRows.length > 0,
    secondPartyColumnLabel: contributionSourceLabel(contributionSource),
    contributionRows: shareRows.map((row) => ({
      branchLabel: row.branchName,
      branchSharePct: row.branchSharePct,
      platformSharePct: row.platformSharePct,
    })),
  };
}
