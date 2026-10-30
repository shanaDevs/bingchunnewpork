'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Gift, RotateCcw, Save, Search, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { confirmDialog } from '@/store/confirmStore';
import PromotionProductPicker, { productToSelected } from '@/components/admin/promotions/PromotionProductPicker';
import AdminPrintCanvas, { printAdminReport } from '@/components/admin/AdminPrintCanvas';
import AdminReportPdf from '@/components/admin/AdminReportPdf';
import {
  PROMOTION_CONTRIBUTION_SOURCE_OPTIONS,
  PROMOTION_OWNERSHIP_OPTIONS,
  contributionSourceLabel,
  defaultBranchShareSplit,
  parseBranchShareSplits,
  seedBranchShareSplits,
  validateSelectedBranchShareSplits,
  validateSharedPromotionShares,
  type BranchShareSplit,
  type ContributionSource,
  type PromotionOwnership,
} from '@/lib/promotionCriteria';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import type { Product } from '@/types';

type CampaignForm = {
  offer1Enabled: boolean;
  offer1WebDiscountValue: number;
  offer1AppDiscountValue: number;
  offer1MinSubtotal: number;
  offer2Enabled: boolean;
  offer2RewardType: 'DISCOUNT' | 'GIFT';
  offer2GiftProductId: string | null;
  offer2WindowDays: number;
  offer2MinSubtotal: number;
  offer3Enabled: boolean;
  offer3RequiredOrders: number;
  offer3MinOrderAmount: number;
  offer3WinChanceNumerator: number;
  offer3WinChanceDenominator: number;
  isActive: boolean;
  ownership: PromotionOwnership;
  contributionSource: ContributionSource;
  branchSharePct: number;
  platformSharePct: number;
  branchShareSplits: Record<string, BranchShareSplit>;
};

const DEFAULT_FORM: CampaignForm = {
  offer1Enabled: true,
  offer1WebDiscountValue: 20,
  offer1AppDiscountValue: 30,
  offer1MinSubtotal: 0,
  offer2Enabled: true,
  offer2RewardType: 'GIFT',
  offer2GiftProductId: null,
  offer2WindowDays: 7,
  offer2MinSubtotal: 0,
  offer3Enabled: true,
  offer3RequiredOrders: 3,
  offer3MinOrderAmount: 1000,
  offer3WinChanceNumerator: 1,
  offer3WinChanceDenominator: 10,
  isActive: true,
  ownership: 'PLATFORM',
  contributionSource: 'JASON',
  branchSharePct: 0,
  platformSharePct: 100,
  branchShareSplits: {},
};

function campaignToForm(row: Record<string, unknown> | null | undefined): CampaignForm {
  if (!row) return { ...DEFAULT_FORM };
  return {
    offer1Enabled: Boolean(row.offer1Enabled),
    offer1WebDiscountValue: Number(row.offer1WebDiscountValue ?? row.offer1DiscountValue ?? 20),
    offer1AppDiscountValue: Number(row.offer1AppDiscountValue ?? row.offer1DiscountValue ?? 30),
    offer1MinSubtotal: Number(row.offer1MinSubtotal ?? 0),
    offer2Enabled: Boolean(row.offer2Enabled),
    offer2RewardType: (row.offer2RewardType as CampaignForm['offer2RewardType']) || 'GIFT',
    offer2GiftProductId: (row.offer2GiftProductId as string | null) ?? null,
    offer2WindowDays: Number(row.offer2WindowDays ?? 7),
    offer2MinSubtotal: Number(row.offer2MinSubtotal ?? 0),
    offer3Enabled: Boolean(row.offer3Enabled),
    offer3RequiredOrders: Number(row.offer3RequiredOrders ?? 3),
    offer3MinOrderAmount: Number(row.offer3MinOrderAmount ?? 1000),
    offer3WinChanceNumerator: Number(row.offer3WinChanceNumerator ?? 1),
    offer3WinChanceDenominator: Number(row.offer3WinChanceDenominator ?? 10),
    isActive: Boolean(row.isActive ?? true),
    ownership: (row.ownership as CampaignForm['ownership']) || 'PLATFORM',
    contributionSource: (row.contributionSource as ContributionSource) === 'PLATFORM' ? 'PLATFORM' : 'JASON',
    branchSharePct: Number(row.branchSharePct ?? 0),
    platformSharePct: Number(row.platformSharePct ?? 100),
    branchShareSplits: parseBranchShareSplits(row.branchShareSplits),
  };
}

