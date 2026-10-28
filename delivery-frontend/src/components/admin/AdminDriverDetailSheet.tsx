'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Camera,
  Car,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  MessageSquareHeart,
  Pencil,
  Phone,
  Power,
  Star,
  Truck,
  UserCircle2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Driver, DriverDutyStatus, DriverRatingsPayload } from '@/types';
import toast from 'react-hot-toast';
import { validateImageFile } from '@/lib/imageUpload';
import { adminApiFetch } from '@/lib/adminApi';
import { parseLkrString } from '@/lib/moneyString';
import { StarRatingDisplay } from '@/components/ui/StarRatingInput';

export type DriverEditFormState = {
  name: string;
  phone: string;
  nicNumber: string;
  vehicleNumber: string;
  pin: string;
  branchIds: string[];
  profilePhoto: File | null;
  licenseImage: File | null;
};

function formatBranchName(name: string): string {
  return name.replace('Bing Chun - ', '');
}

function formatAmount(amount: number | string): string {
  const n = typeof amount === 'string' ? parseLkrString(amount) : amount;
  return n.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatRating(avg: number | null, count: number): string {
  if (avg == null || count === 0) return 'No ratings yet';
  return `${avg.toFixed(1)} (${count} review${count === 1 ? '' : 's'})`;
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

function formatLastLogin(value?: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

function driverBranchIds(driver: Driver): string[] {
  if (driver.accessibleStores.length > 0) return driver.accessibleStores.map((s) => s.id);
  return driver.store ? [driver.store.id] : [];
}

function editFormFromDriver(driver: Driver): DriverEditFormState {
  return {
    name: driver.name,
    phone: driver.phone ?? '',
    nicNumber: driver.nicNumber ?? '',
    vehicleNumber: driver.vehicleNumber ?? '',
    pin: '',
    branchIds: driverBranchIds(driver),
    profilePhoto: null,
    licenseImage: null,
  };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-navy-border/60 last:border-0">
      <dt className="text-xs text-muted shrink-0">{label}</dt>
      <dd className="text-sm text-fg text-right font-medium">{value}</dd>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted mb-1.5">
      {children}
      {required && <span className="text-brand ml-0.5">*</span>}
    </label>
  );
}

function DocumentPreviewCard({
  title,
  description,
  imageUrl,
  variant,
  icon: Icon,
}: {
  title: string;
  description: string;
  imageUrl: string;
  variant: 'portrait' | 'license';
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <article className="group flex flex-col rounded-xl border border-navy-border bg-gradient-to-b from-navy-light/40 to-navy-light/10 overflow-hidden shadow-sm h-full">
      <div className="flex flex-col gap-2.5 px-3 py-3 border-b border-navy-border/50 flex-none">
        <div className="flex items-center justify-between">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Icon size={16} />
          </div>
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-navy-border bg-navy-card px-2 py-1 text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
          >
            Open
            <ExternalLink size={11} />
          </a>
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white truncate">{title}</h4>
          <p className="text-[11px] text-muted mt-0.5 leading-snug line-clamp-2">{description}</p>
        </div>
      </div>
      <div className="relative flex-1 w-full bg-[linear-gradient(145deg,rgba(255,255,255,0.03),rgba(0,0,0,0.08))] aspect-square min-h-[160px]">
        <div className="absolute inset-2 rounded-lg border border-white/5 bg-navy-light/20 shadow-inner" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={title}
          className={`absolute inset-2 rounded-lg w-[calc(100%-16px)] h-[calc(100%-16px)] ${
            variant === 'portrait' ? 'object-cover object-top' : 'object-contain bg-black/20'
          }`}
        />
      </div>
    </article>
  );
}

type Props = {
  driver: Driver | null;
  open: boolean;
  onClose: () => void;
  canManageStatus?: boolean;
  stores?: { id: string; name: string }[];
  onToggleStatus?: (driver: Driver) => void;
  onSave?: (driverId: string, form: DriverEditFormState) => Promise<void>;
  isUpdatingStatus?: boolean;
  isSaving?: boolean;
};

export default function AdminDriverDetailSheet({
  driver,
  open,
  onClose,
  canManageStatus = false,
  stores = [],
  onToggleStatus,
  onSave,
  isUpdatingStatus = false,
  isSaving = false,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<DriverEditFormState | null>(null);
  const [branchSearch, setBranchSearch] = useState('');
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setEditForm(null);
      setBranchSearch('');
      setShowPin(false);
      setProfilePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setLicensePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open]);

  useEffect(() => {
    if (driver && isEditing) {
      setEditForm(editFormFromDriver(driver));
    }
  }, [driver, isEditing]);

  const branches =
    driver && driver.accessibleStores.length > 0
      ? driver.accessibleStores
      : driver?.store
        ? [driver.store]
        : [];

  const filteredBranches = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => formatBranchName(s.name).toLowerCase().includes(q));
  }, [stores, branchSearch]);

  const profileDisplayUrl =
    profilePreview ?? (isEditing ? driver?.profilePhotoUrl : null) ?? driver?.profilePhotoUrl ?? null;
  const licenseDisplayUrl =
    licensePreview ?? (isEditing ? driver?.licenseImageUrl : null) ?? driver?.licenseImageUrl ?? null;

  const { data: ratingsPayload, isLoading: ratingsLoading } = useQuery({
    queryKey: ['admin-driver-ratings', driver?.id],
    queryFn: async () =>
      adminApiFetch<DriverRatingsPayload>(
        `/admin/drivers/${encodeURIComponent(driver!.id)}/ratings`,
      ),
    enabled: open && !!driver?.id,
  });

  const avgRating = ratingsPayload?.average ?? driver?.avgRiderRating ?? null;
  const ratingCount = ratingsPayload?.count ?? driver?.riderRatingCount ?? 0;

  const canSaveEdit =
    !!editForm &&
    editForm.branchIds.length > 0 &&
    editForm.name.trim() &&
    editForm.phone.trim() &&
    editForm.nicNumber.trim() &&
    editForm.vehicleNumber.trim();

  function startEditing() {
    if (!driver) return;
    setEditForm(editFormFromDriver(driver));
    setIsEditing(true);
  }

  function cancelEditing() {
    if (isSaving) return;
    setIsEditing(false);
    setEditForm(null);
    setBranchSearch('');
    setShowPin(false);
    if (profilePreview) URL.revokeObjectURL(profilePreview);
    if (licensePreview) URL.revokeObjectURL(licensePreview);
    setProfilePreview(null);
    setLicensePreview(null);
  }

  async function handleSave() {
    if (!driver || !editForm || !onSave || !canSaveEdit) return;
    await onSave(driver.id, editForm);
    setIsEditing(false);
    setEditForm(null);
    setBranchSearch('');
    setShowPin(false);
    if (profilePreview) URL.revokeObjectURL(profilePreview);
    if (licensePreview) URL.revokeObjectURL(licensePreview);
    setProfilePreview(null);
    setLicensePreview(null);
  }

  function handleProfilePhotoChange(file: File | null) {
    if (!editForm) return;
    if (file) {
      const message = validateImageFile(file, 'Profile image');
      if (message) {
        toast.error(message);
        return;
      }
    }
    setEditForm({ ...editForm, profilePhoto: file });
    if (profilePreview) URL.revokeObjectURL(profilePreview);
    setProfilePreview(file ? URL.createObjectURL(file) : null);
  }

  function handleLicenseImageChange(file: File | null) {
    if (!editForm) return;
    if (file) {
      const message = validateImageFile(file, 'Driving licence image');
      if (message) {
        toast.error(message);
        return;
      }
    }
    setEditForm({ ...editForm, licenseImage: file });
    if (licensePreview) URL.revokeObjectURL(licensePreview);
    setLicensePreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/45 supports-backdrop-filter:backdrop-blur-sm"
        className="relative fixed top-1/2 left-1/2 flex h-[90vh] max-h-[920px] w-[94vw] !max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-2xl border border-navy-border bg-navy-card p-0 text-fg shadow-2xl duration-200 data-open:zoom-in-95 max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none"
      >
        {driver && (
          <>
            <DialogHeader className="border-b border-navy-border px-5 py-5 space-y-4 shrink-0 text-left">
              <div className="flex items-start gap-4 pr-12">
                {profileDisplayUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileDisplayUrl}
                    alt={driver.name}
                    className="h-16 w-16 rounded-2xl object-cover ring-2 ring-brand/20 shrink-0"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-light border border-navy-border shrink-0">
                    <UserCircle2 size={32} className="text-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-white text-lg font-bold truncate">
                    {isEditing && editForm ? editForm.name || driver.name : driver.name}
                  </DialogTitle>
                  <DialogDescription className="text-muted text-sm mt-1">
                    {isEditing && editForm
                      ? editForm.vehicleNumber || 'No vehicle registered'
                      : driver.vehicleNumber ?? 'No vehicle registered'}
                  </DialogDescription>
                  {!isEditing && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${dutyStatusClass(driver.dutyStatus)}`}
                      >
                        {dutyStatusLabel(driver.dutyStatus)}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          driver.isActive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
                        }`}
                      >
                        {driver.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <DialogClose
                aria-label="Close rider profile"
                className="absolute right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-navy-border bg-navy-card text-muted hover:bg-navy-light hover:text-fg transition-colors"
              >
                <X size={16} aria-hidden />
              </DialogClose>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isEditing && editForm ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
                      <UserCircle2 size={13} /> Profile details
                    </h3>
                    <div className="rounded-xl border border-navy-border bg-navy-light/20 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          {profileDisplayUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={profileDisplayUrl}
                              alt="Profile"
                              className="h-16 w-16 rounded-xl object-cover ring-2 ring-brand/20"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-navy-light border border-navy-border">
                              <UserCircle2 size={28} className="text-muted" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => document.getElementById('edit-driver-profile-input')?.click()}
                            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white shadow-md hover:bg-brand/90"
                            aria-label="Change profile photo"
                          >
                            <Camera size={12} />
                          </button>
                          <input
                            id="edit-driver-profile-input"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleProfilePhotoChange(e.target.files?.[0] ?? null)}
                          />
                        </div>
                        <p className="text-xs text-muted leading-relaxed">
                          Tap the camera icon to replace the profile photo.
                        </p>
                      </div>
                      <div>
                        <FieldLabel required>Full name</FieldLabel>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="input-field w-full text-sm"
                        />
                      </div>
                      <div>
                        <FieldLabel required>Phone number</FieldLabel>
                        <div className="input-icon-wrap w-full">
                          <Phone size={14} className="input-icon" aria-hidden />
                          <input
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="input-field w-full text-sm pl-9"
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel required>NIC / ID number</FieldLabel>
                        <input
                          value={editForm.nicNumber}
                          onChange={(e) => setEditForm({ ...editForm, nicNumber: e.target.value })}
                          className="input-field w-full text-sm"
                        />
                      </div>
                      <div>
                        <FieldLabel required>Vehicle number</FieldLabel>
                        <input
                          value={editForm.vehicleNumber}
                          onChange={(e) => setEditForm({ ...editForm, vehicleNumber: e.target.value })}
                          className="input-field w-full text-sm uppercase tracking-wide"
                        />
                      </div>
                      <div>
                        <FieldLabel>New PIN (optional)</FieldLabel>
                        <div className="input-icon-wrap w-full input-icon-wrap--end">
                          <input
                            type={showPin ? 'text' : 'password'}
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={12}
                            placeholder="Leave blank to keep current PIN"
                            value={editForm.pin}
                            onChange={(e) =>
                              setEditForm({ ...editForm, pin: e.target.value.replace(/\D/g, '').slice(0, 12) })
                            }
                            className="input-field w-full text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPin((v) => !v)}
                            className="input-action p-1 text-muted hover:text-fg"
                            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                          >
                            {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <p className="text-[11px] text-muted mt-1">
                          Required only if you remove the rider&apos;s current primary branch from their pool.
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="space-y-6">
                    {stores.length > 0 && (
                      <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
                          <Building2 size={13} /> Branch pools
                        </h3>
                        <div className="rounded-xl border border-navy-border bg-navy-light/20 p-4 space-y-3">
                          <input
                            type="text"
                            value={branchSearch}
                            onChange={(e) => setBranchSearch(e.target.value)}
                            placeholder="Search branches…"
                            className="input-field w-full text-sm"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditForm({ ...editForm, branchIds: stores.map((s) => s.id) })
                              }
                              className="btn-outline px-2.5 py-1.5 text-xs"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditForm({ ...editForm, branchIds: [] })}
                              className="btn-outline px-2.5 py-1.5 text-xs"
                            >
                              Clear
                            </button>
                            <span className="text-xs text-brand ml-auto self-center tabular-nums">
                              {editForm.branchIds.length} selected
                            </span>
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                            {filteredBranches.map((store) => {
                              const checked = editForm.branchIds.includes(store.id);
                              return (
                                <label
                                  key={store.id}
                                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                    checked
                                      ? 'border-brand/40 bg-brand/10'
                                      : 'border-navy-border hover:bg-navy-light/40'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? editForm.branchIds.filter((id) => id !== store.id)
                                        : [...editForm.branchIds, store.id];
                                      setEditForm({ ...editForm, branchIds: next });
                                    }}
                                    className="rounded border-navy-border text-brand focus:ring-brand"
                                  />
                                  <span className="text-sm text-fg">{formatBranchName(store.name)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    )}

                    <section className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
                        <CreditCard size={13} /> Documents
                      </h3>
                      <div className="rounded-xl border border-navy-border bg-navy-light/20 p-4 space-y-4">
                        <div>
                          <FieldLabel>Driving licence</FieldLabel>
                          {licenseDisplayUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={licenseDisplayUrl}
                              alt="Licence preview"
                              className="mb-2 h-24 w-full rounded-lg object-contain bg-black/20 border border-navy-border"
                            />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="input-field w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
                            onChange={(e) => handleLicenseImageChange(e.target.files?.[0] ?? null)}
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                  <div className="space-y-6 min-w-0">
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                        <UserCircle2 size={13} /> Identity
                      </h3>
                      <dl className="rounded-xl border border-navy-border bg-navy-light/20 px-4">
                        <DetailRow label="Phone" value={driver.phone ?? '—'} />
                        <DetailRow label="NIC / ID" value={driver.nicNumber ?? '—'} />
                        <DetailRow label="Vehicle" value={driver.vehicleNumber ?? '—'} />
                        <DetailRow label="Last login" value={formatLastLogin(driver.lastLoginAt)} />
                      </dl>
                    </section>

                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                        <Building2 size={13} /> Branch pools
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {branches.length > 0 ? (
                          branches.map((branch) => (
                            <span
                              key={branch.id}
                              className="inline-flex items-center rounded-lg border border-navy-border bg-navy-light/30 px-2.5 py-1 text-xs text-fg"
                            >
                              {formatBranchName(branch.name)}
                              {branch.city ? ` · ${branch.city}` : ''}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-muted">No branches assigned</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                        <Truck size={13} /> Delivery performance
                      </h3>
                      <dl className="rounded-xl border border-navy-border bg-navy-light/20 px-4">
                        <DetailRow label="Completed orders" value={driver.completedJobCount} />
                        <DetailRow
                          label="Avg rating"
                          value={
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <Star size={13} className="fill-current" />
                              {formatRating(avgRating, ratingCount)}
                            </span>
                          }
                        />
                        <DetailRow label="Delivery fees (LKR)" value={formatAmount(driver.totalDeliveryFees)} />
                        <DetailRow
                          label="Merit points"
                          value={`${driver.meritPoints ?? 100} · ${driver.meritStatus ?? 'EXCELLENT'}`}
                        />
                      </dl>
                    </section>

                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                        <MessageSquareHeart size={13} /> Customer reviews
                      </h3>
                      {ratingsLoading ? (
                        <div className="flex items-center gap-2 rounded-xl border border-navy-border bg-navy-light/20 px-4 py-3 text-sm text-muted">
                          <Loader2 size={14} className="animate-spin" />
                          Loading reviews…
                        </div>
                      ) : ratingCount === 0 ? (
                        <p className="rounded-xl border border-navy-border bg-navy-light/20 px-4 py-3 text-sm text-muted">
                          No ratings yet
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {(ratingsPayload?.ratings ?? []).map((review) => (
                            <li
                              key={review.id}
                              className="rounded-xl border border-navy-border bg-navy-light/20 px-4 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <StarRatingDisplay value={review.stars} size={16} className="justify-start" />
                                <p className="text-[11px] text-muted shrink-0">
                                  {new Date(review.createdAt).toLocaleString('en-LK', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </p>
                              </div>
                              {review.comment && (
                                <p className="mt-1.5 text-sm text-fg leading-snug">{review.comment}</p>
                              )}
                              <p className="mt-1 text-[11px] text-muted">Order #{review.orderNumber}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>

                  <div className="space-y-6 min-w-0">
                    {(driver.profilePhotoUrl || driver.licenseImageUrl) && (
                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">
                          <CreditCard size={13} /> Documents
                        </h3>
                        <div
                          className={`grid gap-3 ${driver.profilePhotoUrl && driver.licenseImageUrl ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-1' : 'grid-cols-1'}`}
                        >
                          {driver.profilePhotoUrl && (
                            <DocumentPreviewCard
                              title="Profile photo"
                              description="Official rider portrait for identification"
                              imageUrl={driver.profilePhotoUrl}
                              variant="portrait"
                              icon={UserCircle2}
                            />
                          )}
                          {driver.licenseImageUrl && (
                            <DocumentPreviewCard
                              title="Driving licence"
                              description="Government-issued licence on file"
                              imageUrl={driver.licenseImageUrl}
                              variant="license"
                              icon={IdCard}
                            />
                          )}
                        </div>
                      </section>
                    )}

                    {driver.store && (
                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                          <Car size={13} /> Primary branch
                        </h3>
                        <p className="text-sm text-fg">{formatBranchName(driver.store.name)}</p>
                      </section>
                    )}
                  </div>
                </div>
              )}
            </div>

            {canManageStatus && (
              <DialogFooter className="mx-0 mb-0 rounded-none border-t border-navy-border bg-navy-card px-5 py-4 shrink-0 flex-col gap-2 sm:flex-row sm:justify-end">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={isSaving}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted border border-navy-border hover:bg-navy-light transition-colors disabled:opacity-50"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canSaveEdit || isSaving}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                      Save changes
                    </button>
                  </>
                ) : (
                  <>
                    {onToggleStatus && (
                      <button
                        type="button"
                        onClick={() => onToggleStatus(driver)}
                        disabled={isUpdatingStatus}
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                          driver.isActive
                            ? 'text-red-400 border border-red-400/30 hover:bg-red-400/10'
                            : 'text-green-400 border border-green-400/30 hover:bg-green-400/10'
                        }`}
                      >
                        <Power size={16} />
                        {driver.isActive ? 'Suspend rider' : 'Reactivate rider'}
                      </button>
                    )}
                    {onSave && (
                      <button
                        type="button"
                        onClick={startEditing}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-brand border border-brand/30 hover:bg-brand/10 transition-colors"
                      >
                        <Pencil size={16} />
                        Edit rider details
                      </button>
                    )}
                  </>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
