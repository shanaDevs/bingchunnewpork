'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl, getSocketUrl } from '@/lib/apiBase';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Plus, Power, RefreshCw, Search, Star, UserCircle2, X } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import AdminDriverRegistrationModal, {
  type DriverRegistrationFormState,
} from '@/components/admin/AdminDriverRegistrationModal';
import AdminDriverDetailSheet, {
  type DriverEditFormState,
} from '@/components/admin/AdminDriverDetailSheet';
import { validateImageFile } from '@/lib/imageUpload';
import type { Driver, DriverDutyStatus } from '@/types';

async function adminFetch(endpoint: string, options?: RequestInit) {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: adminAuthHeaders({ 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined),
    credentials: 'include',
  }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

async function adminFetchForm(endpoint: string, formData: FormData, method: 'POST' | 'PATCH' = 'POST') {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method,
    headers: adminAuthHeaders(), credentials: 'include',
    body: formData,
  });
  let json: { success?: boolean; message?: string; data?: unknown };
  try {
    json = await res.json();
  } catch {
    throw new Error(res.ok ? 'Invalid server response' : `Upload failed (${res.status})`);
  }
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

function dutyStatusLabel(status: DriverDutyStatus): string {
  if (status === 'ONLINE') return 'Online';
  if (status === 'ON_DELIVERY') return 'On delivery';
  return 'Off duty';
}

function dutyStatusClass(status: DriverDutyStatus): string {
  if (status === 'ONLINE') return 'text-green-400 bg-green-400/10';
  if (status === 'ON_DELIVERY') return 'text-amber-400 bg-amber-400/10';
  return 'text-muted bg-navy-light';
}

type Props = {
  storeId?: string;
  showAllBranches?: boolean;
  stores?: { id: string; name: string }[];
  canRegisterDrivers?: boolean;
};

type DriverFilters = {
  name: string;
  storeId: string;
  status: '' | 'active' | 'inactive';
  dutyStatus: '' | DriverDutyStatus;
};

type DriverFormState = DriverRegistrationFormState;

const EMPTY_FORM: DriverFormState = {
  name: '',
  phone: '',
  nicNumber: '',
  address: '',
  vehicleType: '',
  vehicleNumber: '',
  vehicleColor: '',
  licenseNumber: '',
  disabilities: '',
  pin: '',
  isActive: true,
  branchIds: [],
  profilePhoto: null,
  licenseImage: null,
};

type CreatedDriverPin = {
  id: string;
  name: string;
  pin: string;
};

