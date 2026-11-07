'use client';

import { adminFetch, adminFetchForm } from '@/lib/adminApi';
import { createAdminSocket } from '@/lib/adminSocket';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Power, RefreshCw, Star, UserCircle2 } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import SearchableRiderNameField from '@/components/admin/SearchableRiderNameField';
import AdminDriverRegistrationModal, {
  type DriverRegistrationFormState,
} from '@/components/admin/AdminDriverRegistrationModal';
import AdminDriverDetailSheet, {
  type DriverEditFormState,
} from '@/components/admin/AdminDriverDetailSheet';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { validateImageFile } from '@/lib/imageUpload';
import { isValidSriLankanPhone, normalizePhone } from '@/lib/phone';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import type { Driver, DriverDutyStatus } from '@/types';

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
  canEditDrivers?: boolean;
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
  isActive: true,
  branchIds: [],
  profilePhoto: null,
  licenseImage: null,
};

type DriverPage = {
  rows: Driver[];
  total: number;
  page: number;
  pageSize: number;
};

function toDriverPage(data: unknown, page: number, pageSize: number): DriverPage {
  if (data && typeof data === 'object' && Array.isArray((data as DriverPage).rows)) {
    const pageData = data as DriverPage;
    return {
      rows: pageData.rows,
      total: typeof pageData.total === 'number' ? pageData.total : pageData.rows.length,
      page: pageData.page ?? page,
      pageSize: pageData.pageSize ?? pageSize,
    };
  }
  if (Array.isArray(data)) {
    const rows = data as Driver[];
    const start = (page - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }
  return { rows: [], total: 0, page, pageSize };
}

export default function AdminDriversPanel({
  storeId,
  showAllBranches = false,
  stores = [],
  canRegisterDrivers = false,
  canEditDrivers = false,
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);
  const [nameQuery, setNameQuery] = useState('');

  const poolStoreId = showAllBranches ? filters.storeId || undefined : storeId || undefined;

  useEffect(() => {
    const handle = window.setTimeout(() => setNameQuery(filters.name.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [filters.name]);

  const listFilterKey = `${nameQuery}\0${filters.storeId}\0${filters.status}\0${filters.dutyStatus}\0${pageSize}\0${poolStoreId ?? ''}`;

  useEffect(() => {
    setPage(1);
  }, [listFilterKey]);

  const listEndpoint = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    if (nameQuery) qs.set('name', nameQuery);
    if (filters.status === 'active') qs.set('isActive', 'true');
    if (filters.status === 'inactive') qs.set('isActive', 'false');
    if (filters.dutyStatus) qs.set('dutyStatus', filters.dutyStatus);
    if (!poolStoreId && showAllBranches && filters.storeId) qs.set('storeId', filters.storeId);
    const query = `?${qs.toString()}`;
    return poolStoreId
      ? `/admin/branches/${encodeURIComponent(poolStoreId)}/driver-pool${query}`
      : `/admin/drivers${query}`;
  }, [
    page,
    pageSize,
    nameQuery,
    filters.status,
    filters.dutyStatus,
    filters.storeId,
    poolStoreId,
    showAllBranches,
  ]);

  const driversQueryKey = ['admin-driver-pool', listEndpoint] as const;

  const { data: driverPage, isLoading, isError, error, refetch } = useQuery({
    queryKey: driversQueryKey,
    queryFn: async () => toDriverPage((await adminFetch(listEndpoint)).data, page, pageSize),
    enabled: showAllBranches || !!storeId,
    placeholderData: keepPreviousData,
  });

  const drivers = driverPage?.rows ?? [];
  const totalItems = driverPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);

  useEffect(() => {
    if (driverPage && page > totalPages) setPage(totalPages);
  }, [driverPage, page, totalPages]);

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
    if (!adminId) return;

    let socket: Socket | null = null;
    let cancelled = false;

    const joinIds = new Set<string>();
    if (poolStoreId) joinIds.add(poolStoreId);
    if (storeId) joinIds.add(storeId);
    if (adminStoreId) joinIds.add(adminStoreId);
    if (showAllBranches) stores.forEach((s) => joinIds.add(s.id));
    if (joinIds.size === 0) joinIds.add('');

    void createAdminSocket({ autoConnect: false }).then((created) => {
      if (cancelled || !created) return;
      socket = created;
      socket.on('connect', () => {
        for (const id of joinIds) {
          socket?.emit('joinAdmin', {
            adminId,
            storeId: id || undefined,
          });
        }
      });
      socket.on(
        'driverDutyChanged',
        (payload: { driverId: string; name?: string; dutyStatus: DriverDutyStatus }) => {
          if (!payload?.driverId || !payload.dutyStatus) return;
          queryClient.setQueryData<DriverPage>(driversQueryKey, (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              rows: prev.rows.map((d) =>
                d.id === payload.driverId ? { ...d, dutyStatus: payload.dutyStatus } : d,
              ),
            };
          });
          setSelectedDriver((current) =>
            current && current.id === payload.driverId
              ? { ...current, dutyStatus: payload.dutyStatus }
              : current,
          );
        },
      );
      socket.connect();
    });

    return () => {
      cancelled = true;
      socket?.off('driverDutyChanged');
      socket?.disconnect();
    };
  }, [poolStoreId, storeId, showAllBranches, stores, queryClient, listEndpoint]);

  const createDriver = useMutation({
    mutationFn: async () => {
      if (form.branchIds.length === 0) throw new Error('Select at least one branch');
      const name = form.name.trim();
      const phone = form.phone.trim();
      if (!isValidSriLankanPhone(phone)) {
        throw new Error('Enter a valid Sri Lankan mobile number (07XXXXXXXX)');
      }
      const fd = new FormData();
      fd.append('name', name);
      fd.append('phone', normalizePhone(phone));
      fd.append('nicNumber', form.nicNumber.trim());
      fd.append('vehicleNumber', form.vehicleNumber.trim());
      fd.append('address', form.address.trim());
      fd.append('vehicleType', form.vehicleType.trim());
      fd.append('vehicleColor', form.vehicleColor.trim());
      fd.append('licenseNumber', form.licenseNumber.trim());
      fd.append('disabilities', form.disabilities.trim());
      fd.append('isActive', String(form.isActive));
      fd.append('branchIds', JSON.stringify(form.branchIds));
      if (form.profilePhoto) fd.append('profilePhoto', form.profilePhoto);
      if (!form.licenseImage) throw new Error('Driving licence image is required');
      fd.append('licenseImage', form.licenseImage);
      const res = await adminFetchForm('/admin/drivers', fd);
      return res;
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setProfilePreview(null);
      setLicensePreview(null);
      setShowForm(false);
      refetch();
      toast.success('Driver registered');
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
      const phone = form.phone.trim();
      if (!isValidSriLankanPhone(phone)) {
        throw new Error('Enter a valid Sri Lankan mobile number (07XXXXXXXX)');
      }
      const normalizedPhone = normalizePhone(phone);
      if (hasFiles) {
        const fd = new FormData();
        fd.append('name', form.name.trim());
        fd.append('phone', normalizedPhone);
        fd.append('nicNumber', form.nicNumber.trim());
        fd.append('vehicleNumber', form.vehicleNumber.trim());
        fd.append('branchIds', JSON.stringify(form.branchIds));
        if (form.profilePhoto) fd.append('profilePhoto', form.profilePhoto);
        if (form.licenseImage) fd.append('licenseImage', form.licenseImage);
        return adminFetchForm(`/admin/drivers/${id}`, fd, 'PATCH');
      }
      return adminFetch(`/admin/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: normalizedPhone,
          nicNumber: form.nicNumber.trim(),
          vehicleNumber: form.vehicleNumber.trim(),
          branchIds: form.branchIds,
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
    const defaultBranchId =
      (filters.storeId && stores.some((s) => s.id === filters.storeId) ? filters.storeId : null) ??
      stores[0]?.id;
    setForm({
      ...EMPTY_FORM,
      branchIds: defaultBranchId ? [defaultBranchId] : [],
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

      <AdminDriverDetailSheet
        driver={selectedDriver}
        open={!!selectedDriver}
        onClose={() => setSelectedDriver(null)}
        canManageStatus={canEditDrivers}
        stores={stores}
        onSave={
          canEditDrivers
            ? async (id, form) => {
                await updateDriver.mutateAsync({ id, form });
              }
            : undefined
        }
        isSaving={updateDriver.isPending}
        onToggleStatus={
          canEditDrivers
            ? (driver) => updateDriverStatus.mutate({ id: driver.id, isActive: !driver.isActive })
            : undefined
        }
        isUpdatingStatus={updateDriverStatus.isPending}
      />

      <div className="card overflow-hidden">
        <div className="border-b border-navy-border px-4 py-4 sm:px-5 flex flex-wrap gap-3 items-end">
          <div className="w-full sm:max-w-xs">
            <label className="block text-xs text-muted mb-1">Search rider</label>
            <SearchableRiderNameField
              value={filters.name}
              onChange={(name) => setFilters((f) => ({ ...f, name }))}
              poolStoreId={poolStoreId}
              showAllBranches={showAllBranches}
              filterStoreId={filters.storeId}
              enabled={showAllBranches || !!storeId}
            />
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
        ) : isError ? (
          <div className="p-8 text-center text-muted">
            <p className="text-sm">{error instanceof Error ? error.message : 'Could not load drivers.'}</p>
          </div>
        ) : drivers.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <UserCircle2 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {filters.name || filters.storeId || filters.status || filters.dutyStatus
                ? 'No riders match your filters.'
                : showAllBranches
                  ? 'No drivers found.'
                  : 'No drivers in this branch pool.'}
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
                    ...(canEditDrivers ? ['Actions'] : []),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
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
                    {canEditDrivers && (
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
        {totalItems > 0 && (
          <div className="border-t border-navy-border px-4 py-3 sm:px-5">
            <AdminTablePagination
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              safePage={safePage}
              totalPages={totalPages}
              pageList={buildPageList(safePage, totalPages)}
              onPageChange={setPage}
              itemLabel="riders"
              ariaLabel="Rider table pagination"
            />
          </div>
        )}
      </div>
    </div>
  );
}
