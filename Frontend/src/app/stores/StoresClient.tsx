'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Phone, Clock, Navigation, Search, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { groupStoresByDistrict } from '@/lib/groupStoresByDistrict';
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsEmbedUrl } from '@/lib/storeCoordinates';
import type { Store } from '@/types';
import { isBranchManuallyClosed } from '@/lib/storeOrderingHours';

function StoreStatusBadge({ store }: { store: Store }) {
  const manuallyClosed = isBranchManuallyClosed(store);
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        manuallyClosed
          ? 'text-red-400 bg-red-400/10'
          : store.isBusy
            ? 'text-yellow-400 bg-yellow-400/10'
            : store.isActive
              ? 'text-green-400 bg-green-400/10'
              : 'text-red-400 bg-red-400/10'
      }`}
    >
      {manuallyClosed ? 'Closed' : store.isBusy ? 'Busy' : store.isActive ? 'Open' : 'Closed'}
    </span>
  );
}

function StoreMapEmbed({ store }: { store: Store }) {
  const embedUrl = buildGoogleMapsEmbedUrl(store.lat, store.lng);

  if (!embedUrl) {
    return (
      <div
        className="rounded-xl overflow-hidden flex items-center justify-center text-muted text-sm px-4 text-center"
        style={{ height: 220, background: '#12162a' }}
      >
        Map location unavailable for this store.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ height: 220, background: '#12162a' }}>
      <iframe
        title={store.name}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        src={embedUrl}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

function StoreExpandedContent({ store }: { store: Store }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="pt-4 space-y-3 text-sm border-t border-navy-border mt-3">
        <div className="flex items-start gap-2.5">
          <MapPin size={16} className="text-brand mt-0.5 shrink-0" />
          <span className="text-muted">
            {store.addressLine}, {store.city}, {store.district}
          </span>
        </div>
        {store.phone && (
          <div className="flex items-center gap-2.5">
            <Phone size={16} className="text-brand shrink-0" />
            <a href={`tel:${store.phone}`} className="text-muted hover:text-brand">
              {store.phone}
            </a>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <Clock size={16} className="text-brand shrink-0" />
          <span className="text-muted">
            {store.openTime} – {store.closeTime} daily
          </span>
        </div>
      </div>

      <div className="mt-4 lg:hidden">
        <StoreMapEmbed store={store} />
      </div>

      <a
        href={buildGoogleMapsDirectionsUrl(store.lat, store.lng) ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!buildGoogleMapsDirectionsUrl(store.lat, store.lng)) e.preventDefault();
          e.stopPropagation();
        }}
        className="btn-primary w-full py-3 mt-4 text-sm flex items-center justify-center gap-2 lg:hidden"
      >
        <Navigation size={15} /> Get Directions
      </a>
    </motion.div>
  );
}

function StoreListCard({
  store,
  index,
  isSelected,
  onToggle,
}: {
  store: Store;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`card transition-all ${
        isSelected ? 'border-brand bg-brand-subtle' : 'hover:border-brand/60'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left cursor-pointer"
        aria-expanded={isSelected}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="font-semibold text-white text-sm">{store.name}</p>
              <StoreStatusBadge store={store} />
            </div>
            {!isSelected && (
              <>
                <p className="text-muted text-xs flex items-center gap-1">
                  <MapPin size={11} className="text-brand shrink-0" />
                  {store.addressLine}, {store.city}
                </p>
                <p className="text-muted text-xs flex items-center gap-1 mt-1">
                  <Clock size={11} className="text-brand shrink-0" />
                  {store.openTime} – {store.closeTime}
                </p>
                {store.distanceKm !== undefined && (
                  <p className="text-brand text-xs font-medium mt-1">
                    📍 {store.distanceKm.toFixed(1)} km away
                  </p>
                )}
              </>
            )}
            {isSelected && (
              <p className="text-muted text-xs flex items-center gap-1">
                <MapPin size={11} className="text-brand shrink-0" />
                {store.city}, {store.district}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 items-end shrink-0">
            {!isSelected && store.phone && (
              <a
                href={`tel:${store.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-muted hover:text-brand transition-colors"
              >
                <Phone size={11} /> Call
              </a>
            )}
            <ChevronDown
              size={16}
              className={`text-muted transition-transform duration-200 ${isSelected ? 'rotate-180 text-brand' : ''}`}
              aria-hidden
            />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isSelected && (
          <div className="px-4 pb-4">
            <StoreExpandedContent store={store} />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StoreDetailPanel({ store }: { store: Store }) {
  return (
    <motion.div
      key={store.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="card p-5 sm:p-6 border-brand/40"
    >
      <h3 className="font-bold text-white text-lg mb-1">{store.name}</h3>
      <StoreStatusBadge store={store} />

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-start gap-2.5">
          <MapPin size={16} className="text-brand mt-0.5 shrink-0" />
          <span className="text-muted">
            {store.addressLine}, {store.city}, {store.district}
          </span>
        </div>
        {store.phone && (
          <div className="flex items-center gap-2.5">
            <Phone size={16} className="text-brand shrink-0" />
            <a href={`tel:${store.phone}`} className="text-muted hover:text-brand">
              {store.phone}
            </a>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <Clock size={16} className="text-brand shrink-0" />
          <span className="text-muted">
            {store.openTime} – {store.closeTime} daily
          </span>
        </div>
      </div>

      <div className="mt-4">
        <StoreMapEmbed store={store} />
      </div>

      <a
        href={buildGoogleMapsDirectionsUrl(store.lat, store.lng) ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!buildGoogleMapsDirectionsUrl(store.lat, store.lng)) e.preventDefault();
        }}
        className="btn-primary w-full py-3 mt-4 text-sm flex items-center justify-center gap-2"
      >
        <Navigation size={15} /> Get Directions
      </a>
    </motion.div>
  );
}

export default function StoresPage() {
  const [districtFilter, setDistrictFilter] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ['stores', userLocation],
    queryFn: () => {
      const params = new URLSearchParams();
      if (userLocation) {
        params.append('lat', String(userLocation.lat));
        params.append('lng', String(userLocation.lng));
      }
      return api.get(`/stores?${params}`);
    },
  });

  function getLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }

  function toggleStore(store: Store) {
    setSelectedId((current) => (current === store.id ? null : store.id));
  }

  const districts = useMemo(
    () => groupStoresByDistrict(stores).map((group) => ({
      name: group.district,
      count: group.stores.length,
    })),
    [stores],
  );
  const searchQuery = search.trim().toLowerCase();
  const filtered = stores.filter((s) => {
    if (searchQuery) {
      return (
        s.name.toLowerCase().includes(searchQuery) ||
        s.city.toLowerCase().includes(searchQuery) ||
        s.district.toLowerCase().includes(searchQuery) ||
        s.addressLine.toLowerCase().includes(searchQuery)
      );
    }
    if (districtFilter && s.district !== districtFilter) return false;
    return true;
  });
  const groupedFiltered = useMemo(() => groupStoresByDistrict(filtered), [filtered]);
  const selected = filtered.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-screen">
      <div className="bg-navy-light border-b border-navy-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Store Locator 📍</h1>
              <p className="text-muted mt-1">{stores.length} locations island-wide across Sri Lanka</p>
            </div>
            <div className="flex gap-2">
              <div className="input-icon-wrap sm:w-60">
                <Search size={15} className="input-icon" aria-hidden />
                <input
                  className="input-field text-sm"
                  placeholder="Search stores..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                onClick={getLocation}
                className="btn-outline px-3 py-2.5 text-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <Navigation size={14} /> Near Me
              </button>
            </div>
          </div>

          <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scroll-slim">
            <button
              onClick={() => setDistrictFilter('')}
              className={`px-4 py-1.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                !districtFilter
                  ? 'bg-brand text-white border-brand'
                  : 'border-navy-border text-muted hover:border-brand hover:text-white'
              }`}
            >
              All Districts ({stores.length})
            </button>
            {districts.map((d) => (
              <button
                key={d.name}
                onClick={() => setDistrictFilter(d.name)}
                className={`px-4 py-1.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                  districtFilter === d.name
                    ? 'bg-brand text-white border-brand'
                    : 'border-navy-border text-muted hover:border-brand hover:text-white'
                }`}
              >
                {d.name} ({d.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card p-5 animate-pulse">
                  <div className="h-4 rounded mb-2" style={{ background: '#12162a', width: '50%' }} />
                  <div className="h-3 rounded" style={{ background: '#12162a', width: '70%' }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🏪</p>
                <p className="text-muted">No stores found</p>
              </div>
            ) : (
              groupedFiltered.map((group) => (
                <div key={group.district} className="space-y-3">
                  <div className="flex items-center justify-between pt-1">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand">
                      {group.district}
                    </h2>
                    <span className="text-xs text-muted">
                      {group.stores.length} {group.stores.length === 1 ? 'branch' : 'branches'}
                    </span>
                  </div>
                  {group.stores.map((store, i) => (
                    <StoreListCard
                      key={store.id}
                      store={store}
                      index={i}
                      isSelected={selectedId === store.id}
                      onToggle={() => toggleStore(store)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="hidden lg:block lg:sticky lg:top-20 h-fit">
            <AnimatePresence mode="wait">
              {selected ? (
                <StoreDetailPanel key={selected.id} store={selected} />
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="card flex items-center justify-center text-center p-12"
                  style={{ height: 300 }}
                >
                  <div>
                    <MapPin size={40} className="mx-auto text-muted mb-3" />
                    <p className="text-muted">Select a store to see details and location</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
