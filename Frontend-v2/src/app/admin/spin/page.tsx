'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, Trash2, Dices, Gift, Save, Settings2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/store/confirmStore';
import { SPIN_OFFERS_QUERY_KEY } from '@/lib/spinOffers';
import { getAdminSession, isBranchAdmin, isSuperAdmin } from '@/lib/adminAuth';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useRouter } from 'next/navigation';
import SpinGiftProductModal, {
  type SpinGiftProductOption,
} from '@/components/admin/SpinGiftProductModal';
import {
  DEFAULT_SPIN_DISPLAY,
  newSpinCriterion,
  parseSpinCriteria,
  parseSpinDisplay,
  SPIN_CRITERION_OPTIONS,
  type SpinCriterion,
  type SpinCriterionType,
  type SpinDisplaySettings,
  type SpinPopupPages,
} from '@/lib/spinDisplay';

function adminFetch(endpoint: string, options?: RequestInit) {
  return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    return d.data ?? d;
  });
}

const EMPTY = {
  label: '',
  description: '',
  offerType: 'PERCENTAGE',
  discountValue: '',
  winRate: '10',
  color: '#307ef2',
  sortOrder: '0',
  minOrderValue: '0',
  giftProductId: '',
  isActive: true,
};

const TYPE_OPTIONS = [
  { value: 'PERCENTAGE', label: 'Percentage off (%)' },
  { value: 'FIXED', label: 'Fixed amount (LKR)' },
  { value: 'FREE_DELIVERY', label: 'Free delivery' },
  { value: 'GIFT', label: 'Gift product (free item)' },
  { value: 'NO_PRIZE', label: 'No prize (Try again)' },
];

type MenuProduct = {
  id: string;
  name: string;
  basePrice: number;
  imageUrl?: string | null;
  category?: { name: string };
};

const DAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export default function AdminSpinPage() {
  const router = useRouter();
  const admin = typeof window !== 'undefined' ? getAdminSession() : null;
  const branchMode = isBranchAdmin(admin);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [spinEnabled, setSpinEnabled] = useState(true);
  const [spinDaysOfWeek, setSpinDaysOfWeek] = useState<string[]>([]);
  const [spinTimeStart, setSpinTimeStart] = useState('');
  const [spinTimeEnd, setSpinTimeEnd] = useState('');
  const [spinStartsAt, setSpinStartsAt] = useState('');
  const [spinExpiresAt, setSpinExpiresAt] = useState('');
  const [spinMaxPerDay, setSpinMaxPerDay] = useState('');
  const [spinMaxPerCustomer, setSpinMaxPerCustomer] = useState('');
  const [spinDurationSeconds, setSpinDurationSeconds] = useState('8');
  const [spinsPerWindow, setSpinsPerWindow] = useState('1');
  const [spinWindowValue, setSpinWindowValue] = useState('1');
  const [spinWindowUnit, setSpinWindowUnit] = useState<'hours' | 'days'>('days');
  const [spinTrackByIp, setSpinTrackByIp] = useState(true);
  const [spinDisplay, setSpinDisplay] = useState<SpinDisplaySettings>({ ...DEFAULT_SPIN_DISPLAY });
  const [spinCriteria, setSpinCriteria] = useState<SpinCriterion[]>([]);
  const [addCriterionType, setAddCriterionType] = useState<SpinCriterionType | ''>('');
  const [giftPickerTarget, setGiftPickerTarget] = useState<
    null | { mode: 'form' } | { mode: 'offer'; offerId: string; selectedId?: string | null }
  >(null);
  const qc = useQueryClient();

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isSuperAdmin(session)) {
      router.replace('/admin');
    }
  }, [router]);

  const { data: appSettings } = useQuery({
    queryKey: ['admin-app-settings'],
    queryFn: () => adminFetch('/settings/app'),
  });

  useEffect(() => {
    if (!appSettings) return;
    setSpinEnabled(appSettings.spinEnabled !== false);
    setSpinDaysOfWeek(Array.isArray(appSettings.spinDaysOfWeek) ? appSettings.spinDaysOfWeek : []);
    setSpinTimeStart(appSettings.spinTimeStart ?? '');
    setSpinTimeEnd(appSettings.spinTimeEnd ?? '');
    setSpinStartsAt(appSettings.spinStartsAt ? appSettings.spinStartsAt.slice(0, 16) : '');
    setSpinExpiresAt(appSettings.spinExpiresAt ? appSettings.spinExpiresAt.slice(0, 16) : '');
    setSpinMaxPerDay(appSettings.spinMaxPerDay != null ? String(appSettings.spinMaxPerDay) : '');
    setSpinMaxPerCustomer(
      appSettings.spinMaxPerCustomer != null ? String(appSettings.spinMaxPerCustomer) : '',
    );
    setSpinDurationSeconds(String(appSettings.spinDurationSeconds ?? 8));
    setSpinsPerWindow(String(appSettings.spinsPerWindow ?? 1));
    const hours = appSettings.spinWindowHours ?? 24;
    if (hours % 24 === 0 && hours >= 24) {
      setSpinWindowUnit('days');
      setSpinWindowValue(String(hours / 24));
    } else {
      setSpinWindowUnit('hours');
      setSpinWindowValue(String(hours));
    }
    setSpinTrackByIp(appSettings.spinTrackByIp !== false);
    setSpinDisplay(parseSpinDisplay(appSettings.spinDisplay));
    const loaded = parseSpinCriteria(appSettings.spinCriteria);
    if (loaded.length > 0) {
      setSpinCriteria(loaded);
    } else {
      const legacy: SpinCriterion[] = [];
      if (appSettings.spinRequireLogin) legacy.push(newSpinCriterion('REQUIRE_LOGIN'));
      if (appSettings.spinFirstOrderOnly) legacy.push(newSpinCriterion('FIRST_ORDER_ONLY'));
      setSpinCriteria(legacy);
    }
  }, [appSettings]);

  const saveRulesMutation = useMutation({
    mutationFn: () => {
      const spinWindowHours =
        spinWindowUnit === 'days'
          ? Math.min(720, Math.max(1, parseInt(spinWindowValue, 10) || 1) * 24)
          : Math.min(720, Math.max(1, parseInt(spinWindowValue, 10) || 1));
      return adminFetch('/settings/app', {
        method: 'PUT',
        body: JSON.stringify({
          spinEnabled,
          spinFirstOrderOnly: spinCriteria.some((c) => c.type === 'FIRST_ORDER_ONLY'),
          spinRequireLogin: spinCriteria.some((c) => c.type === 'REQUIRE_LOGIN'),
          spinDaysOfWeek: spinDaysOfWeek.length > 0 ? spinDaysOfWeek : [],
          spinTimeStart: spinTimeStart || null,
          spinTimeEnd: spinTimeEnd || null,
          spinStartsAt: spinStartsAt ? new Date(spinStartsAt).toISOString() : null,
          spinExpiresAt: spinExpiresAt ? new Date(spinExpiresAt).toISOString() : null,
          spinMaxPerDay: spinMaxPerDay ? parseInt(spinMaxPerDay, 10) : null,
          spinMaxPerCustomer: spinMaxPerCustomer ? parseInt(spinMaxPerCustomer, 10) : null,
          spinDurationSeconds: parseInt(spinDurationSeconds, 10) || 8,
          spinsPerWindow: parseInt(spinsPerWindow, 10) || 1,
          spinWindowHours,
          spinTrackByIp,
          spinDisplay,
          spinCriteria,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      toast.success('Spin rules saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save rules'),
  });

  function addCriterion() {
    if (!addCriterionType) return;
    if (spinCriteria.some((c) => c.type === addCriterionType)) {
      toast.error('That criterion is already added');
      return;
    }
    let next = [...spinCriteria, newSpinCriterion(addCriterionType)];
    if (addCriterionType === 'FIRST_ORDER_ONLY') {
      next = next.filter((c) => c.type !== 'RETURNING_CUSTOMERS');
    }
    if (addCriterionType === 'RETURNING_CUSTOMERS') {
      next = next.filter((c) => c.type !== 'FIRST_ORDER_ONLY');
    }
    setSpinCriteria(next);
    setAddCriterionType('');
  }

  function updateCriterionValue(id: string, value: string) {
    setSpinCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, value: Math.max(0, parseInt(value, 10) || 0) } : c)),
    );
  }

  function removeCriterion(id: string) {
    setSpinCriteria((prev) => prev.filter((c) => c.id !== id));
  }

  function updateDisplay<K extends keyof SpinDisplaySettings>(key: K, value: SpinDisplaySettings[K]) {
    setSpinDisplay((prev) => ({ ...prev, [key]: value }));
  }

  const { data } = useQuery<{ offers: any[]; totalWeight: number }>({
    queryKey: ['admin-spin-offers', branchMode ? 'branch' : selectedStoreId || 'platform'],
    queryFn: () =>
      adminFetch(
        branchMode || !selectedStoreId
          ? '/spin/admin/offers'
          : `/spin/admin/offers?storeId=${encodeURIComponent(selectedStoreId)}`,
      ),
  });

  const { data: stores } = useQuery({
    queryKey: ['admin-stores-spin'],
    queryFn: () => adminFetch('/stores'),
    enabled: !branchMode,
  });

  const { data: products = [] } = useQuery<MenuProduct[]>({
    queryKey: ['admin-products-for-spin'],
    queryFn: () => adminFetch('/menu/products'),
  });

  const offers = data?.offers ?? [];
  const totalWeight = data?.totalWeight || 0;
  const selectedGift = products.find((p) => p.id === form.giftProductId);

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      adminFetch('/spin/admin/offers', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          ...(selectedStoreId && !branchMode ? { storeId: selectedStoreId } : {}),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-spin-offers'] });
      setForm(EMPTY);
      setShowForm(false);
      toast.success('Spin offer created');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) =>
      adminFetch(`/spin/admin/offers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-spin-offers'] });
      toast.success('Updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/spin/admin/offers/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      qc.setQueryData<{ offers: any[]; totalWeight: number } | undefined>(
        ['admin-spin-offers'],
        (old) => {
          if (!old) return old;
          const offers = old.offers.filter((o) => o.id !== id);
          const totalWeight = offers.filter((o) => o.isActive).reduce((s, o) => s + o.winRate, 0);
          return { offers, totalWeight };
        },
      );
      qc.invalidateQueries({ queryKey: ['admin-spin-offers'] });
      qc.invalidateQueries({ queryKey: SPIN_OFFERS_QUERY_KEY });
      toast.success('Offer removed');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (form.offerType === 'GIFT' && !form.giftProductId) {
      toast.error('Select a gift product');
      return;
    }
    createMutation.mutate({
      label: form.label,
      description: form.description || undefined,
      offerType: form.offerType,
      discountValue: form.discountValue ? parseInt(form.discountValue, 10) : 0,
      winRate: parseFloat(form.winRate),
      color: form.color,
      sortOrder: parseInt(form.sortOrder || '0', 10),
      minOrderValue: parseInt(form.minOrderValue || '0', 10),
      giftProductId: form.offerType === 'GIFT' ? form.giftProductId : null,
      isActive: true,
    });
  }

  function valueCell(o: any) {
    if (o.offerType === 'PERCENTAGE') return `${o.discountValue}%`;
    if (o.offerType === 'FIXED') return `LKR ${o.discountValue}`;
    if (o.offerType === 'GIFT') return o.giftProduct?.name ? `🎁 ${o.giftProduct.name}` : 'Gift';
    if (o.offerType === 'FREE_DELIVERY') return 'Free delivery';
    return '—';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Dices size={22} className="text-brand" /> Spin Wheel
          </h1>
          <p className="text-muted text-sm mt-1">
            {offers.length} segments · active weight total {totalWeight.toFixed(1)}
            {totalWeight > 0 ? ' (relative %)' : ''}
          </p>
        </div>
      </div>

      {!branchMode && (
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
          <Settings2 size={18} className="text-brand" />
          Spin wheel rules
        </h2>
        <p className="text-xs text-muted mb-4">
          Leave eligibility empty to show the wheel to anyone (within usage limits). Add criteria only when you want extra gates.
          Configure how the wheel appears below.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer sm:col-span-2 lg:col-span-3">
            <div>
              <p className="text-sm font-medium text-white">Spin wheel enabled</p>
              <p className="text-xs text-muted mt-1">Master switch — hides the wheel from customers when off.</p>
            </div>
            <input
              type="checkbox"
              checked={spinEnabled}
              onChange={(e) => setSpinEnabled(e.target.checked)}
              className="w-5 h-5 accent-brand mt-0.5 shrink-0"
            />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-navy-border p-4">
          <h3 className="text-sm font-semibold text-white mb-1">How it shows</h3>
          <p className="text-xs text-muted mb-3">Control auto-popup, buttons, pages, and try-again hide timing.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start justify-between gap-3 rounded-lg border border-navy-border p-3 cursor-pointer">
              <div>
                <p className="text-sm text-white">Auto-open popup</p>
                <p className="text-[11px] text-muted mt-0.5">Opens automatically when eligible</p>
              </div>
              <input
                type="checkbox"
                checked={spinDisplay.autoPopup}
                onChange={(e) => updateDisplay('autoPopup', e.target.checked)}
                className="w-4 h-4 accent-brand mt-0.5"
              />
            </label>
            <label className="flex items-start justify-between gap-3 rounded-lg border border-navy-border p-3 cursor-pointer">
              <div>
                <p className="text-sm text-white">Header spin button</p>
                <p className="text-[11px] text-muted mt-0.5">Show in the site navbar</p>
              </div>
              <input
                type="checkbox"
                checked={spinDisplay.showHeaderButton}
                onChange={(e) => updateDisplay('showHeaderButton', e.target.checked)}
                className="w-4 h-4 accent-brand mt-0.5"
              />
            </label>
            <label className="flex items-start justify-between gap-3 rounded-lg border border-navy-border p-3 cursor-pointer">
              <div>
                <p className="text-sm text-white">Floating spin button</p>
                <p className="text-[11px] text-muted mt-0.5">Show the rewards FAB on storefront pages</p>
              </div>
              <input
                type="checkbox"
                checked={spinDisplay.showFab}
                onChange={(e) => updateDisplay('showFab', e.target.checked)}
                className="w-4 h-4 accent-brand mt-0.5"
              />
            </label>
            <div className="rounded-lg border border-navy-border p-3">
              <label className="text-xs text-muted block mb-1">Auto-popup pages</label>
              <select
                className="input-field"
                value={spinDisplay.popupPages}
                onChange={(e) => updateDisplay('popupPages', e.target.value as SpinPopupPages)}
              >
                <option value="HOME">Home only</option>
                <option value="HOME_AND_ORDER">Home + order tracking</option>
                <option value="ALL">All storefront pages</option>
              </select>
            </div>
            <div className="rounded-lg border border-navy-border p-3 sm:col-span-2">
              <label className="text-xs text-muted block mb-1">Hide “Try again” result after (seconds)</label>
              <input
                className="input-field max-w-[140px]"
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={spinDisplay.loseAutoHideSeconds}
                onChange={(e) => updateDisplay('loseAutoHideSeconds', Number(e.target.value) || 0)}
              />
              <p className="text-[11px] text-muted mt-1">0 keeps the try-again screen open until closed.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-navy-border p-4">
          <h3 className="text-sm font-semibold text-white mb-1">Eligibility criteria</h3>
          <p className="text-xs text-muted mb-3">
            Empty list = anyone can spin (subject to schedule and usage limits). Add criteria to tighten who sees the wheel.
          </p>
          {spinCriteria.length === 0 ? (
            <p className="text-xs text-brand mb-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2">
              No extra criteria — the spin wheel is open to eligible customers.
            </p>
          ) : (
            <div className="space-y-2 mb-3">
              {spinCriteria.map((criterion) => {
                const meta = SPIN_CRITERION_OPTIONS.find((o) => o.type === criterion.type);
                return (
                  <div
                    key={criterion.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-navy-border bg-navy-light/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">{meta?.label ?? criterion.type}</p>
                      <p className="text-[11px] text-muted">{meta?.hint}</p>
                    </div>
                    {meta?.needsValue && (
                      <input
                        className="input-field w-28"
                        type="number"
                        min={1}
                        value={criterion.value ?? ''}
                        onChange={(e) => updateCriterionValue(criterion.id, e.target.value)}
                        placeholder={meta.needsValue === 'spend' ? 'LKR' : 'Orders'}
                      />
                    )}
                    <button
                      type="button"
                      className="rounded-lg border border-navy-border p-2 text-muted hover:text-white"
                      onClick={() => removeCriterion(criterion.id)}
                      aria-label="Remove criterion"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              className="input-field flex-1 min-w-[220px]"
              value={addCriterionType}
              onChange={(e) => setAddCriterionType(e.target.value as SpinCriterionType | '')}
            >
              <option value="">Add a criterion…</option>
              {SPIN_CRITERION_OPTIONS.filter((o) => !spinCriteria.some((c) => c.type === o.type)).map((o) => (
                <option key={o.type} value={o.type}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-outline px-4 py-2 text-sm" onClick={addCriterion} disabled={!addCriterionType}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-5">
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Count by IP address</p>
              <p className="text-xs text-muted mt-1">Limit spins from the same network.</p>
            </div>
            <input
              type="checkbox"
              checked={spinTrackByIp}
              onChange={(e) => setSpinTrackByIp(e.target.checked)}
              className="w-5 h-5 accent-brand mt-0.5 shrink-0"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-muted mb-2">Active days (leave empty for every day)</p>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const active = spinDaysOfWeek.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setSpinDaysOfWeek((prev) =>
                        active ? prev.filter((d) => d !== day) : [...prev, day],
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-brand text-white border-brand'
                        : 'border-navy-border text-muted hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Daily time window start</label>
            <input className="input-field" type="time" value={spinTimeStart} onChange={(e) => setSpinTimeStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Daily time window end</label>
            <input className="input-field" type="time" value={spinTimeEnd} onChange={(e) => setSpinTimeEnd(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Campaign starts</label>
            <input className="input-field" type="datetime-local" value={spinStartsAt} onChange={(e) => setSpinStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Campaign ends</label>
            <input className="input-field" type="datetime-local" value={spinExpiresAt} onChange={(e) => setSpinExpiresAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Max spins per day (per customer)</label>
            <input className="input-field" type="number" min={1} placeholder="Unlimited" value={spinMaxPerDay} onChange={(e) => setSpinMaxPerDay(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Max spins per customer (lifetime)</label>
            <input className="input-field" type="number" min={1} placeholder="Unlimited" value={spinMaxPerCustomer} onChange={(e) => setSpinMaxPerCustomer(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Spin animation (seconds)</label>
            <input className="input-field" type="number" min={3} max={20} value={spinDurationSeconds} onChange={(e) => setSpinDurationSeconds(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Spins allowed per window</label>
            <input className="input-field" type="number" min={1} max={10} value={spinsPerWindow} onChange={(e) => setSpinsPerWindow(e.target.value)} />
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs text-muted block mb-1">Window before next spin</label>
            <div className="grid grid-cols-[minmax(9rem,1fr)_9rem] gap-2">
              <input
                className="input-field min-w-[9rem]"
                type="number"
                min={1}
                value={spinWindowValue}
                onChange={(e) => setSpinWindowValue(e.target.value)}
              />
              <select
                className="input-field"
                value={spinWindowUnit}
                onChange={(e) => setSpinWindowUnit(e.target.value === 'days' ? 'days' : 'hours')}
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => saveRulesMutation.mutate()}
          disabled={saveRulesMutation.isPending}
          className="btn-primary mt-5 px-5 py-2.5 text-sm flex items-center gap-2"
        >
          <Save size={15} />
          {saveRulesMutation.isPending ? 'Saving…' : 'Save spin rules'}
        </button>
      </div>
      )}

      {!branchMode && (
        <div className="card p-4 mb-6">
          <label className="text-sm text-muted block mb-2">Prize wheel scope</label>
          <select
            className="w-full rounded-lg border border-navy-border bg-navy px-3 py-2 text-sm text-white"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            <option value="">Platform default wheel</option>
            {(stores ?? []).map((s: { id: string; name: string; city: string }) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.city}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-2">
            Branch wheels override the platform wheel when the branch has its own prizes. Add the
            “Loyalty journey unlock” criterion above if the wheel should wait for Offer 3.
          </p>
        </div>
      )}

      <div className="card p-4 mb-6 text-sm text-muted">
        Win rates are relative weights. Example: 20 + 30 + 50 = 100 → 20%, 30%, 50% chance.
        For <span className="text-white">Gift product</span>, pick a menu item — it is added free at checkout.
      </div>

      {branchMode && (
        <div className="card p-4 mb-6 text-sm text-muted">
          Managing spin prizes for your branch. Platform spin rules (how it shows / criteria) are set by system admin.
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-navy-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Wheel segments</h2>
            <p className="text-xs text-muted mt-0.5">Add and manage prizes shown on the spin wheel.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="btn-primary px-4 py-2 text-sm shrink-0"
          >
            <Plus size={15} /> {showForm ? 'Close form' : 'Add Offer'}
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-navy-border"
            >
              <div className="p-4 sm:p-5">
                <h3 className="font-semibold text-white mb-4">New spin offer</h3>
                <form onSubmit={submitForm} className="grid sm:grid-cols-2 gap-4">
                  <input
                    className="input-field"
                    placeholder="Label (shown on wheel)"
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    required
                  />
                  <select
                    className="input-field"
                    value={form.offerType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        offerType: e.target.value,
                        giftProductId: e.target.value === 'GIFT' ? f.giftProductId : '',
                        discountValue:
                          e.target.value === 'GIFT' || e.target.value === 'FREE_DELIVERY' || e.target.value === 'NO_PRIZE'
                            ? ''
                            : f.discountValue,
                      }))
                    }
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {form.offerType !== 'GIFT' && (
                    <p className="sm:col-span-2 text-xs text-amber-400/90 -mt-2">
                      Tip: for a free menu item, choose <span className="font-semibold">Gift product (free item)</span> and pick the product below.
                    </p>
                  )}

                  {form.offerType === 'GIFT' ? (
                    <div className="sm:col-span-2 space-y-2">
                      <label className="text-xs text-muted flex items-center gap-1.5">
                        <Gift size={12} className="text-brand" /> Gift product
                      </label>
                      {selectedGift ? (
                        <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2.5">
                          {selectedGift.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={selectedGift.imageUrl}
                              alt=""
                              className="h-12 w-12 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-navy-light flex items-center justify-center shrink-0">
                              <Gift size={18} className="text-brand" />
                            </div>
                          )}
                          <div className="text-left min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{selectedGift.name}</p>
                            <p className="text-xs text-muted">
                              {selectedGift.category?.name ? `${selectedGift.category.name} · ` : ''}
                              Added free at checkout · LKR {selectedGift.basePrice.toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-navy-border px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-light"
                            onClick={() => setGiftPickerTarget({ mode: 'form' })}
                          >
                            <Pencil size={12} aria-hidden />
                            Edit
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
                          onClick={() => setGiftPickerTarget({ mode: 'form' })}
                        >
                          <Gift size={14} aria-hidden />
                          Choose product
                        </button>
                      )}
                    </div>
                  ) : (
                    <input
                      className="input-field"
                      type="number"
                      placeholder={
                        form.offerType === 'PERCENTAGE'
                          ? 'Discount %'
                          : form.offerType === 'FIXED'
                            ? 'Discount LKR'
                            : 'Value (0 for free delivery / no prize)'
                      }
                      value={form.discountValue}
                      onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                      disabled={form.offerType === 'FREE_DELIVERY' || form.offerType === 'NO_PRIZE'}
                      required={form.offerType === 'PERCENTAGE' || form.offerType === 'FIXED'}
                    />
                  )}

                  <input
                    className="input-field"
                    type="number"
                    step="0.1"
                    placeholder="Win rate weight"
                    value={form.winRate}
                    onChange={(e) => setForm((f) => ({ ...f, winRate: e.target.value }))}
                    required
                  />
                  <input
                    className="input-field"
                    placeholder="Description (optional details)"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <input
                    className="input-field"
                    type="number"
                    placeholder="Min order LKR"
                    value={form.minOrderValue}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      className="h-10 w-14 rounded border border-navy-border bg-transparent"
                    />
                    <input
                      className="input-field flex-1"
                      type="number"
                      placeholder="Sort order"
                      value={form.sortOrder}
                      onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-3 sm:col-span-2">
                    <button type="submit" disabled={createMutation.isPending} className="btn-primary px-6 py-2.5 text-sm">
                      {createMutation.isPending ? 'Saving...' : 'Create'}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)} className="btn-outline px-6 py-2.5 text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-border">
                {['Label', 'Type', 'Value / Gift', 'Win rate', 'Chance', 'Min', 'Active', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map((o: any) => {
                const chance =
                  o.isActive && totalWeight > 0 ? ((o.winRate / totalWeight) * 100).toFixed(1) : '—';
                return (
                  <tr key={o.id} className="border-b border-navy-border hover:bg-navy-light/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ background: o.color }} />
                        <span className="text-white font-medium text-xs">{o.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{o.offerType}</td>
                    <td className="px-4 py-3 text-white text-xs">
                      {o.offerType === 'GIFT' ? (
                        <div className="flex items-center gap-3 min-w-[12rem] max-w-[18rem]">
                          {o.giftProduct?.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={o.giftProduct.imageUrl}
                              alt=""
                              className="h-10 w-10 rounded-lg object-cover shrink-0 border border-navy-border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-navy-light flex items-center justify-center shrink-0 border border-navy-border">
                              <Gift size={16} className="text-brand" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-white truncate">
                              {o.giftProduct?.name || 'No product linked'}
                            </p>
                            <p className="text-[11px] text-muted truncate">
                              {o.giftProduct
                                ? 'Free item at checkout'
                                : 'Choose a menu product'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-navy-border px-2 py-1 text-[11px] font-medium text-white hover:bg-navy-light"
                            onClick={() =>
                              setGiftPickerTarget({
                                mode: 'offer',
                                offerId: o.id,
                                selectedId: o.giftProductId,
                              })
                            }
                            title="Change gift product"
                          >
                            <Pencil size={11} aria-hidden />
                            Edit
                          </button>
                        </div>
                      ) : (
                        valueCell(o)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="input-field w-20 py-1 text-xs"
                        type="number"
                        step="0.1"
                        defaultValue={o.winRate}
                        onBlur={(e) => {
                          const winRate = parseFloat(e.target.value);
                          if (!Number.isFinite(winRate) || winRate === o.winRate) return;
                          updateMutation.mutate({ id: o.id, winRate, offerType: o.offerType });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-brand text-xs font-semibold">{chance}%</td>
                    <td className="px-4 py-3 text-muted text-xs">LKR {o.minOrderValue}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${o.isActive ? 'text-green-400' : 'text-red-400'}`}>
                        {o.isActive ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateMutation.mutate({ id: o.id, isActive: !o.isActive })}
                          className={`p-1.5 rounded-lg border text-xs ${
                            o.isActive ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'
                          }`}
                          title="Toggle active"
                        >
                          <Power size={12} />
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: 'Remove wheel segment',
                              message: `Remove "${o.label}" from the spin wheel?`,
                              confirmLabel: 'Remove',
                              cancelLabel: 'Cancel',
                              variant: 'danger',
                            });
                            if (ok) deleteMutation.mutate(o.id);
                          }}
                          className="p-1.5 rounded-lg border border-red-500/30 text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {offers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted text-sm">
                    No spin offers yet. Add at least 2 segments to enable the wheel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SpinGiftProductModal
        open={Boolean(giftPickerTarget)}
        title={
          giftPickerTarget?.mode === 'offer'
            ? 'Change gift product'
            : 'Select gift product'
        }
        products={products as SpinGiftProductOption[]}
        selectedId={
          giftPickerTarget?.mode === 'offer'
            ? giftPickerTarget.selectedId
            : form.giftProductId || null
        }
        onClose={() => setGiftPickerTarget(null)}
        onSelect={(product) => {
          if (!giftPickerTarget) return;
          if (giftPickerTarget.mode === 'form') {
            setForm((f) => ({
              ...f,
              giftProductId: product.id,
              label: f.label || `Free ${product.name}`,
              description: `Free ${product.name} with your order`,
            }));
            setGiftPickerTarget(null);
            return;
          }
          updateMutation.mutate(
            {
              id: giftPickerTarget.offerId,
              giftProductId: product.id,
              offerType: 'GIFT',
            },
            {
              onSuccess: () => setGiftPickerTarget(null),
            },
          );
        }}
      />
    </div>
  );
}
