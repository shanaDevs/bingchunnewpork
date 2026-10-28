'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, FileDown } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAdminSession, isSuperAdmin } from '@/lib/adminAuth';
import type { PromotionRules } from '@/lib/promotionTypes';
import {
  getEligibleBranchIds,
  getPromotedProductIdsFromRules,
  type PromoProductWithStores,
} from '@/lib/promotionBranches';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import { useReportStores } from '@/components/admin/reports/ReportBranchFilter';
import {
  contributionSourceLabel,
  isBranchShareSplitBalanced,
  type PromotionOwnership,
  type BranchShareSplit,
  type ContributionSource,
} from '@/lib/promotionCriteria';
import {
  buildPromotionContributionReference,
  printPromotionContribution,
} from '@/lib/promotionContributionPrint';

function adminFetchProducts() {
    return fetch(`${getApiBaseUrl()}/menu/products`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return (data.data ?? data) as PromoProductWithStores[];
  });
}

interface PromotionBranchSelectorProps {
  branchScope: 'all' | 'selected';
  storeIds: string[];
  promotionRules: PromotionRules;
  ownership?: PromotionOwnership | '';
  contributionSource?: ContributionSource;
  branchShareSplits?: Record<string, BranchShareSplit>;
  fallbackSplit?: BranchShareSplit;
  onScopeChange: (scope: 'all' | 'selected') => void;
  onChange: (storeIds: string[]) => void;
  onSplitChange?: (storeId: string, split: BranchShareSplit) => void;
  /** Called when SHARED so parent can seed splits for the stores shown in the table. */
  onSplitStoresChange?: (storeIds: string[]) => void;
  promotionTitle?: string;
  promotionCode?: string;
}