interface LoyaltyCampaignDashboardProps {
  branchMode: boolean;
  /** Compact card for System Settings page */
  embedMode?: boolean;
}

export default function LoyaltyCampaignDashboard({ branchMode, embedMode = false }: LoyaltyCampaignDashboardProps) {
  const qc = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [customizing, setCustomizing] = useState(false);
  const [form, setForm] = useState<CampaignForm>(DEFAULT_FORM);
  const [branchSearch, setBranchSearch] = useState('');
  const [showContributionPdf, setShowContributionPdf] = useState(false);

  const campaignQueryKey = ['loyalty-campaign', branchMode ? 'branch' : selectedStoreId || 'platform'];

  const { data: stores } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => adminFetch('/stores'),
    enabled: !branchMode && !embedMode,
  });

  const storeList = useMemo(
    () => (stores ?? []) as Array<{ id: string; name: string; city: string }>,
    [stores],
  );
  const allStoreIds = useMemo(() => storeList.map((s) => s.id), [storeList]);
  const filteredStoreList = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) return storeList;
    return storeList.filter((s) => {
      const label = branchDisplayName(s.name).toLowerCase();
      return label.includes(q) || s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q);
    });
  }, [storeList, branchSearch]);
  const contributionPdfRows = useMemo(() => {
    const party = contributionSourceLabel(form.contributionSource);
    return storeList.map((store) => {
      const split =
        form.branchShareSplits[store.id]
        ?? defaultBranchShareSplit(form.branchSharePct, form.platformSharePct);
      return {
        key: store.id,
        cells: [
          branchDisplayName(store.name),
          `${split.branchSharePct}%`,
          `${split.platformSharePct}%`,
          party,
        ],
      };
    });
  }, [storeList, form.branchShareSplits, form.branchSharePct, form.platformSharePct, form.contributionSource]);

  const { data, isLoading } = useQuery({
    queryKey: campaignQueryKey,
    queryFn: () =>
      adminFetch(
        branchMode
          ? '/loyalty/campaign'
          : selectedStoreId
            ? `/loyalty/campaign?storeId=${encodeURIComponent(selectedStoreId)}`
            : '/loyalty/campaign',
      ),
  });

  const inheritedFromPlatform = branchMode ? Boolean(data?.inheritedFromPlatform) : false;
  const hasOverride = branchMode ? Boolean(data?.override) : Boolean(data?.override);
  const readOnly = branchMode && inheritedFromPlatform && !customizing;

  useEffect(() => {
    const source = branchMode
      ? (data?.override ?? data?.resolved ?? data?.platform)
      : (selectedStoreId ? (data?.override ?? data?.resolved ?? data?.platform) : data?.platform);
    const next = campaignToForm(source);
    if (!branchMode && !selectedStoreId && allStoreIds.length > 0 && next.ownership === 'SHARED') {
      next.branchShareSplits = seedBranchShareSplits(
        allStoreIds,
        next.branchShareSplits,
        defaultBranchShareSplit(next.branchSharePct, next.platformSharePct),
      );
    }
    setForm(next);
    if (branchMode && data?.override) setCustomizing(true);
  }, [data, branchMode, selectedStoreId, allStoreIds]);

  useEffect(() => {
    if (branchMode || selectedStoreId || form.ownership !== 'SHARED' || allStoreIds.length === 0) return;
    setForm((f) => {
      const seeded = seedBranchShareSplits(
        allStoreIds,
        f.branchShareSplits,
        defaultBranchShareSplit(f.branchSharePct, f.platformSharePct),
      );
      const same =
        Object.keys(seeded).length === Object.keys(f.branchShareSplits).length
        && allStoreIds.every((id) => f.branchShareSplits[id]);
      if (same) return f;
      return { ...f, branchShareSplits: seeded };
    });
  }, [allStoreIds, branchMode, selectedStoreId, form.ownership]);

  const saveMutation = useMutation({
    mutationFn: (payload: CampaignForm & { storeId?: string | null }) =>
      adminFetch('/loyalty/campaign', {
        method: 'PUT',
        body: JSON.stringify({
          offer1Enabled: payload.offer1Enabled,
          offer1DiscountType: 'PERCENTAGE',
          offer1DiscountValue: payload.offer1WebDiscountValue,
          offer1WebDiscountValue: payload.offer1WebDiscountValue,
          offer1AppDiscountValue: payload.offer1AppDiscountValue,
          offer1MinSubtotal: payload.offer1MinSubtotal,
          offer2Enabled: payload.offer2Enabled,
          offer2DiscountType: 'PERCENTAGE',
          offer2DiscountValue: 0,
          offer2RewardType: payload.offer2RewardType,
          offer2GiftProductId: payload.offer2GiftProductId || null,
          offer2WindowDays: payload.offer2WindowDays,
          offer2MinSubtotal: payload.offer2MinSubtotal,
          offer3Enabled: payload.offer3Enabled,
          offer3RequiredOrders: payload.offer3RequiredOrders,
          offer3MinOrderAmount: payload.offer3MinOrderAmount,
          offer3WinChanceNumerator: payload.offer3WinChanceNumerator,
          offer3WinChanceDenominator: payload.offer3WinChanceDenominator,
          isActive: payload.isActive,
          ownership: payload.ownership,
          contributionSource: payload.contributionSource,
          branchSharePct: payload.branchSharePct,
          platformSharePct: payload.platformSharePct,
          branchShareSplits: payload.branchShareSplits,
          storeId: branchMode ? undefined : selectedStoreId || null,
        }),
      }),
    onSuccess: () => {
      toast.success('New customer journey saved');
      qc.invalidateQueries({ queryKey: ['loyalty-campaign'] });
      if (branchMode) setCustomizing(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      adminFetch(
        branchMode
          ? '/loyalty/campaign'
          : `/loyalty/campaign?storeId=${encodeURIComponent(selectedStoreId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      toast.success('Reverted to platform defaults');
      setCustomizing(false);
      qc.invalidateQueries({ queryKey: ['loyalty-campaign'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: giftProducts = [] } = useQuery<Product[]>({
    queryKey: ['promo-product-picker'],
    queryFn: () => adminFetch('/menu/products'),
    staleTime: 60_000,
  });

  const selectedGiftProducts = useMemo(() => {
    if (!form.offer2GiftProductId) return [];
    const product = giftProducts.find((p) => p.id === form.offer2GiftProductId);
    return product ? [productToSelected(product)] : [];
  }, [form.offer2GiftProductId, giftProducts]);

  const statusBadge = useMemo(() => {
    if (branchMode) {
      return inheritedFromPlatform && !customizing
        ? 'Using platform defaults'
        : 'Branch override active';
    }
    if (selectedStoreId) {
      return hasOverride ? 'Branch override' : 'Inherits platform defaults';
    }
    return 'Platform defaults';
  }, [branchMode, inheritedFromPlatform, customizing, selectedStoreId, hasOverride]);

  const update = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${embedMode ? 'min-h-[12rem]' : 'min-h-[40vh]'}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  const wrapperClass = embedMode ? 'space-y-5' : 'mx-auto max-w-4xl space-y-6 p-4 md:p-6';

  return (
    <div className={wrapperClass}>
      {!embedMode && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
              <Gift className="h-7 w-7 text-brand" />
              New Customer Journey
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              1st order discount → 2nd order gift → 3rd order Spin &amp; Win unlock.
            </p>
          </div>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            {statusBadge}
          </span>
        </div>
      )}

      {!branchMode && !embedMode && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Store className="h-4 w-4" />
            Edit scope
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            <option value="">Platform defaults (all branches)</option>
            {(storeList).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.city}
              </option>
            ))}
          </select>
        </div>
      )}

      {branchMode && inheritedFromPlatform && !customizing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Your branch currently uses platform journey rules. Customize to set your own rewards.
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => setCustomizing(true)}
          >
            Customize for this branch
          </button>
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-70">
        <section className={`rounded-xl border p-5 ${embedMode ? 'border-navy-border bg-navy-light/30' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Journey status</h2>
              <p className="text-sm text-gray-500">Turn the full new-customer promotion on or off.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} />
              Active
            </label>
          </div>
        </section>

        <section className={`rounded-xl border p-5 ${embedMode ? 'border-navy-border bg-navy-light/30' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
          <h2 className="text-lg font-semibold">1st order — Welcome discount</h2>
          <p className="mb-4 text-sm text-gray-500">Auto-applied on the customer&apos;s first valid order (sign-in required).</p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.offer1Enabled} onChange={(e) => update('offer1Enabled', e.target.checked)} />
            Enabled
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs text-gray-500">Website discount (%)</label>
              <input type="number" min={0} max={100} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer1WebDiscountValue} onChange={(e) => update('offer1WebDiscountValue', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">App discount (%)</label>
              <input type="number" min={0} max={100} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer1AppDiscountValue} onChange={(e) => update('offer1AppDiscountValue', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Min subtotal (LKR)</label>
              <input type="number" min={0} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer1MinSubtotal} onChange={(e) => update('offer1MinSubtotal', Number(e.target.value))} />
            </div>
          </div>
        </section>

        <section className={`rounded-xl border p-5 ${embedMode ? 'border-navy-border bg-navy-light/30' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
          <h2 className="text-lg font-semibold">2nd order — Free gift</h2>
          <p className="mb-4 text-sm text-gray-500">Only on the 2nd order, within the window after the first order.</p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.offer2Enabled} onChange={(e) => update('offer2Enabled', e.target.checked)} />
            Enabled
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-gray-500">Window (days)</label>
              <input type="number" min={1} max={90} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer2WindowDays} onChange={(e) => update('offer2WindowDays', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Min subtotal (LKR)</label>
              <input type="number" min={0} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer2MinSubtotal} onChange={(e) => update('offer2MinSubtotal', Number(e.target.value))} />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <PromotionProductPicker
                label="Gift product"
                selected={selectedGiftProducts}
                onChange={(items) => update('offer2GiftProductId', items[0]?.id ?? null)}
                placeholder="Select ice cream or gift item"
              />
            </div>
          </div>
        </section>

        <section className={`rounded-xl border p-5 ${embedMode ? 'border-navy-border bg-navy-light/30' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
          <h2 className="text-lg font-semibold">3rd order — Spin &amp; Win unlock</h2>
          <p className="mb-4 text-sm text-gray-500">
            Sets win chance and unlock progress. To make the wheel wait for this unlock, add the
            “Loyalty journey unlock” criterion on{' '}
            <a href="/admin/spin" className="text-brand hover:underline">Spin Wheel</a>.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.offer3Enabled} onChange={(e) => update('offer3Enabled', e.target.checked)} />
            Enabled
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs text-gray-500">Required orders</label>
              <input type="number" min={1} max={20} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer3RequiredOrders} onChange={(e) => update('offer3RequiredOrders', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Min order amount (LKR)</label>
              <input type="number" min={0} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer3MinOrderAmount} onChange={(e) => update('offer3MinOrderAmount', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Win chance (numerator)</label>
              <input type="number" min={0} max={1000} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer3WinChanceNumerator} onChange={(e) => update('offer3WinChanceNumerator', Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Win chance (denominator)</label>
              <input type="number" min={1} max={10000} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" value={form.offer3WinChanceDenominator} onChange={(e) => update('offer3WinChanceDenominator', Number(e.target.value))} />
              <p className="mt-1 text-[11px] text-gray-500">
                {form.offer3WinChanceNumerator} in {form.offer3WinChanceDenominator} spins win a prize
              </p>
            </div>
          </div>
        </section>

        {!branchMode && !selectedStoreId && !embedMode && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <h2 className="text-lg font-semibold">Cost sharing</h2>
            <p className="mt-1 text-sm text-gray-500">
              Same shared promotion policy as Promotions — choose who funds the non-branch share, then set default and per-branch percentages.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PROMOTION_OWNERSHIP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rounded-lg border px-3 py-3 text-left transition ${
                    form.ownership === opt.value
                      ? 'border-brand bg-brand/10'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                  onClick={() => {
                    const branchSharePct = opt.value === 'BRANCH' ? 100 : opt.value === 'PLATFORM' ? 0 : form.branchSharePct || 50;
                    const platformSharePct = 100 - branchSharePct;
                    setForm((f) => ({
                      ...f,
                      ownership: opt.value,
                      branchSharePct,
                      platformSharePct,
                      contributionSource: opt.value === 'SHARED' ? f.contributionSource : 'JASON',
                      branchShareSplits:
                        opt.value === 'SHARED'
                          ? seedBranchShareSplits(
                              allStoreIds,
                              f.branchShareSplits,
                              { branchSharePct, platformSharePct },
                            )
                          : {},
                    }));
                  }}
                >
                  <span className="block text-sm font-semibold">{opt.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{opt.description}</span>
                </button>
              ))}
            </div>

            {form.ownership === 'SHARED' && (
              <div className="mt-4 space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <h3 className="text-sm font-semibold">Contribution parties</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {PROMOTION_CONTRIBUTION_SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`rounded-lg border px-3 py-3 text-left transition ${
                          form.contributionSource === opt.value
                            ? 'border-brand bg-brand/10'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                        onClick={() => update('contributionSource', opt.value)}
                      >
                        <span className="block text-sm font-semibold">{opt.label}</span>
                        <span className="mt-1 block text-xs text-gray-500">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold">Default cost sharing split</h3>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-gray-500">Branch share %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        value={form.branchSharePct}
                        onChange={(e) => {
                          const branch = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                          const platform = 100 - branch;
                          setForm((f) => ({
                            ...f,
                            branchSharePct: branch,
                            platformSharePct: platform,
                            branchShareSplits: seedBranchShareSplits(
                              allStoreIds,
                              {},
                              { branchSharePct: branch, platformSharePct: platform },
                            ),
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">
                        {contributionSourceLabel(form.contributionSource)} share %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        value={form.platformSharePct}
                        onChange={(e) => {
                          const platform = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                          const branch = 100 - platform;
                          setForm((f) => ({
                            ...f,
                            branchSharePct: branch,
                            platformSharePct: platform,
                            branchShareSplits: seedBranchShareSplits(
                              allStoreIds,
                              {},
                              { branchSharePct: branch, platformSharePct: platform },
                            ),
                          }));
                        }}
                      />
                    </div>
                  </div>
                  {form.branchSharePct + form.platformSharePct !== 100 && (
                    <p className="mt-2 text-xs text-amber-600">Percentages must total 100%</p>
                  )}
                </div>

                {storeList.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Per-branch cost sharing</h3>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold dark:border-gray-600"
                        onClick={() => {
                          setShowContributionPdf(true);
                          window.setTimeout(() => printAdminReport('full'), 50);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export PDF
                      </button>
                    </div>
                    <div className="relative mt-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                        placeholder="Search branches…"
                        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                        aria-label="Search branches"
                      />
                    </div>
                    <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-800">
                        <span>Branch</span>
                        <span>Branch %</span>
                        <span>{contributionSourceLabel(form.contributionSource)} %</span>
                      </div>
                      {filteredStoreList.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-gray-500">No branches match your search.</p>
                      ) : (
                        filteredStoreList.map((store) => {
                        const split =
                          form.branchShareSplits[store.id]
                          ?? defaultBranchShareSplit(form.branchSharePct, form.platformSharePct);
                        const invalid = split.branchSharePct + split.platformSharePct !== 100;
                        return (
                          <div
                            key={store.id}
                            className={`grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-0 dark:border-gray-800 ${
                              invalid ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                            }`}
                          >
                            <span className="truncate text-sm">{branchDisplayName(store.name)}</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="w-full rounded border px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                              value={split.branchSharePct}
                              onChange={(e) => {
                                const branch = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                setForm((f) => ({
                                  ...f,
                                  branchShareSplits: {
                                    ...f.branchShareSplits,
                                    [store.id]: { branchSharePct: branch, platformSharePct: 100 - branch },
                                  },
                                }));
                              }}
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="w-full rounded border px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                              value={split.platformSharePct}
                              onChange={(e) => {
                                const platform = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                setForm((f) => ({
                                  ...f,
                                  branchShareSplits: {
                                    ...f.branchShareSplits,
                                    [store.id]: { branchSharePct: 100 - platform, platformSharePct: platform },
                                  },
                                }));
                              }}
                            />
                          </div>
                        );
                      })
                      )}
                    </div>
                  </div>
                )}

                {showContributionPdf && (
                  <AdminPrintCanvas variant="full" reportId="loyalty-contribution">
                    <AdminReportPdf
                      reportTitle="New customer journey — cost sharing"
                      filterLabel={`Ownership: Shared · Party: ${contributionSourceLabel(form.contributionSource)}`}
                      showStats={false}
                      columns={['Branch', 'Branch %', `${contributionSourceLabel(form.contributionSource)} %`, 'Party']}
                      rows={contributionPdfRows}
                      alignRightFromColumn={1}
                      footer="Bing Chun Admin · New customer journey contribution"
                    />
                  </AdminPrintCanvas>
                )}
              </div>
            )}
          </section>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={readOnly || saveMutation.isPending}
          onClick={() => {
            const ownership = branchMode ? 'BRANCH' as const : form.ownership;
            const branchSharePct = branchMode ? 100 : form.branchSharePct;
            const platformSharePct = branchMode ? 0 : form.platformSharePct;
            const contributionSource = ownership === 'SHARED' ? form.contributionSource : 'JASON';
            const branchShareSplits =
              ownership === 'SHARED'
                ? seedBranchShareSplits(
                    allStoreIds,
                    form.branchShareSplits,
                    defaultBranchShareSplit(branchSharePct, platformSharePct),
                  )
                : {};

            if (!branchMode) {
              const shareErr = validateSharedPromotionShares(ownership, branchSharePct, platformSharePct);
              if (shareErr) {
                toast.error(shareErr);
                return;
              }
              const splitErr = validateSelectedBranchShareSplits(
                ownership,
                'selected',
                allStoreIds,
                branchShareSplits,
              );
              if (splitErr) {
                toast.error(splitErr);
                return;
              }
            }

            saveMutation.mutate({
              ...form,
              ownership,
              contributionSource,
              branchSharePct,
              platformSharePct,
              branchShareSplits,
            });
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          Save journey
        </button>
        {(branchMode ? customizing && data?.override : selectedStoreId && hasOverride) && (
          <button
            type="button"
            disabled={resetMutation.isPending}
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Reset to platform defaults?',
                message: 'This removes the branch override. Platform rules will apply again.',
                confirmLabel: 'Reset',
              });
              if (ok) resetMutation.mutate();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to platform
          </button>
        )}
      </div>
    </div>
  );
}
