"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { AddressMapPicker, type AddressSelection } from "@/components/order/AddressMapPicker";
import { authErrorMessage } from "@/components/login-redesign/loginHelpers";
import { api } from "@/lib/api";
import type { Address } from "@/types";
import { ErrorText, fieldLabel, focusRing, OptionalTag, primaryButton, secondaryButton, textField } from "../accountUi";
import { CoverageNote, LABEL_KINDS, labelKind, type LabelKind } from "./addressParts";

/** Sri Lanka's districts, suggested for the District field (any text is accepted). */
const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi",
  "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya",
];
const ADDRESS_MAX_LENGTH = 200;
const NAME_MAX_LENGTH = 40;

type Errors = Partial<Record<"location" | "address" | "city" | "district" | "name" | "form", string>>;

/**
 * Adding (no `address`) or editing a saved address, in a pop-up: a native modal <dialog> like the profile one (the
 * page behind is inert, Escape or a click outside closes it), a sheet up from the bottom on phones.
 * The label (Home, Work, or Other with a name of its own), then the map: the app's own picker (AddressMapPicker, as
 * at checkout): search, tap or drag to pin the exact spot, or use the current location. A pin is required. The
 * street the picker finds fills in the Address field while it's empty or still holds what an earlier pin filled
 * in, so nothing the customer typed is replaced. Under the map, whether a branch delivers there (CoverageNote).
 * Then the city and district, which the backend needs. "Make default" is offered unless it is (or will be) the
 * default anyway. Saves with POST /addresses or PUT /addresses/:id, says so, and closes with the address's id.
 */
