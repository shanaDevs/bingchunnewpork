export type PromotionOwnership = 'BRANCH' | 'SHARED' | 'PLATFORM';

export type ContributionSource = 'PLATFORM' | 'JASON';

export function contributionSourceLabel(source: ContributionSource): string {
  return source === 'JASON' ? 'Jason' : 'Platform';
}

export const PROMOTION_CONTRIBUTION_SOURCE_OPTIONS: {
  value: ContributionSource;
  label: string;
  description: string;
}[] = [
  {
    value: 'PLATFORM',
    label: 'Branch + Platform',
    description: 'Platform commission funds the non-branch share',
  },
  {
    value: 'JASON',
    label: 'Branch + Jason',
    description: "Jason's invested balance funds the non-branch share",
  },
];

export interface PromotionCriteriaGroup {
  id: string;
  label: string;
  items: string[];
}

export const PROMOTION_CRITERIA_GROUPS: PromotionCriteriaGroup[] = [
  {
    id: 'seasonal',
    label: 'Seasonal Based',
    items: ['Vesak', 'Ramadan', 'New Year', 'Christmas', "Valentine's", 'Anniversary'],
  },
  {
    id: 'product',
    label: 'Product Based',
    items: ['Buy X Get Y', 'Buy 1 Get 1', 'Gift Item', 'Specific Category', 'Combo Offer', 'New Product Launch'],
  },
  {
    id: 'payment',
    label: 'Payment Based',
    items: ['Digital Wallet', 'Bank Promotions', 'Card Offers'],
  },
  {
    id: 'datetime',
    label: 'Date & Time Based',
    items: ['Weekend', '7 PM - 10 PM', 'Happy Hour', 'Every Friday', 'Birthday'],
  },
  {
    id: 'delivery',
    label: 'Delivery Based',
    items: ['Free Delivery', 'Reduced Delivery Fee', 'Delivery Distance', 'Customer Location', 'Delivery Zone'],
  },
  {
    id: 'order',
    label: 'Order Based',
    items: ['Normal Orders', 'Bulk Orders', 'Spend Over Amount', 'Minimum Order Value'],
  },
  {
    id: 'customer',
    label: 'Customer Based',
    items: [
      'First Order Offer',
      'Welcome Offer',
      'Referral Offer',
      'Win-back Offers',
      'Loyalty Customers',
      'Tier Benefits',
      'Milk Tea Lovers',
    ],
  },
  {
    id: 'behaviour',
    label: 'Purchase Behaviour',
    items: [
      'Personalized Offers',
      'Reward Offers',
      'Recommendation Engine',
      'Similar Products',
      'Cross Selling',
      'Upselling',
      'New Item Suggestions',
      'Coffee Lovers',
      'Frequently Bought Items',
    ],
  },
];

export const PROMOTION_OWNERSHIP_OPTIONS: { value: PromotionOwnership; label: string; description: string }[] = [
  { value: 'BRANCH', label: 'Branch Promotion', description: 'Special branch offers' },
  { value: 'SHARED', label: 'Shared Promotion', description: 'Platform + branch cost sharing' },
  { value: 'PLATFORM', label: 'Platform Promotion', description: 'Platform-wide campaigns' },
];

export type BranchShareSplit = { branchSharePct: number; platformSharePct: number };

export function isBranchShareSplitBalanced(split: BranchShareSplit): boolean {
  return split.branchSharePct + split.platformSharePct === 100;
}

export function validateSharedPromotionShares(
  ownership: PromotionOwnership | '',
  branchSharePct?: number | '',
  platformSharePct?: number | '',
): string | null {
  if (ownership !== 'SHARED') return null;
  const branch = branchSharePct === '' || branchSharePct == null ? NaN : Number(branchSharePct);
  const platform = platformSharePct === '' || platformSharePct == null ? NaN : Number(platformSharePct);
  if (Number.isNaN(branch) || Number.isNaN(platform)) {
    return 'Enter branch and platform percentages for shared promotions';
  }
  if (branch < 0 || branch > 100 || platform < 0 || platform > 100) {
    return 'Percentages must be between 0 and 100';
  }
  if (branch + platform !== 100) {
    return 'Branch and platform percentages must total 100%';
  }
  return null;
}

export function defaultBranchShareSplit(
  branchSharePct: number | '',
  platformSharePct: number | '',
): BranchShareSplit {
  const branch = typeof branchSharePct === 'number' ? branchSharePct : 50;
  const platform = typeof platformSharePct === 'number' ? platformSharePct : 100 - branch;
  return { branchSharePct: branch, platformSharePct: platform };
}

