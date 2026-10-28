'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus, Save, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';

function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return data.data ?? data;
  });
}

type TierRow = {
  id: string;
  name: string;
  minSpendLkr: number;
  emoji: string;
  perk: string;
  accent?: string;
};

type RedeemRow = {
  id: string;
  title: string;
  description: string;
  cost: number;
  emoji: string;
  tag?: string;
  isActive?: boolean;
};

type OfferRow = {
  id: string;
  title: string;
  date: string;
  description: string;
  emoji: string;
  isActive?: boolean;
};

export default function LoyaltyProgramSettings() {
  const qc = useQueryClient();
  const [lkrPerPoint, setLkrPerPoint] = useState('100');
  const [redeemValue, setRedeemValue] = useState('1');
  const [maxRedeemPct, setMaxRedeemPct] = useState('100');
  const [minOrderToEarn, setMinOrderToEarn] = useState('200');
  const [referralBonusPoints, setReferralBonusPoints] = useState('100');
  const [customerRedeemEnabled, setCustomerRedeemEnabled] = useState(true);
  const [checkoutRedeemEnabled, setCheckoutRedeemEnabled] = useState(true);
  const [minPointsToRedeem, setMinPointsToRedeem] = useState('100');
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [redeemRewards, setRedeemRewards] = useState<RedeemRow[]>([]);
  const [upcomingOffers, setUpcomingOffers] = useState<OfferRow[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-loyalty-program'],
    queryFn: () => adminFetch('/settings/loyalty-program'),
  });

  useEffect(() => {
    if (!data) return;
    setLkrPerPoint(String(data.lkrPerPoint ?? 100));
    setRedeemValue(String(data.redeemValue ?? 1));
    setMaxRedeemPct(String(data.maxRedeemPct ?? 100));
    setMinOrderToEarn(String(data.minOrderToEarn ?? 200));
    setReferralBonusPoints(String(data.referralBonusPoints ?? 100));
    setCustomerRedeemEnabled(data.customerRedeemEnabled !== false);
    setCheckoutRedeemEnabled(data.checkoutRedeemEnabled !== false);
    setMinPointsToRedeem(String(data.minPointsToRedeem ?? 100));
    setTiers(data.tiers ?? []);
    setRedeemRewards(data.redeemRewards ?? []);
    setUpcomingOffers(data.upcomingOffers ?? []);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      adminFetch('/settings/loyalty-program', {
        method: 'PUT',
        body: JSON.stringify({
          lkrPerPoint: parseInt(lkrPerPoint, 10) || 100,
          redeemValue: parseFloat(redeemValue) || 1,
          maxRedeemPct: parseInt(maxRedeemPct, 10) || 100,
          minOrderToEarn: parseInt(minOrderToEarn, 10) || 200,
          referralBonusPoints: parseInt(referralBonusPoints, 10) || 100,
          customerRedeemEnabled,
          checkoutRedeemEnabled,
          minPointsToRedeem: Math.max(0, parseInt(minPointsToRedeem, 10) || 0),
          tiers,
          redeemRewards,
          upcomingOffers,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-loyalty-program'] });
      qc.invalidateQueries({ queryKey: ['loyalty-summary'] });
      toast.success('Loyalty & offer settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="card p-6 text-center text-muted">Loading loyalty settings…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
          <Star size={18} className="text-brand" />
          Loyalty program settings
        </h2>
        <p className="text-xs text-muted mb-4">
          Control how customers earn and redeem points across the rewards dashboard and checkout.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-4xl mb-5">
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Show redeem on customer account</p>
              <p className="text-xs text-muted mt-1">
                When off, the rewards catalog and redeem copy are hidden on the loyalty dashboard.
              </p>
            </div>
            <input
              type="checkbox"
              checked={customerRedeemEnabled}
              onChange={(e) => setCustomerRedeemEnabled(e.target.checked)}
              className="w-5 h-5 accent-brand mt-0.5 shrink-0"
            />
          </label>
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Allow redeem at checkout</p>
              <p className="text-xs text-muted mt-1">
                When off, customers cannot apply points on the checkout page.
              </p>
            </div>
            <input
              type="checkbox"
              checked={checkoutRedeemEnabled}
              onChange={(e) => setCheckoutRedeemEnabled(e.target.checked)}
              className="w-5 h-5 accent-brand mt-0.5 shrink-0"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
          <div>
            <label className="text-xs text-muted block mb-1">LKR spent per 1 point</label>
            <input
              className="input-field"
              type="number"
              min={1}
              value={lkrPerPoint}
              onChange={(e) => setLkrPerPoint(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Point value at checkout (LKR)</label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              min={0.01}
              value={redeemValue}
              onChange={(e) => setRedeemValue(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Max redeem per order (%)</label>
            <input
              className="input-field"
              type="number"
              min={1}
              max={100}
              value={maxRedeemPct}
              onChange={(e) => setMaxRedeemPct(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Minimum order to earn (LKR)</label>
            <input
              className="input-field"
              type="number"
              min={0}
              value={minOrderToEarn}
              onChange={(e) => setMinOrderToEarn(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Min points to unlock checkout redeem</label>
            <input
              className="input-field"
              type="number"
              min={0}
              value={minPointsToRedeem}
              onChange={(e) => setMinPointsToRedeem(e.target.value)}
            />
            <p className="text-[11px] text-muted mt-1">
              Customers must earn this many points first. After that, any balance can be redeemed.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Referral bonus (points)</label>
            <input
              className="input-field"
              type="number"
              min={0}
              value={referralBonusPoints}
              onChange={(e) => setReferralBonusPoints(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-white mb-2">Membership tiers</h2>
        <p className="text-xs text-muted mb-4">Spend thresholds and perks shown on the loyalty dashboard.</p>
        <div className="space-y-3">
          {tiers.map((tier, index) => (
            <div key={tier.id || index} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 p-3 rounded-xl border border-navy-border">
              <input className="input-field text-sm" value={tier.name} placeholder="Name" onChange={(e) => setTiers((rows) => rows.map((r, i) => i === index ? { ...r, name: e.target.value } : r))} />
              <input className="input-field text-sm" type="number" value={tier.minSpendLkr} placeholder="Min spend" onChange={(e) => setTiers((rows) => rows.map((r, i) => i === index ? { ...r, minSpendLkr: parseInt(e.target.value, 10) || 0 } : r))} />
              <input className="input-field text-sm" value={tier.emoji} placeholder="Emoji" onChange={(e) => setTiers((rows) => rows.map((r, i) => i === index ? { ...r, emoji: e.target.value } : r))} />
              <input className="input-field text-sm lg:col-span-2" value={tier.perk} placeholder="Perk description" onChange={(e) => setTiers((rows) => rows.map((r, i) => i === index ? { ...r, perk: e.target.value } : r))} />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Gift size={18} className="text-brand" />
              Redeem rewards catalog
            </h2>
            <p className="text-xs text-muted mt-1">Items customers can redeem with points.</p>
          </div>
          <button
            type="button"
            className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1"
            onClick={() =>
              setRedeemRewards((rows) => [
                ...rows,
                {
                  id: `reward-${Date.now()}`,
                  title: 'New reward',
                  description: 'Description',
                  cost: 100,
                  emoji: '🎁',
                  isActive: true,
                },
              ])
            }
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="space-y-3">
          {redeemRewards.map((row, index) => (
            <div key={row.id || index} className="p-3 rounded-xl border border-navy-border space-y-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input className="input-field text-sm" value={row.title} onChange={(e) => setRedeemRewards((rows) => rows.map((r, i) => i === index ? { ...r, title: e.target.value } : r))} />
                <input className="input-field text-sm" type="number" value={row.cost} onChange={(e) => setRedeemRewards((rows) => rows.map((r, i) => i === index ? { ...r, cost: parseInt(e.target.value, 10) || 0 } : r))} />
                <input className="input-field text-sm" value={row.emoji} onChange={(e) => setRedeemRewards((rows) => rows.map((r, i) => i === index ? { ...r, emoji: e.target.value } : r))} />
                <input className="input-field text-sm" value={row.tag ?? ''} placeholder="Tag (optional)" onChange={(e) => setRedeemRewards((rows) => rows.map((r, i) => i === index ? { ...r, tag: e.target.value || undefined } : r))} />
              </div>
              <textarea className="input-field text-sm min-h-[60px]" value={row.description} onChange={(e) => setRedeemRewards((rows) => rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                  <input type="checkbox" checked={row.isActive !== false} onChange={(e) => setRedeemRewards((rows) => rows.map((r, i) => i === index ? { ...r, isActive: e.target.checked } : r))} />
                  Active
                </label>
                <button type="button" className="text-red-400 hover:text-red-300" onClick={() => setRedeemRewards((rows) => rows.filter((_, i) => i !== index))} aria-label="Remove reward">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-white">Upcoming offers</h2>
            <p className="text-xs text-muted mt-1">Promotional offers shown on the loyalty dashboard sidebar.</p>
          </div>
          <button
            type="button"
            className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1"
            onClick={() =>
              setUpcomingOffers((rows) => [
                ...rows,
                {
                  id: `offer-${Date.now()}`,
                  title: 'New offer',
                  date: 'Coming soon',
                  description: 'Offer details',
                  emoji: '✨',
                  isActive: true,
                },
              ])
            }
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="space-y-3">
          {upcomingOffers.map((row, index) => (
            <div key={row.id || index} className="p-3 rounded-xl border border-navy-border space-y-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input className="input-field text-sm" value={row.title} onChange={(e) => setUpcomingOffers((rows) => rows.map((r, i) => i === index ? { ...r, title: e.target.value } : r))} />
                <input className="input-field text-sm" value={row.date} onChange={(e) => setUpcomingOffers((rows) => rows.map((r, i) => i === index ? { ...r, date: e.target.value } : r))} />
                <input className="input-field text-sm" value={row.emoji} onChange={(e) => setUpcomingOffers((rows) => rows.map((r, i) => i === index ? { ...r, emoji: e.target.value } : r))} />
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                  <input type="checkbox" checked={row.isActive !== false} onChange={(e) => setUpcomingOffers((rows) => rows.map((r, i) => i === index ? { ...r, isActive: e.target.checked } : r))} />
                  Active
                </label>
              </div>
              <textarea className="input-field text-sm min-h-[60px]" value={row.description} onChange={(e) => setUpcomingOffers((rows) => rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} />
              <button type="button" className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1" onClick={() => setUpcomingOffers((rows) => rows.filter((_, i) => i !== index))}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="btn-primary flex items-center gap-2 px-6 py-3"
      >
        <Save size={16} />
        {save.isPending ? 'Saving loyalty settings…' : 'Save loyalty & offers'}
      </button>
    </div>
  );
}
