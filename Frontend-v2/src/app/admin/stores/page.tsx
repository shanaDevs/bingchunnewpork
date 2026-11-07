'use client';

import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { useMemo, useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import StoreAddressSearchField, { type StoreAddressSelection } from '@/components/admin/StoreAddressSearchField';
import { groupStoresByDistrict } from '@/lib/groupStoresByDistrict';

const EMPTY = {
  name: '',
  addressLine: '',
  city: '',
  district: '',
  lat: '',
  lng: '',
  phone: '',
  openTime: '09:00',
  closeTime: '23:00',
  onlineOrderStartTime: '',
  onlineOrderStopTime: '',
  pickupCutoffMinutes: '50',
};

type StoreForm = typeof EMPTY;

function normalizeTimeForInput(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{1,2}:\d{2})/.exec(String(value).trim());
  return match ? match[1] : '';
}

function storeToForm(store: any): StoreForm {
  return {
    name: store.name ?? '',
    addressLine: store.addressLine ?? '',
    city: store.city ?? '',
    district: store.district ?? '',
    lat: String(store.lat ?? ''),
    lng: String(store.lng ?? ''),
    phone: store.phone ?? '',
    openTime: normalizeTimeForInput(store.openTime) || '09:00',
    closeTime: normalizeTimeForInput(store.closeTime) || '23:00',
    onlineOrderStartTime: normalizeTimeForInput(store.onlineOrderStartTime),
    onlineOrderStopTime: normalizeTimeForInput(store.onlineOrderStopTime),
    pickupCutoffMinutes: String(store.pickupCutoffMinutes ?? 50),
  };
}

