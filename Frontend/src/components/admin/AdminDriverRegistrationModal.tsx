'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Camera,
  Check,
  CreditCard,
  FileImage,
  Loader2,
  Phone,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { validateImageFile } from '@/lib/imageUpload';
import { formatPhoneInput, isValidSriLankanPhone } from '@/lib/phone';

export type DriverRegistrationFormState = {
  name: string;
  phone: string;
  nicNumber: string;
  address: string;
  vehicleType: string;
  vehicleNumber: string;
  vehicleColor: string;
  licenseNumber: string;
  disabilities: string;
  isActive: boolean;
  branchIds: string[];
  profilePhoto: File | null;
  licenseImage: File | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  stores: { id: string; name: string }[];
  form: DriverRegistrationFormState;
  onFormChange: (updater: (prev: DriverRegistrationFormState) => DriverRegistrationFormState) => void;
  profilePreview: string | null;
  licensePreview: string | null;
  onProfilePhotoChange: (file: File | null) => void;
  onLicenseImageChange: (file: File | null) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
};

function formatBranchName(name: string): string {
  return name.replace('Bing Chun - ', '');
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted mb-1.5">
      {children}
      {required && <span className="text-brand ml-0.5">*</span>}
    </label>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-navy-border bg-navy-light/20 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-navy-border/80 px-4 py-3.5 sm:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon size={18} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          {description && <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function UploadZone({
  label,
  hint,
  previewUrl,
  previewClassName,
  onChange,
  icon: Icon,
}: {
  label: string;
  hint: string;
  previewUrl: string | null;
  previewClassName?: string;
  onChange: (file: File | null) => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(file: File | null) {
    if (!file) return;
    const message = validateImageFile(file, label);
    if (message) {
      toast.error(message);
      return;
    }
    onChange(file);
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`group relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-all ${
          dragOver
            ? 'border-brand bg-brand/5'
            : previewUrl
              ? 'border-brand/40 bg-brand/5'
              : 'border-navy-border bg-navy-light/30 hover:border-brand/50 hover:bg-navy-light/50'
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className={previewClassName ?? 'h-20 w-20 rounded-lg object-cover shadow-md'}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-light text-muted group-hover:text-brand transition-colors">
            <Icon size={22} />
          </div>
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-fg">
            {previewUrl ? 'Click to replace' : 'Upload image'}
          </p>
          <p className="text-xs text-muted mt-0.5">{hint}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </button>
    </div>
  );
}

export default function AdminDriverRegistrationModal({
  open,
  onClose,
  stores,
  form,
  onFormChange,
  profilePreview,
  licensePreview,
  onProfilePhotoChange,
  onLicenseImageChange,
  onSubmit,
  isSubmitting,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isSubmitting]);

  const filteredBranches = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => formatBranchName(s.name).toLowerCase().includes(q));
  }, [stores, branchSearch]);

  const phoneInvalid = form.phone.trim().length > 0 && !isValidSriLankanPhone(form.phone);

  const canSubmit =
    form.branchIds.length > 0 &&
    form.name.trim() &&
    isValidSriLankanPhone(form.phone) &&
    form.nicNumber.trim() &&
    form.vehicleNumber.trim() &&
    !!form.licenseImage;

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1200] bg-black/55 backdrop-blur-sm"
            onClick={() => !isSubmitting && onClose()}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="driver-registration-title"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="fixed left-1/2 top-1/2 z-[1201] flex max-h-[min(94vh,880px)] w-[min(96vw,52rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 border-b border-navy-border bg-gradient-to-r from-navy-light/40 to-transparent px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-lg shadow-brand/20">
                    <UserPlus size={20} />
                  </div>
                  <div className="min-w-0">
                    <h2 id="driver-registration-title" className="text-lg font-bold text-white truncate">
                      Register new driver
                    </h2>
                    <p className="text-xs text-muted mt-1 leading-relaxed max-w-md">
                      Create a delivery driver profile, assign branch pools, and enable mobile OTP sign-in.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-5">
                {/* Profile hero row */}
                <div className="flex flex-col sm:flex-row gap-5 items-start">
                  <div className="flex flex-col items-center gap-3 shrink-0 mx-auto sm:mx-0">
                    <div className="relative">
                      {profilePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profilePreview}
                          alt="Profile"
                          className="h-24 w-24 rounded-2xl object-cover ring-2 ring-brand/30 shadow-lg"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-navy-light border border-navy-border text-muted">
                          <User size={36} strokeWidth={1.5} />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => document.getElementById('driver-profile-input')?.click()}
                        className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow-md hover:bg-brand/90 transition-colors"
                        aria-label="Upload profile photo"
                      >
                        <Camera size={14} />
                      </button>
                      <input
                        id="driver-profile-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onProfilePhotoChange(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <p className="text-[11px] text-muted text-center max-w-[120px]">JPEG, PNG or WebP · max 5 MB</p>
                  </div>

                  <div className="flex-1 w-full grid sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>Full name</FieldLabel>
                      <input
                        placeholder="Nuwan Perera"
                        value={form.name}
                        onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))}
                        className="input-field w-full"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel required>Phone number</FieldLabel>
                      <div className="input-icon-wrap w-full">
                        <Phone size={14} className="input-icon" aria-hidden />
                        <input
                          placeholder="077 123 4567"
                          value={form.phone}
                          onChange={(e) =>
                            onFormChange((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))
                          }
                          className="input-field w-full pl-9"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                        />
                      </div>
                      {phoneInvalid && (
                        <p className="text-[11px] text-red-400 mt-1">Use a valid mobile number (07XXXXXXXX).</p>
                      )}
                    </div>
                    <div>
                      <FieldLabel required>NIC / ID number</FieldLabel>
                      <input
                        placeholder="200012345678"
                        value={form.nicNumber}
                        onChange={(e) => onFormChange((f) => ({ ...f, nicNumber: e.target.value }))}
                        className="input-field w-full"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel required>Vehicle number</FieldLabel>
                      <input
                        placeholder="CAB-1234"
                        value={form.vehicleNumber}
                        onChange={(e) => onFormChange((f) => ({ ...f, vehicleNumber: e.target.value }))}
                        className="input-field w-full uppercase tracking-wide"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel>Vehicle type</FieldLabel>
                      <input
                        placeholder="Bike / Scooter / Car"
                        value={form.vehicleType}
                        onChange={(e) => onFormChange((f) => ({ ...f, vehicleType: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <FieldLabel>Vehicle colour</FieldLabel>
                      <input
                        value={form.vehicleColor}
                        onChange={(e) => onFormChange((f) => ({ ...f, vehicleColor: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <FieldLabel>Address</FieldLabel>
                      <input
                        value={form.address}
                        onChange={(e) => onFormChange((f) => ({ ...f, address: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <FieldLabel>Licence number</FieldLabel>
                      <input
                        value={form.licenseNumber}
                        onChange={(e) => onFormChange((f) => ({ ...f, licenseNumber: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <FieldLabel>Disabilities (optional)</FieldLabel>
                      <input
                        value={form.disabilities}
                        onChange={(e) => onFormChange((f) => ({ ...f, disabilities: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Branch pools */}
                <SectionCard
                  icon={Building2}
                  title="Branch pool assignment"
                  description="Select every branch where this driver can receive delivery jobs."
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="relative flex-1 min-w-[180px]">
                      <input
                        type="text"
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                        placeholder="Search branches…"
                        className="input-field w-full text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onFormChange((f) => ({ ...f, branchIds: stores.map((s) => s.id) }))
                      }
                      className="btn-outline px-3 py-2 text-xs"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => onFormChange((f) => ({ ...f, branchIds: [] }))}
                      className="btn-outline px-3 py-2 text-xs"
                    >
                      Clear
                    </button>
                    <span className="text-xs font-medium text-brand tabular-nums ml-auto">
                      {form.branchIds.length} selected
                    </span>
                  </div>

                  <div className="max-h-44 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-navy-border bg-navy-light/20 divide-y divide-navy-border/60">
                    {filteredBranches.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted">No branches match your search.</p>
                    ) : (
                      filteredBranches.map((branch) => {
                        const selected = form.branchIds.includes(branch.id);
                        return (
                          <label
                            key={branch.id}
                            className={`relative flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-navy-light/40 ${
                              selected ? 'bg-brand/5' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                onFormChange((f) => ({
                                  ...f,
                                  branchIds: selected
                                    ? f.branchIds.filter((id) => id !== branch.id)
                                    : [...f.branchIds, branch.id],
                                }))
                              }
                              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            />
                            <span
                              className={`pointer-events-none flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                selected
                                  ? 'border-brand bg-brand text-white'
                                  : 'border-navy-border bg-navy-light'
                              }`}
                            >
                              {selected && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className={`pointer-events-none min-w-0 flex-1 break-words text-sm ${selected ? 'text-white font-medium' : 'text-fg'}`}>
                              {formatBranchName(branch.name)}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {form.branchIds.length === 0 && (
                    <p className="text-xs text-amber-400/90 mt-2">Select at least one branch to continue.</p>
                  )}
                </SectionCard>

                {/* Account status & documents */}
                <div className="grid lg:grid-cols-2 gap-5">
                  <SectionCard
                    icon={User}
                    title="Account status"
                    description="Riders sign in on the delivery app with their registered mobile number."
                  >
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-navy-border bg-navy-light/30 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-fg">Active on registration</p>
                        <p className="text-xs text-muted mt-0.5">Driver can sign in immediately after creation</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.isActive}
                        onClick={() => onFormChange((f) => ({ ...f, isActive: !f.isActive }))}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          form.isActive ? 'bg-brand' : 'bg-navy-border'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            form.isActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  </SectionCard>

                  <SectionCard
                    icon={CreditCard}
                    title="Driving licence"
                    description="Required. Upload a clear photo of the driver's licence."
                  >
                    <UploadZone
                      label="Licence image"
                      hint="JPEG, PNG or WebP · max 5 MB"
                      previewUrl={licensePreview}
                      previewClassName="h-24 w-full max-w-[200px] rounded-lg object-cover shadow-md"
                      onChange={onLicenseImageChange}
                      icon={FileImage}
                    />
                  </SectionCard>
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex items-center justify-between gap-3 border-t border-navy-border bg-navy-light/20 px-5 py-4 sm:px-6">
                <p className="text-xs text-muted hidden sm:block">
                  Super Admin only · Changes apply immediately across assigned branch pools
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="btn-outline px-4 py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !canSubmit}
                    className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 min-w-[140px] justify-center"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        Register driver
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