export function AddressDialog({ address, isFirst, onClose }: { address?: Address; isFirst: boolean; onClose: (savedId?: string) => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<LabelKind>(address ? labelKind(address.label) : "home");
  const [customName, setCustomName] = useState(address && labelKind(address.label) === "other" && address.label.trim().toLowerCase() !== "other" ? address.label : "");
  const [pin, setPin] = useState<AddressSelection | null>(address && address.lat != null && address.lng != null ? { address: address.addressLine, lat: address.lat, lng: address.lng } : null);
  const [street, setStreet] = useState(address?.addressLine ?? "");
  const [city, setCity] = useState(address?.city ?? "");
  const [district, setDistrict] = useState(address?.district ?? "Colombo");
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  /** What the last pin filled in: replaced by the next pin's, but anything else the customer typed is kept. */
  const filled = useRef(address?.addressLine ?? "");
  const latestStreet = useRef(street);
  useEffect(() => {
    latestStreet.current = street;
  });

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  /** An error goes as soon as its field changes (the rest are checked again on Save). */
  const clearError = (field: keyof Errors) => setErrors((current) => (current[field] || current.form ? { ...current, [field]: undefined, form: undefined } : current));

  const placePin = (selection: AddressSelection) => {
    setPin(selection);
    clearError("location");
    const current = latestStreet.current;
    const found = selection.address?.slice(0, ADDRESS_MAX_LENGTH);
    if (found && (!current.trim() || current === filled.current)) {
      filled.current = found;
      setStreet(found);
      clearError("address");
    }
  };

  const label = kind === "other" ? customName.trim() || "Other" : kind === "home" ? "Home" : "Work";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const next: Errors = {
      ...(!pin && { location: "Pin the spot on the map where we should deliver." }),
      ...(street.trim().length < 5 && { address: "Enter the street address (at least 5 characters)." }),
      ...(city.trim().length < 2 && { city: "Enter the city or area." }),
      ...(district.trim().length < 2 && { district: "Enter the district." }),
    };
    setErrors(next);
    const first = (["location", "address", "city", "district"] as const).find((field) => next[field]);
    if (first) {
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    const body = {
      label,
      addressLine: street.trim(),
      city: city.trim(),
      district: district.trim(),
      lat: pin!.lat,
      lng: pin!.lng,
      // The backend makes the first address the default anyway.
      ...(makeDefault || isFirst ? { isDefault: true } : {}),
    };
    setSaving(true);
    try {
      const before = queryClient.getQueryData<Address[]>(["addresses"]) ?? [];
      const saved = address ? await api.put<Address>(`/addresses/${address.id}`, body, true) : await api.post<Address>("/addresses", body, true);
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      // A new pin within 20 m of a saved one isn't added twice: the backend hands back the one already saved.
      toast.success(!address && before.some((existing) => existing.id === saved.id) ? "That spot is already in your addresses (within 20 m)." : "Address saved.");
      onClose(saved.id);
    } catch (err) {
      setSaving(false);
      setErrors({ form: authErrorMessage(err, "We couldn't save this address. Please try again.") });
    }
  };

  const fieldProps = (field: "address" | "city" | "district") => ({
    id: `${id}-${field}`,
    disabled: saving,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${id}-${field}-error` : undefined,
    className: textField(Boolean(errors[field])),
  });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A close the browser forces (e.g. repeated Escape) still leaves the pop-up; skip the one from unmounting.
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Only a press and release both outside the panel; a map drag or text selection ending outside doesn't close.
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      // Phones and small tablets: a sheet up from the bottom edge, as the profile pop-up; wider: a centred card.
      className="m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-4"
    >
      <form
        noValidate
        onSubmit={submit}
        className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0 md:max-h-[calc(100dvh-2rem)] md:max-w-2xl md:rounded-3xl"
      >
        <header className="shrink-0 px-6 pt-6 pr-18">
          <h2
            id={`${id}-title`}
            className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em]"
          >
            {address ? "Edit address" : "New address"}
          </h2>
          <button
            type="button"
            onClick={() => onClose()}
            aria-label="Close"
            className={cn("absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-6 pt-4 pb-5">
          <fieldset disabled={saving}>
            <legend className={fieldLabel}>Label</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {LABEL_KINDS.map(({ kind: option, text, icon: Icon }) => (
                <label
                  key={option}
                  className={cn(
                    "relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition-colors ring-inset has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600",
                    kind === option ? "bg-brand-600 text-snow ring-brand-600" : "bg-white text-brand-800 ring-brand-200 hover:bg-brand-50",
                  )}
                >
                  <input type="radio" name={`${id}-label`} value={option} checked={kind === option} onChange={() => setKind(option)} className="sr-only" />
                  <Icon className="size-4" aria-hidden="true" />
                  {text}
                </label>
              ))}
            </div>
            {kind === "other" && (
              <div className="mt-3">
                <label htmlFor={`${id}-name`} className={fieldLabel}>
                  Name it <OptionalTag />
                </label>
                <input
                  id={`${id}-name`}
                  type="text"
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="e.g. Mum's place"
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  className={textField(false)}
                />
              </div>
            )}
          </fieldset>

          <div className="mt-5">
            <p className={fieldLabel}>Pin the exact spot</p>
            {/* The checkout's map picker: search, tap or drag the pin, or use the current location. */}
            <div
              id={`${id}-location`}
              tabIndex={-1}
              aria-invalid={errors.location ? true : undefined}
              aria-describedby={errors.location ? `${id}-location-error` : undefined}
              className={cn("mt-2 rounded-2xl outline-none", errors.location && "ring-2 ring-rose-300 ring-offset-4")}
            >
              <AddressMapPicker value={pin} onChange={placePin} autoDetectOnMount={!address} showRoute={false} />
            </div>
            {errors.location && <ErrorText id={`${id}-location-error`}>{errors.location}</ErrorText>}
            {pin && <CoverageNote lat={pin.lat} lng={pin.lng} className="mt-2" />}
          </div>

          <div className="mt-5">
            <label htmlFor={`${id}-address`} className={fieldLabel}>
              Address
            </label>
            <input
              {...fieldProps("address")}
              type="text"
              autoComplete="street-address"
              maxLength={ADDRESS_MAX_LENGTH}
              placeholder="House number and street"
              value={street}
              onChange={(event) => {
                setStreet(event.target.value);
                clearError("address");
              }}
            />
            {errors.address && <ErrorText id={`${id}-address-error`}>{errors.address}</ErrorText>}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-city`} className={fieldLabel}>
                City or area
              </label>
              <input
                {...fieldProps("city")}
                type="text"
                autoComplete="address-level2"
                maxLength={60}
                placeholder="e.g. Havelock Town"
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                  clearError("city");
                }}
              />
              {errors.city && <ErrorText id={`${id}-city-error`}>{errors.city}</ErrorText>}
            </div>
            <div>
              <label htmlFor={`${id}-district`} className={fieldLabel}>
                District
              </label>
              <input
                {...fieldProps("district")}
                type="text"
                autoComplete="address-level1"
                list={`${id}-districts`}
                maxLength={60}
                value={district}
                onChange={(event) => {
                  setDistrict(event.target.value);
                  clearError("district");
                }}
              />
              <datalist id={`${id}-districts`}>
                {DISTRICTS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {errors.district && <ErrorText id={`${id}-district-error`}>{errors.district}</ErrorText>}
            </div>
          </div>

          {!address?.isDefault && !isFirst && (
            <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={makeDefault}
                disabled={saving}
                onChange={(event) => setMakeDefault(event.target.checked)}
                className={cn("size-5 shrink-0 cursor-pointer rounded accent-brand-600", focusRing)}
              />
              Make this my default address
            </label>
          )}

          <div aria-live="polite">{errors.form && <ErrorText>{errors.form}</ErrorText>}</div>
        </div>

        {/* On the sheet, the buttons stay clear of the iPhone home indicator. */}
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-brand-100 px-6 pt-4 pb-5 max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => onClose()} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={cn(primaryButton, "disabled:cursor-wait")}>
            {saving ? "Saving…" : "Save Address"}
            {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