export default function AdminDriversPanel({
  storeId,
  showAllBranches = false,
  stores = [],
  canRegisterDrivers = false,
}: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DriverFormState>(EMPTY_FORM);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [filters, setFilters] = useState<DriverFilters>({
    name: '',
    storeId: '',
    status: '',
    dutyStatus: '',
  });
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [createdPin, setCreatedPin] = useState<CreatedDriverPin | null>(null);

  const poolStoreId = showAllBranches ? filters.storeId || undefined : storeId || undefined;

  const poolQuery = useMemo(() => {
    if (!poolStoreId) return '';
    const qs = new URLSearchParams();
    if (filters.status === 'active') qs.set('isActive', 'true');
    if (filters.status === 'inactive') qs.set('isActive', 'false');
    if (filters.dutyStatus) qs.set('dutyStatus', filters.dutyStatus);
    const query = qs.toString();
    return query ? `?${query}` : '';
  }, [poolStoreId, filters.status, filters.dutyStatus]);

  const listEndpoint = poolStoreId
    ? `/admin/branches/${encodeURIComponent(poolStoreId)}/driver-pool${poolQuery}`
    : `/admin/drivers${showAllBranches && filters.storeId ? `?storeId=${encodeURIComponent(filters.storeId)}` : ''}`;

  const driversQueryKey = ['admin-driver-pool', listEndpoint] as const;

  const { data: drivers = [], isLoading, refetch } = useQuery({
    queryKey: driversQueryKey,
    queryFn: async () => (await adminFetch(listEndpoint)).data as Driver[],
    enabled: showAllBranches || !!storeId,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
        const adminRaw = localStorage.getItem('bc_admin');
    let adminId: string | undefined;
    let adminStoreId: string | undefined;
    try {
      if (adminRaw) {
        const parsed = JSON.parse(adminRaw) as { id?: string; storeId?: string | null };
        adminId = parsed.id;
        adminStoreId = parsed.storeId || undefined;
      }
    } catch {
      /* ignore */
    }

    let socket: Socket | null = null;
    try {
      socket = io(getSocketUrl(), {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });
      if (adminId) {
        socket.emit('joinAdmin', {
          adminId,
          storeId: poolStoreId || adminStoreId || storeId || undefined,
        });
      }
      // Also join explicit store rooms for each visible branch when super-admin views all.
      const joinIds = new Set<string>();
      if (poolStoreId) joinIds.add(poolStoreId);
      if (storeId) joinIds.add(storeId);
      if (showAllBranches) stores.forEach((s) => joinIds.add(s.id));
      for (const id of joinIds) {
        socket.emit('joinAdmin', { adminId: adminId || 'admin', storeId: id });
      }

      socket.on(
        'driverDutyChanged',
        (payload: { driverId: string; name?: string; dutyStatus: DriverDutyStatus }) => {
          if (!payload?.driverId || !payload.dutyStatus) return;
          queryClient.setQueryData<Driver[]>(driversQueryKey, (prev) => {
            if (!prev) return prev;
            return prev.map((d) =>
              d.id === payload.driverId ? { ...d, dutyStatus: payload.dutyStatus } : d,
            );
          });
          setSelectedDriver((current) =>
            current && current.id === payload.driverId
              ? { ...current, dutyStatus: payload.dutyStatus }
              : current,
          );
        },
      );
    } catch {
      /* socket optional */
    }

    return () => {
      socket?.off('driverDutyChanged');
      socket?.disconnect();
    };
  }, [poolStoreId, storeId, showAllBranches, stores, queryClient, listEndpoint]);

  const filteredDrivers = useMemo(() => {
    const nameQuery = filters.name.trim().toLowerCase();
    return drivers.filter((driver) => {
      if (nameQuery && !driver.name.toLowerCase().includes(nameQuery)) return false;
      if (!poolStoreId && filters.storeId) {
        const inBranch =
          driver.store?.id === filters.storeId ||
          driver.accessibleStores.some((s) => s.id === filters.storeId);
        if (!inBranch) return false;
      }
      if (filters.status === 'active' && !driver.isActive) return false;
      if (filters.status === 'inactive' && driver.isActive) return false;
      if (filters.dutyStatus && driver.dutyStatus !== filters.dutyStatus) return false;
      return true;
    });
  }, [drivers, filters.name, filters.status, filters.dutyStatus, filters.storeId, poolStoreId]);

  const createDriver = useMutation({
    mutationFn: async () => {
      if (form.branchIds.length === 0) throw new Error('Select at least one branch');
      const pin = form.pin;
      const name = form.name.trim();
      const fd = new FormData();
      fd.append('name', name);
      fd.append('phone', form.phone.trim());
      fd.append('nicNumber', form.nicNumber.trim());
      fd.append('vehicleNumber', form.vehicleNumber.trim());
      fd.append('address', form.address.trim());
      fd.append('vehicleType', form.vehicleType.trim());
      fd.append('vehicleColor', form.vehicleColor.trim());
      fd.append('licenseNumber', form.licenseNumber.trim());
      fd.append('disabilities', form.disabilities.trim());
      fd.append('pin', pin);
      fd.append('isActive', String(form.isActive));
      fd.append('branchIds', JSON.stringify(form.branchIds));
      if (form.profilePhoto) fd.append('profilePhoto', form.profilePhoto);
      if (!form.licenseImage) throw new Error('Driving licence image is required');
      fd.append('licenseImage', form.licenseImage);
      const res = await adminFetchForm('/admin/drivers', fd);
      return { res, pin, name };
    },
    onSuccess: ({ res, pin, name }) => {
      const created = res.data as Driver & { pin?: string };
      setForm(EMPTY_FORM);
      setProfilePreview(null);
      setLicensePreview(null);
      setShowForm(false);
      refetch();
      setCreatedPin({
        id: created.id,
        name: created.name || name,
        pin: created.pin || pin,
      });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to register driver'),
  });

  const updateDriverStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/admin/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (_res, { isActive }) => {
      refetch();
      setSelectedDriver((current) =>
        current ? { ...current, isActive, dutyStatus: isActive ? current.dutyStatus : 'OFF_DUTY' } : null,
      );
      toast.success(isActive ? 'Rider reactivated' : 'Rider suspended');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update rider status'),
  });

  const updateDriver = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: DriverEditFormState }) => {
      const hasFiles = !!form.profilePhoto || !!form.licenseImage;
      if (hasFiles) {
        const fd = new FormData();
        fd.append('name', form.name.trim());
        fd.append('phone', form.phone.trim());
        fd.append('nicNumber', form.nicNumber.trim());
        fd.append('vehicleNumber', form.vehicleNumber.trim());
        fd.append('branchIds', JSON.stringify(form.branchIds));
        if (form.pin) fd.append('pin', form.pin);
        if (form.profilePhoto) fd.append('profilePhoto', form.profilePhoto);
        if (form.licenseImage) fd.append('licenseImage', form.licenseImage);
        return adminFetchForm(`/admin/drivers/${id}`, fd, 'PATCH');
      }
      return adminFetch(`/admin/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          nicNumber: form.nicNumber.trim(),
          vehicleNumber: form.vehicleNumber.trim(),
          branchIds: form.branchIds,
          ...(form.pin ? { pin: form.pin } : {}),
        }),
      });
    },
    onSuccess: (res) => {
      refetch();
      const updated = res.data as Driver;
      setSelectedDriver((current) =>
        current && current.id === updated.id ? { ...current, ...updated } : current,
      );
      toast.success('Rider details updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update rider'),
  });

  function openRegistrationForm() {
    setForm({
      ...EMPTY_FORM,
      branchIds: stores[0] ? [stores[0].id] : [],
    });
    setProfilePreview(null);
    setLicensePreview(null);
    setShowForm(true);
  }

  function closeRegistrationForm() {
    if (createDriver.isPending) return;
    setShowForm(false);
    setForm(EMPTY_FORM);
    if (profilePreview) URL.revokeObjectURL(profilePreview);
    if (licensePreview) URL.revokeObjectURL(licensePreview);
    setProfilePreview(null);
    setLicensePreview(null);
  }

  function handleProfilePhotoChange(file: File | null) {
    if (file) {
      const message = validateImageFile(file, 'Profile image');
      if (message) {
        toast.error(message);
        return;
      }
    }
    setForm((current) => ({ ...current, profilePhoto: file }));
    if (profilePreview) URL.revokeObjectURL(profilePreview);
    setProfilePreview(file ? URL.createObjectURL(file) : null);
  }

  function handleLicenseImageChange(file: File | null) {
    if (file) {
      const message = validateImageFile(file, 'Driving licence image');
      if (message) {
        toast.error(message);
        return;
      }
    }
    setForm((current) => ({ ...current, licenseImage: file }));
    if (licensePreview) URL.revokeObjectURL(licensePreview);
    setLicensePreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-bold text-fg">Drivers</h2>
          <p className="text-muted text-sm mt-0.5">
            {showAllBranches
              ? 'Branch driver pools with system and duty status'
              : 'Drivers authorized for your branch pool'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => refetch()} className="btn-outline p-2.5">
            <RefreshCw size={15} />
          </button>
          {canRegisterDrivers && stores.length > 0 && (
            <button
              type="button"
              onClick={openRegistrationForm}
              className="btn-primary px-3 py-2.5 text-sm flex items-center gap-1.5"
            >
              <Plus size={14} /> Register driver
            </button>
          )}
        </div>
      </div>

      <AdminDriverRegistrationModal
        open={showForm && canRegisterDrivers}
        onClose={closeRegistrationForm}
        stores={stores}
        form={form}
        onFormChange={setForm}
        profilePreview={profilePreview}
        licensePreview={licensePreview}
        onProfilePhotoChange={handleProfilePhotoChange}
        onLicenseImageChange={handleLicenseImageChange}
        onSubmit={() => createDriver.mutate()}
        isSubmitting={createDriver.isPending}
      />

      {createdPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-fg">Driver registered</h3>
                <p className="text-sm text-muted mt-1">
                  Share this PIN with <span className="text-fg font-medium">{createdPin.name}</span> now.
                  It will not be shown again.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline p-2"
                onClick={() => setCreatedPin(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="rounded-xl border border-navy-border bg-navy-light px-4 py-5 text-center">
              <p className="text-xs uppercase tracking-wide text-muted mb-2">One-time PIN</p>
              <p className="text-3xl font-bold tracking-[0.35em] text-brand tabular-nums">{createdPin.pin}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="btn-outline px-3 py-2 text-sm inline-flex items-center gap-1.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdPin.pin);
                    toast.success('PIN copied');
                  } catch {
                    toast.error('Could not copy PIN');
                  }
                }}
              >
                <Copy size={14} /> Copy PIN
              </button>
              <button
                type="button"
                className="btn-primary px-3 py-2 text-sm"
                onClick={() => setCreatedPin(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminDriverDetailSheet
        driver={selectedDriver}
        open={!!selectedDriver}
        onClose={() => setSelectedDriver(null)}
        canManageStatus={canRegisterDrivers}
        stores={stores}
        onSave={
          canRegisterDrivers
            ? async (id, form) => {
                await updateDriver.mutateAsync({ id, form });
              }
            : undefined
        }
        isSaving={updateDriver.isPending}
        onToggleStatus={(driver) =>
          updateDriverStatus.mutate({ id: driver.id, isActive: !driver.isActive })
        }
        isUpdatingStatus={updateDriverStatus.isPending}
      />

      <div className="card overflow-hidden">
        <div className="border-b border-navy-border px-4 py-4 sm:px-5 flex flex-wrap gap-3 items-end">
          <div className="w-full sm:max-w-xs">
            <label className="block text-xs text-muted mb-1">Search rider</label>
            <div className={`input-icon-wrap w-full${filters.name ? ' input-icon-wrap--end' : ''}`}>
              <Search size={14} className="input-icon" aria-hidden />
              <input
                type="text"
                value={filters.name}
                onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
                placeholder="Search by rider name..."
                className="input-field text-sm w-full"
              />
              {filters.name && (
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, name: '' }))}
                  className="input-action p-1 text-muted hover:text-fg"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {showAllBranches && stores.length > 0 && (
            <div>
              <label className="block text-xs text-muted mb-1">Branch pool</label>
              <SearchableBranchSelect
                stores={stores}
                value={filters.storeId || undefined}
                onChange={(nextStoreId) => setFilters((f) => ({ ...f, storeId: nextStoreId }))}
                formatName={(name) => name.replace('Bing Chun - ', '')}
                placeholder="All branches"
                className="min-w-[160px]"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-muted mb-1">System status</label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as DriverFilters['status'] }))
              }
              className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm min-w-[140px]"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Suspended</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Duty status</label>
            <select
              value={filters.dutyStatus}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dutyStatus: e.target.value as DriverFilters['dutyStatus'],
                }))
              }
              className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm min-w-[160px]"
            >
              <option value="">All duty states</option>
              <option value="ONLINE">Online (available)</option>
              <option value="ON_DELIVERY">On delivery</option>
              <option value="OFF_DUTY">Off duty</option>
            </select>
          </div>
          {(filters.name || filters.storeId || filters.status || filters.dutyStatus) && (
            <div>
              <button
                type="button"
                onClick={() => setFilters({ name: '', storeId: '', status: '', dutyStatus: '' })}
                className="btn-outline px-3 py-2 text-sm text-muted hover:text-fg"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading drivers…
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <UserCircle2 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {drivers.length === 0
                ? showAllBranches
                  ? 'No drivers found.'
                  : 'No drivers in this branch pool.'
                : 'No riders match your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[820px] text-sm">
              <thead>
                <tr>
                  {[
                    'Rider',
                    'Phone',
                    'Duty status',
                    'System status',
                    'Completed',
                    'Rating',
                    ...(canRegisterDrivers ? ['Actions'] : []),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedDriver(d)}
                    className="border-b border-navy-border hover:bg-navy-light/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {d.profilePhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.profilePhotoUrl}
                            alt={d.name}
                            className="h-9 w-9 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <UserCircle2 size={28} className="text-muted shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">{d.name}</p>
                          {d.vehicleNumber && (
                            <p className="text-xs text-muted truncate">{d.vehicleNumber}</p>
                          )}
                          <p className="text-[11px] text-muted">
                            Merit {d.meritPoints ?? 100} · {d.meritStatus ?? 'EXCELLENT'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-fg whitespace-nowrap">{d.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${dutyStatusClass(d.dutyStatus)}`}>
                        {dutyStatusLabel(d.dutyStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${d.isActive ? 'text-green-400' : 'text-red-400'}`}>
                        {d.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fg font-semibold">{d.completedJobCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.avgRiderRating != null && d.riderRatingCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                          <Star size={13} className="fill-current" />
                          {d.avgRiderRating.toFixed(1)}
                          <span className="text-muted font-normal">
                            ({d.riderRatingCount})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">No ratings</span>
                      )}
                    </td>
                    {canRegisterDrivers && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateDriverStatus.mutate({ id: d.id, isActive: !d.isActive });
                          }}
                          disabled={updateDriverStatus.isPending}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                            d.isActive
                              ? 'text-red-400 border border-red-400/30 hover:bg-red-400/10'
                              : 'text-green-400 border border-green-400/30 hover:bg-green-400/10'
                          }`}
                        >
                          <Power size={13} />
                          {d.isActive ? 'Suspend' : 'Reactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-muted border-t border-navy-border">
              Click a row to view customer reviews, rider profile, and documents.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
