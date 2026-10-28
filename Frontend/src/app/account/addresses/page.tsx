'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, ChevronLeft, Plus, Trash2, Star, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import type { Address } from '@/types';
import toast from 'react-hot-toast';
import { confirmDialog } from '@/store/confirmStore';
import { AddressMapPicker, type AddressSelection } from '@/components/order/AddressMapPicker';

type AddressForm = {
  label: string;
  city: string;
  district: string;
  isDefault: boolean;
  selection: AddressSelection | null;
};

const emptyForm = (): AddressForm => ({
  label: 'Home',
  city: 'Colombo',
  district: 'Colombo',
  isDefault: false,
  selection: null,
});

export default function AddressesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddressForm>(emptyForm);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/account/login');
  }, [isAuthenticated, router]);

  const { data: addresses = [], isLoading, isError, refetch } = useQuery<Address[]>({
    queryKey: ['addresses'],
    queryFn: () => api.get('/addresses', true),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Address>('/addresses', body, true),
    onSuccess: (saved) => {
      const alreadySaved = addresses.some((a) => a.id === saved.id);
      qc.invalidateQueries({ queryKey: ['addresses'] });
      setShowForm(false);
      setForm(emptyForm());
      toast.success(
        alreadySaved
          ? 'That location is already in your address book (within 20 m)'
          : 'Address saved',
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.put<Address>(`/addresses/${id}`, body, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Default address updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/addresses/${id}`, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function saveAddress() {
    if (!form.selection?.address) {
      toast.error('Please select a location on the map');
      return;
    }
    if (!form.label.trim()) {
      toast.error('Please enter a label (e.g. Home, Work)');
      return;
    }

    createMutation.mutate({
      label: form.label.trim(),
      addressLine: form.selection.address,
      city: form.city.trim(),
      district: form.district.trim(),
      lat: form.selection.lat,
      lng: form.selection.lng,
      // Backend also forces the first address as default.
      isDefault: form.isDefault || addresses.length === 0,
    });
  }

  async function removeAddress(address: Address) {
    const ok = await confirmDialog({
      title: 'Remove address?',
      message: `Remove "${address.label}" from your saved addresses?`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(address.id);
  }

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/account" className="btn-outline p-2 shrink-0">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">Saved Addresses</h1>
          <p className="text-muted text-sm">Manage your delivery locations</p>
        </div>
        {!showForm && addresses.length < 5 && (
          <button
            type="button"
            onClick={() => {
              setForm({ ...emptyForm(), isDefault: addresses.length === 0 });
              setShowForm(true);
            }}
            className="btn-primary px-3 py-2 text-sm flex items-center gap-1.5 shrink-0"
          >
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="card p-4 sm:p-5 mb-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-fg">New address</h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm());
                }}
                className="p-2 rounded-lg text-muted hover:text-fg hover:bg-navy-light transition-colors"
                aria-label="Close form"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label htmlFor="address-label" className="text-xs text-muted font-medium mb-1.5 block">
                Label
              </label>
              <input
                id="address-label"
                className="input-field w-full"
                placeholder="Home, Work, Office..."
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="address-city" className="text-xs text-muted font-medium mb-1.5 block">
                  City
                </label>
                <input
                  id="address-city"
                  className="input-field w-full"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="address-district" className="text-xs text-muted font-medium mb-1.5 block">
                  District
                </label>
                <input
                  id="address-district"
                  className="input-field w-full"
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                />
              </div>
            </div>

            <AddressMapPicker
              value={form.selection}
              variant="prominent"
              autoDetectOnMount
              onChange={(selection) => setForm((f) => ({ ...f, selection }))}
            />

            <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="rounded border-navy-border"
              />
              Set as default delivery address
            </label>

            <button
              type="button"
              onClick={saveAddress}
              disabled={createMutation.isPending}
              className="btn-primary w-full py-3"
            >
              {createMutation.isPending ? 'Saving...' : 'Save Address'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="card p-8 text-center text-muted text-sm">Loading addresses...</div>
      ) : isError ? (
        <div className="card p-8 text-center space-y-3">
          <p className="text-muted text-sm">Could not load your addresses.</p>
          <button type="button" onClick={() => refetch()} className="btn-outline px-4 py-2 text-sm">
            Try again
          </button>
        </div>
      ) : addresses.length === 0 ? (
        <div className="card p-8 text-center">
          <MapPin size={32} className="text-brand mx-auto mb-3 opacity-70" />
          <p className="text-fg font-medium">No saved addresses yet</p>
          <p className="text-muted text-sm mt-1 mb-4">Add a delivery address for faster checkout.</p>
          {!showForm && (
            <button
              type="button"
              onClick={() => {
                setForm({ ...emptyForm(), isDefault: true });
                setShowForm(true);
              }}
              className="btn-primary px-5 py-2.5 text-sm"
            >
              Add your first address
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address, i) => (
            <motion.div
              key={address.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-subtle shrink-0">
                  <MapPin size={18} className="text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-fg">{address.label}</p>
                    {address.isDefault && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand/15 text-brand">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted mt-1">{address.addressLine}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {address.city}, {address.district}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-navy-border">
                {!address.isDefault && (
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({ id: address.id, body: { isDefault: true } })}
                    disabled={updateMutation.isPending}
                    className="text-xs text-brand hover:underline flex items-center gap-1"
                  >
                    <Star size={12} /> Set default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removeAddress(address)}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-red-400 hover:underline flex items-center gap-1 ml-auto"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </motion.div>
          ))}

          {addresses.length >= 5 && (
            <p className="text-xs text-center text-muted pt-2">Maximum of 5 saved addresses reached.</p>
          )}
        </div>
      )}
    </div>
  );
}