export function parseBranchShareSplits(raw: unknown): Record<string, BranchShareSplit> {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const out: Record<string, BranchShareSplit> = {};
  for (const [storeId, value] of Object.entries(source as Record<string, unknown>)) {
    if (!storeId || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    const branch = Number(rec.branchSharePct);
    const platform = Number(rec.platformSharePct);
    if (!Number.isFinite(branch) || !Number.isFinite(platform)) continue;
    out[storeId] = { branchSharePct: Math.round(branch), platformSharePct: Math.round(platform) };
  }
  return out;
}

export function validateSelectedBranchShareSplits(
  ownership: PromotionOwnership | '',
  branchScope: 'all' | 'selected',
  storeIds: string[],
  splits: Record<string, BranchShareSplit>,
): string | null {
  if (ownership !== 'SHARED') return null;
  const ids = branchScope === 'selected' ? storeIds : Object.keys(splits);
  if (ids.length === 0) return null;
  for (const id of ids) {
    const err = validateSharedPromotionShares('SHARED', splits[id]?.branchSharePct, splits[id]?.platformSharePct);
    if (err) {
      return branchScope === 'selected'
        ? 'Set a valid cost split for every selected branch'
        : 'Set a valid cost split for every branch';
    }
  }
  return null;
}

export function seedBranchShareSplits(
  storeIds: string[],
  existing: Record<string, BranchShareSplit>,
  fallback: BranchShareSplit,
): Record<string, BranchShareSplit> {
  const next: Record<string, BranchShareSplit> = {};
  for (const id of storeIds) {
    next[id] = existing[id] ? { ...existing[id] } : { ...fallback };
  }
  return next;
}

export const FUTURE_ENHANCEMENTS = [
  'Customer Segmentation',
  'Churn Prevention',
  'Personalized Campaigns',
  'AI Recommendations',
  'Predictive Offers',
] as const;

export function criteriaKey(groupId: string, item: string): string {
  return `${groupId}::${item}`;
}

export function isCustomCriteriaKey(key: string): boolean {
  return key.startsWith('custom::');
}

export function customCriteriaKey(label: string): string {
  return criteriaKey('custom', label.trim());
}

export function parseCriteriaKey(key: string): { groupId: string; item: string } {
  const [groupId, ...rest] = key.split('::');
  return { groupId, item: rest.join('::') };
}

/** All predefined chip keys from the targeting groups (excludes custom tags). */
export const PREDEFINED_CRITERIA_KEYS = new Set(
  PROMOTION_CRITERIA_GROUPS.flatMap((g) => g.items.map((item) => criteriaKey(g.id, item))),
);

/** Criteria keys tied to offer types in step 1 — replaced when the offer type changes. */
export const OFFER_TYPE_CRITERIA_KEYS = new Set([
  'display::Upload Banner',
  'display::Custom Offer',
  'product::Buy 1 Get 1',
  'product::Buy X Get Y',
  'product::Gift Item',
  'product::Specific Category',
  'product::Combo Offer',
  'product::New Product Launch',
  'order::Spend Over Amount',
  'order::Minimum Order Value',
  'order::Bulk Orders',
  'delivery::Free Delivery',
  'delivery::Reduced Delivery Fee',
  'delivery::Delivery Zone',
  'delivery::Delivery Distance',
  'datetime::Weekend',
  'datetime::7 PM - 10 PM',
  'datetime::Happy Hour',
  'datetime::Every Friday',
  'datetime::Birthday',
  'payment::Digital Wallet',
  'payment::Bank Promotions',
  'payment::Card Offers',
  'customer::First Order Offer',
  'customer::Welcome Offer',
  'customer::Referral Offer',
  'customer::Win-back Offers',
  'customer::Tier Benefits',
  'seasonal::New Year',
]);

export function syncCriteriaWithPrimary(primaryKey: string | undefined, criteria: string[]): string[] {
  if (!primaryKey) return criteria;
  const kept = criteria.filter((k) => {
    if (k === primaryKey) return false;
    if (OFFER_TYPE_CRITERIA_KEYS.has(k)) return false;
    return true;
  });
  return [primaryKey, ...kept];
}

export function criteriaLabel(key: string): string {
  return parseCriteriaKey(key).item;
}

export function criteriaGroupIdForKey(key: string): string {
  return parseCriteriaKey(key).groupId;
}