function stopFormBubble(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function SharePctInput({
  ariaLabel,
  value,
  invalid,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  invalid: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      className={`input-field${invalid ? ' promo-branch-splits__input--invalid' : ''}`}
      type="number"
      min={0}
      max={100}
      aria-label={ariaLabel}
      value={value}
      onClick={stopFormBubble}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function PromotionBranchSelector({
  branchScope,
  storeIds,
  promotionRules,
  ownership,
  contributionSource = 'JASON',
  branchShareSplits = {},
  fallbackSplit = { branchSharePct: 50, platformSharePct: 50 },
  onScopeChange,
  onChange,
  onSplitChange,
  onSplitStoresChange,
  promotionTitle = '',
  promotionCode = '',
}: PromotionBranchSelectorProps) {
  const superAdmin = isSuperAdmin(getAdminSession());
  const { data: stores = [], isFetched: storesFetched } = useReportStores();
  const { data: products = [] } = useQuery<PromoProductWithStores[]>({
    queryKey: ['promo-product-picker'],
    queryFn: adminFetchProducts,
    staleTime: 60_000,
    enabled: superAdmin,
  });

  const [search, setSearch] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSplitStoresChangeRef = useRef(onSplitStoresChange);
  onSplitStoresChangeRef.current = onSplitStoresChange;
  const lastAddedBranchRef = useRef<string | null>(null);
  const splitRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const productIds = useMemo(
    () => getPromotedProductIdsFromRules(promotionRules),
    [promotionRules],
  );

  const allStoreIds = useMemo(() => stores.map((s) => s.id), [stores]);

  const eligibleBranchIds = useMemo(
    () => getEligibleBranchIds(productIds, products, allStoreIds),
    [productIds, products, allStoreIds],
  );

  const eligibleStores = useMemo(() => {
    const selectedSet = new Set(storeIds);
    const eligible = stores.filter((s) => eligibleBranchIds.includes(s.id));
    const savedOnly = stores.filter(
      (s) => selectedSet.has(s.id) && !eligible.some((e) => e.id === s.id),
    );
    return [...eligible, ...savedOnly];
  }, [stores, eligibleBranchIds, storeIds]);

  const storeById = useMemo(() => {
    const map = new Map<string, (typeof stores)[number]>();
    for (const store of stores) map.set(store.id, store);
    return map;
  }, [stores]);

  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleStores;
    return eligibleStores.filter(
      (s) =>
        branchDisplayName(s.name).toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [eligibleStores, search]);

  useEffect(() => {
    if (branchScope !== 'selected' || storeIds.length === 0) return;
    if (!storesFetched || stores.length === 0) return;
    const known = new Set(allStoreIds);
    const valid = storeIds.filter((id) => known.has(id));
    if (valid.length === 0 || valid.length === storeIds.length) return;
    onChangeRef.current(valid);
  }, [allStoreIds, branchScope, storeIds, stores.length, storesFetched]);

  useEffect(() => {
    const addedId = lastAddedBranchRef.current;
    if (!addedId) return;
    lastAddedBranchRef.current = null;
    const row = splitRowRefs.current[addedId];
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [storeIds]);

  const splitStoreIds = useMemo(() => {
    if (ownership !== 'SHARED') return [] as string[];
    if (branchScope === 'selected') return storeIds;
    return eligibleBranchIds;
  }, [ownership, branchScope, storeIds, eligibleBranchIds]);

  useEffect(() => {
    if (ownership !== 'SHARED') return;
    if (splitStoreIds.length === 0) return;
    onSplitStoresChangeRef.current?.(splitStoreIds);
  }, [ownership, splitStoreIds]);

  const secondPartyLabel = contributionSourceLabel(contributionSource);

  if (!superAdmin) return null;

  function switchMode(next: 'all' | 'selected') {
    onScopeChange(next);
    if (next === 'all') {
      onChange([]);
    }
  }

  function toggleBranch(branchId: string, e?: React.SyntheticEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    const selected = storeIds.includes(branchId);
    const next = selected
      ? storeIds.filter((id) => id !== branchId)
      : [...storeIds, branchId];
    if (!selected) {
      lastAddedBranchRef.current = branchId;
    }
    onChange(next);
    if (next.length > 0 && branchScope === 'all') {
      onScopeChange('selected');
    }
  }

  const showPerBranchSplits = ownership === 'SHARED' && splitStoreIds.length > 0;

  function updateSplit(storeId: string, field: 'branchSharePct' | 'platformSharePct', raw: string) {
    if (!onSplitChange) return;
    const parsed = raw === '' ? 0 : Math.min(100, Math.max(0, Number(raw)));
    const next = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    if (field === 'branchSharePct') {
      onSplitChange(storeId, { branchSharePct: next, platformSharePct: 100 - next });
      return;
    }
    onSplitChange(storeId, { branchSharePct: 100 - next, platformSharePct: next });
  }

  function branchLabel(storeId: string) {
    const store = storeById.get(storeId);
    return store ? branchDisplayName(store.name) : storeId;
  }

  function handleExportContribution() {
    if (!showPerBranchSplits) return;
    const rows = splitStoreIds.map((storeId) => ({
      branchLabel: branchLabel(storeId),
      split: branchShareSplits[storeId] ?? fallbackSplit,
    }));
    const dateLabel = new Date().toLocaleDateString('en-LK', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    printPromotionContribution({
      promotionTitle,
      promotionCode,
      contributionSource,
      branchScope,
      rows,
      reference: buildPromotionContributionReference(promotionCode),
      dateLabel,
    });
  }

  function renderSimpleList() {
    return (
      <div
        className="promo-branch-list overflow-y-auto rounded-lg border border-navy-border bg-navy-light/20 divide-y divide-navy-border/60 max-h-44"
        onClick={stopFormBubble}
        onKeyDown={stopFormBubble}
      >
        {filteredStores.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {eligibleStores.length === 0
              ? 'No branches carry the selected products.'
              : 'No branches match your search.'}
          </p>
        ) : (
          filteredStores.map((branch) => {
            const selected = storeIds.includes(branch.id);
            const split = branchShareSplits[branch.id] ?? fallbackSplit;
            const invalid = !isBranchShareSplitBalanced(split);
            const label = branchDisplayName(branch.name);
            const showInlineSplit = selected && showPerBranchSplits;
            return (
              <div
                key={branch.id}
                ref={showInlineSplit
                  ? (el) => {
                    splitRowRefs.current[branch.id] = el;
                  }
                  : undefined}
                className={`promo-branch-row${selected ? ' promo-branch-row--selected' : ''}${showInlineSplit && invalid ? ' promo-branch-row--warn' : ''}`}
              >
                <label className="promo-branch-row__pick">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleBranch(branch.id, e)}
                    onClick={stopFormBubble}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      selected
                        ? 'border-brand bg-brand text-white'
                        : 'border-navy-border bg-navy-light/30'
                    }`}
                  >
                    {selected && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="promo-branch-row__name text-sm text-fg">
                    {label}
                  </span>
                </label>
                {showInlineSplit && (
                  <div className="promo-branch-row__split">
                    <label className="promo-branch-row__split-field">
                      Branch %
                      <SharePctInput
                        ariaLabel={`Branch share for ${label}`}
                        value={split.branchSharePct}
                        invalid={invalid}
                        onChange={(raw) => updateSplit(branch.id, 'branchSharePct', raw)}
                      />
                    </label>
                    <label className="promo-branch-row__split-field">
                      {secondPartyLabel} %
                      <SharePctInput
                        ariaLabel={`${secondPartyLabel} share for ${label}`}
                        value={split.platformSharePct}
                        invalid={invalid}
                        onChange={(raw) => updateSplit(branch.id, 'platformSharePct', raw)}
                      />
                    </label>
                    {invalid && (
                      <span className="promo-branch-splits__warn">Must total 100%</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  function renderSplitPanel() {
    return (
      <div
        className="promo-branch-splits card p-3 mt-3"
        onClick={stopFormBubble}
        onKeyDown={stopFormBubble}
      >
        <h4 className="promo-criteria__group-title">Per-branch cost sharing</h4>
        <div className="promo-branch-splits__scroll rounded-lg border border-navy-border bg-navy-light/20">
          <div className="promo-branch-splits__head" role="row">
            <span role="columnheader">Branch</span>
            <span role="columnheader">Branch %</span>
            <span role="columnheader">{secondPartyLabel} %</span>
          </div>
          {splitStoreIds.map((storeId) => {
            const split = branchShareSplits[storeId] ?? fallbackSplit;
            const invalid = !isBranchShareSplitBalanced(split);
            const label = branchLabel(storeId);
            return (
              <div
                key={storeId}
                className={`promo-branch-splits__row${invalid ? ' promo-branch-splits__row--warn' : ''}`}
                role="row"
              >
                <span className="promo-branch-splits__name text-sm text-fg" role="cell">
                  {label}
                </span>
                <div className="promo-branch-splits__pct" role="cell">
                  <SharePctInput
                    ariaLabel={`Branch share for ${label}`}
                    value={split.branchSharePct}
                    invalid={invalid}
                    onChange={(raw) => updateSplit(storeId, 'branchSharePct', raw)}
                  />
                </div>
                <div className="promo-branch-splits__pct" role="cell">
                  <SharePctInput
                    ariaLabel={`${secondPartyLabel} share for ${label}`}
                    value={split.platformSharePct}
                    invalid={invalid}
                    onChange={(raw) => updateSplit(storeId, 'platformSharePct', raw)}
                  />
                  {invalid && (
                    <span className="promo-branch-splits__warn">Must total 100%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="promo-criteria__section promo-branch-selector">
      <div className="promo-criteria__section-head promo-criteria__section-head--with-action">
        <h3 className="promo-criteria__heading">Branch availability</h3>
        <button
          type="button"
          className="btn-outline px-3 py-2 text-sm flex items-center gap-1.5 shrink-0"
          onClick={handleExportContribution}
          disabled={!showPerBranchSplits}
          title={
            showPerBranchSplits
              ? 'Export branch and platform contribution splits as PDF'
              : 'Select Shared promotion and at least one branch to export'
          }
        >
          <FileDown size={14} aria-hidden />
          Export PDF
        </button>
      </div>

      <div className="promo-criteria__ownership-grid mb-3">
        <button
          type="button"
          className={`promo-criteria__ownership${branchScope === 'all' ? ' promo-criteria__ownership--active' : ''}`}
          onClick={() => switchMode('all')}
        >
          <span className="promo-criteria__ownership-label">All branches</span>
        </button>
        <button
          type="button"
          className={`promo-criteria__ownership${branchScope === 'selected' ? ' promo-criteria__ownership--active' : ''}`}
          onClick={() => switchMode('selected')}
        >
          <span className="promo-criteria__ownership-label">Selected branches</span>
        </button>
      </div>

      {branchScope === 'all' && showPerBranchSplits && renderSplitPanel()}

      {branchScope === 'selected' && (
        <div className="card p-3 promo-branch-selector__card">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              className="input-field flex-1 min-w-[180px] text-sm"
              placeholder="Search branches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={stopFormBubble}
            />
            <button
              type="button"
              className="btn-outline px-3 py-2 text-sm"
              onClick={() => onChange(eligibleBranchIds)}
            >
              Select all
            </button>
            <button
              type="button"
              className="btn-outline px-3 py-2 text-sm"
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <span className="text-sm font-medium text-brand tabular-nums ml-auto">
              {storeIds.length} selected
            </span>
          </div>

          {renderSimpleList()}

          {storeIds.length === 0 && (
            <p className="text-sm text-amber-400 mt-2">
              Select at least one branch, or switch back to All branches.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