function matchesStoreSearch(store: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    store.name,
    store.addressLine,
    store.city,
    store.district,
    store.phone,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export default function AdminStoresPage() {
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [manualCoords, setManualCoords] = useState(false);
  const qc = useQueryClient();

  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ['admin-stores', 'includeInactive'],
    queryFn: () => adminFetch('/stores?includeInactive=true'),
  });

  const districts = useMemo(
    () => groupStoresByDistrict(stores).map((group) => ({
      name: group.district,
      count: group.stores.length,
    })),
    [stores],
  );

  const filteredStores = useMemo(
    () =>
      stores.filter((store) => {
        if (districtFilter && store.district !== districtFilter) return false;
        return matchesStoreSearch(store, searchQuery);
      }),
    [stores, searchQuery, districtFilter],
  );

  const groupedStores = useMemo(() => groupStoresByDistrict(filteredStores), [filteredStores]);

  const activeCount = stores.filter((store) => store.isActive).length;

  const createMutation = useMutation({
    mutationFn: (data: any) => adminFetch('/stores', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-stores'] });
      setForm(EMPTY);
      setAddressSearch('');
      setManualCoords(false);
      setShowForm(false);
      toast.success('Store created');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      adminFetch(`/stores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-stores'] });
      setEditingId(null);
      setForm(EMPTY);
      setAddressSearch('');
      setManualCoords(false);
      setShowForm(false);
      toast.success('Store updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: any) => adminFetch(`/stores/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
    onSuccess: (_data, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['admin-stores'] });
      toast.success(isActive ? 'Store activated' : 'Store deactivated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update store status'),
  });

  function buildHoursPayload(f: StoreForm) {
    return {
      openTime: f.openTime,
      closeTime: f.closeTime,
      onlineOrderStartTime: f.onlineOrderStartTime.trim() || null,
      onlineOrderStopTime: f.onlineOrderStopTime.trim() || null,
      pickupCutoffMinutes: parseInt(f.pickupCutoffMinutes, 10) || 50,
    };
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const hours = buildHoursPayload(form);
    if (!editingId && !form.phone.trim()) {
      toast.error('Phone number is required');
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          name: form.name,
          addressLine: form.addressLine,
          city: form.city,
          district: form.district,
          lat: parseFloat(form.lat),
          lng: parseFloat(form.lng),
          phone: form.phone || undefined,
          ...hours,
        },
      });
      return;
    }
    createMutation.mutate({
      ...form,
      phone: form.phone.trim(),
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      ...hours,
    });
  }

  function applyAddressSelection(selection: StoreAddressSelection) {
    setForm((prev) => ({
      ...prev,
      addressLine: selection.addressLine,
      city: selection.city,
      district: selection.district,
      lat: selection.lat,
      lng: selection.lng,
    }));
    setAddressSearch(
      [selection.addressLine, selection.city, selection.district].filter(Boolean).join(', '),
    );
    setManualCoords(false);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY);
    setAddressSearch('');
    setManualCoords(false);
    setShowForm(true);
  }

  function startEdit(store: any) {
    setEditingId(store.id);
    setForm(storeToForm(store));
    setAddressSearch([store.addressLine, store.city, store.district].filter(Boolean).join(', '));
    setManualCoords(false);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
    setAddressSearch('');
    setManualCoords(false);
  }

  function HoursFields({ f, setF }: { f: StoreForm; setF: React.Dispatch<React.SetStateAction<StoreForm>> }) {
    return (
      <>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted mb-2">Store hours (physical)</p>
          <div className="flex gap-2">
            <input className="input-field flex-1" type="time" value={f.openTime} onChange={(e) => setF((prev) => ({ ...prev, openTime: e.target.value }))} />
            <input className="input-field flex-1" type="time" value={f.closeTime} onChange={(e) => setF((prev) => ({ ...prev, closeTime: e.target.value }))} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted mb-2">Online ordering window (leave blank to use store hours)</p>
          <div className="flex gap-2">
            <input className="input-field flex-1" type="time" value={f.onlineOrderStartTime} onChange={(e) => setF((prev) => ({ ...prev, onlineOrderStartTime: e.target.value }))} />
            <input className="input-field flex-1" type="time" value={f.onlineOrderStopTime} onChange={(e) => setF((prev) => ({ ...prev, onlineOrderStopTime: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Pickup stops (minutes before close)</label>
          <input
            className="input-field"
            type="number"
            min={0}
            max={180}
            value={f.pickupCutoffMinutes}
            onChange={(e) => setF((prev) => ({ ...prev, pickupCutoffMinutes: e.target.value }))}
          />
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Store Management</h1>
          <p className="text-muted text-sm">
            {searchQuery.trim() || districtFilter
              ? `${filteredStores.length} of ${stores.length} stores`
              : `${activeCount} active stores across ${districts.length} districts`}
          </p>
        </div>
        <button onClick={openCreateForm} className="btn-primary px-4 py-2.5 text-sm"><Plus size={15} /> Add Store</button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 mb-6">
            <h3 className="font-semibold text-white mb-4">{editingId ? 'Edit Store' : 'New Store'}</h3>
            <form onSubmit={submitForm} className="grid sm:grid-cols-2 gap-4">
              <input className="input-field sm:col-span-2" placeholder="Store name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <StoreAddressSearchField
                value={addressSearch}
                onResolved={applyAddressSelection}
                disabled={createMutation.isPending || updateMutation.isPending}
              />
              <input className="input-field sm:col-span-2" placeholder="Address line" value={form.addressLine} onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))} required />
              <input className="input-field" placeholder="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} required />
              <input className="input-field" placeholder="District" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} required />
              <div>
                <label className="text-xs text-muted block mb-1">Latitude</label>
                <input
                  className="input-field"
                  type="number"
                  step="any"
                  placeholder="Auto-filled from address"
                  value={form.lat}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                  readOnly={!manualCoords}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Longitude</label>
                <input
                  className="input-field"
                  type="number"
                  step="any"
                  placeholder="Auto-filled from address"
                  value={form.lng}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                  readOnly={!manualCoords}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setManualCoords((prev) => !prev)}
                  className="text-xs text-brand hover:text-brand-light transition-colors"
                >
                  {manualCoords ? 'Use address search coordinates' : 'Edit coordinates manually'}
                </button>
              </div>
              <input
                className="input-field"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                required={!editingId}
              />
              <HoursFields f={form} setF={setForm} />
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary px-6 py-2.5 text-sm">
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Store'}
                </button>
                <button type="button" onClick={cancelForm} className="btn-outline px-6 py-2.5 text-sm">Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card overflow-hidden">
        <div className="border-b border-navy-border px-4 py-3 space-y-3">
          <div className="input-icon-wrap max-w-sm">
            <Search size={14} className="input-icon" aria-hidden />
            <input
              className="search-bar text-sm"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search branches"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setDistrictFilter('')}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                !districtFilter
                  ? 'border-brand bg-brand text-white'
                  : 'border-navy-border text-muted hover:text-white'
              }`}
            >
              All ({stores.length})
            </button>
            {districts.map((district) => (
              <button
                key={district.name}
                type="button"
                onClick={() => setDistrictFilter(district.name)}
                className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                  districtFilter === district.name
                    ? 'border-brand bg-brand text-white'
                    : 'border-navy-border text-muted hover:text-white'
                }`}
              >
                {district.name} ({district.count})
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          {filteredStores.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center px-4 py-10 text-sm text-muted">
              {searchQuery.trim() || districtFilter ? 'No branches match this filter' : 'No stores found'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border">
                  {['Name', 'Address', 'District', 'Hours', 'Online', 'Pickup cutoff', 'Status', 'Busy', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedStores.map((group) => (
                  <Fragment key={group.district}>
                    <tr className="bg-navy-light/60">
                      <td colSpan={9} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand">
                        {group.district} · {group.stores.length} {group.stores.length === 1 ? 'branch' : 'branches'}
                      </td>
                    </tr>
                    {group.stores.map((s: any) => (
                      <tr key={s.id} className="border-b border-navy-border hover:bg-navy-light/30">
                        <td className="px-4 py-3 text-white font-medium text-sm">{s.name}</td>
                        <td className="px-4 py-3 text-muted text-xs max-w-44 truncate">{s.addressLine}, {s.city}</td>
                        <td className="px-4 py-3 text-muted text-xs">{s.district}</td>
                        <td className="px-4 py-3 text-muted text-xs">{s.openTime}–{s.closeTime}</td>
                        <td className="px-4 py-3 text-muted text-xs">
                          {(s.onlineOrderStartTime || s.openTime)}–{(s.onlineOrderStopTime || s.closeTime)}
                        </td>
                        <td className="px-4 py-3 text-muted text-xs">{s.pickupCutoffMinutes ?? 50} min</td>
                        <td className="px-4 py-3"><span className={`text-xs font-medium ${s.isActive ? 'text-green-400' : 'text-red-400'}`}>{s.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td className="px-4 py-3"><span className={`text-xs font-medium ${s.isBusy ? 'text-yellow-400' : 'text-muted'}`}>{s.isBusy ? 'Busy' : 'Normal'}</span></td>
                        <td className="px-4 py-3 flex gap-1">
                          <button type="button" onClick={() => startEdit(s)} className="p-1.5 rounded-lg border border-navy-border text-muted hover:text-white" title="Edit store">
                            <Pencil size={12} />
                          </button>
                          <button type="button" onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })}
                            className={`p-1.5 rounded-lg border text-xs ${s.isActive ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'}`}>
                            <Power size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
