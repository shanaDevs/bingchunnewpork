"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MapPinPlus, Pencil, Plus, Star, Trash } from "lucide-react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { api } from "@/lib/api";
import type { Address } from "@/types";
import { useAddresses } from "../accountData";
import { card, primaryButton, smallButton } from "../accountUi";
import { AddressDialog } from "./AddressDialog";
import { CoverageNote, DefaultAddressChip, LabelIcon, MAX_ADDRESSES } from "./addressParts";

/**
 * The customer's saved delivery addresses (GET /addresses, the default first): add, edit, delete, and choose the
 * default (the backend makes the first one the default, and picks a new one when the default is deleted). Add
 * Address and Edit open the address pop-up (AddressDialog, with the map). Each card says whether a branch delivers
 * there (CoverageNote, checkout's own check). At most five, as the backend allows. Checkout offers these same
 * addresses.
 */
export function AddressesView() {
  const queryClient = useQueryClient();
  const { data: addresses = [], isLoading, isError, refetch } = useAddresses();
  const full = addresses.length >= MAX_ADDRESSES;
  /** The address being edited, "new" while adding one, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editingAddress = addresses.find((address) => address.id === editing);

  /** Back to the list; focus goes to the saved or edited card's Edit button, or to Add Address. */
  const closeDialog = (focusId?: string | null) => {
    setEditing(null);
    requestAnimationFrame(() => {
      const target = focusId ? document.querySelector<HTMLElement>(`[data-edit-address="${focusId}"]`) : addButtonRef.current;
      target?.focus();
    });
  };

  /** Runs a change, refreshes the list, and says how it went. */
  const change = async (request: () => Promise<unknown>, done: string) => {
    try {
      await request();
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return false;
    }
  };

  if (isLoading) {
    return (
      <p role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
        Loading your addresses…
      </p>
    );
  }

  if (isError) {
    return (
      <div className={cn(card, "flex flex-col items-center px-6 py-10 text-center sm:py-14")}>
        <p className="text-lg font-bold text-brand-950">We couldn&apos;t load your addresses</p>
        <p className="mt-1 max-w-sm text-sm text-slate-600">Check your connection and try again.</p>
        <button type="button" onClick={() => void refetch()} className={cn(primaryButton, "mt-6")}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {addresses.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
          <p className="text-sm font-medium text-slate-500">
            {addresses.length} of {MAX_ADDRESSES} saved
          </p>
          <button ref={addButtonRef} type="button" onClick={() => setEditing("new")} disabled={full} className={primaryButton}>
            <Plus className="size-4" aria-hidden="true" />
            Add Address
          </button>
        </div>
      )}

      {full && (
        <p className="mb-5 rounded-2xl bg-cream-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-cream-200 ring-inset">
          You&apos;ve saved the most addresses you can ({MAX_ADDRESSES}). Delete one to add another.
        </p>
      )}

      {addresses.length === 0 ? (
        <div className={cn(card, "flex flex-col items-center px-6 py-10 text-center sm:py-14")}>
          <span className="grid size-16 place-items-center rounded-[1.25rem] bg-brand-50 text-brand-600">
            <MapPinPlus className="size-8" aria-hidden="true" />
          </span>
          <p className="mt-4 text-lg font-bold text-brand-950">No saved addresses yet</p>
          <p className="mt-1 max-w-sm text-sm text-slate-600">Add home, work or anywhere you love a Bing Chun treat.</p>
          <button ref={addButtonRef} type="button" onClick={() => setEditing("new")} className={cn(primaryButton, "mt-6")}>
            <Plus className="size-4" aria-hidden="true" />
            Add Address
          </button>
        </div>
      ) : (
        <ul data-stagger className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => setEditing(address.id)}
              onDelete={() => change(() => api.delete(`/addresses/${address.id}`, true), "Address deleted.")}
              onMakeDefault={() => change(() => api.put(`/addresses/${address.id}`, { isDefault: true }, true), "Default address updated.")}
            />
          ))}
        </ul>
      )}

      {(editing === "new" || editingAddress) && (
        <AddressDialog address={editingAddress} isFirst={addresses.length === 0} onClose={(savedId) => closeDialog(savedId ?? editingAddress?.id)} />
      )}
    </>
  );
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onMakeDefault,
}: {
  address: Address;
  onEdit: () => void;
  onDelete: () => Promise<boolean>;
  onMakeDefault: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"delete" | "default" | null>(null);
  const isDefault = address.isDefault;

  const run = async (which: "delete" | "default", action: () => Promise<boolean>) => {
    setBusy(which);
    const ok = await action();
    // A deleted card is gone from the list; anything else is ready for the next action.
    if (!ok || which === "default") setBusy(null);
    if (!ok) setConfirming(false);
  };

  return (
    <li className={cn(card, "flex flex-col p-5 sm:p-6", isDefault && "ring-2 ring-brand-300")}>
      <div className="flex flex-1 items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", isDefault ? "bg-brand-600 text-snow" : "bg-brand-50 text-brand-600")}>
          <LabelIcon label={address.label} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold wrap-break-word text-brand-950">{address.label}</span>
            {isDefault && <DefaultAddressChip />}
          </p>
          <p className="mt-1 text-sm wrap-break-word text-slate-700">{address.addressLine}</p>
          <p className="text-sm font-medium text-slate-700">{[address.city, address.district].filter((part, index, all) => part && all.indexOf(part) === index).join(", ")}</p>
          <CoverageNote lat={address.lat} lng={address.lng} className="mt-2.5" />
        </div>
      </div>

      <div role="group" aria-label={`${address.label} address`} className="mt-4 flex flex-wrap items-center gap-1 border-t border-brand-100 pt-3">
        {confirming ? (
          <>
            <p className="mr-auto text-sm font-semibold text-rose-700">Delete this address?</p>
            <button type="button" onClick={() => void run("delete", onDelete)} disabled={busy !== null} className={cn(smallButton, "bg-rose-600 text-snow hover:bg-rose-700 disabled:cursor-wait")}>
              {busy === "delete" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
              Delete
            </button>
            {/* Focused as it appears, so the keyboard lands on the safe choice. */}
            <button type="button" autoFocus onClick={() => setConfirming(false)} disabled={busy !== null} className={smallButton}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button type="button" data-edit-address={address.id} onClick={onEdit} aria-label={`Edit ${address.label} address`} className={smallButton}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </button>
            <button type="button" onClick={() => setConfirming(true)} className={cn(smallButton, "text-rose-700 hover:bg-rose-50")}>
              <Trash className="size-3.5" aria-hidden="true" />
              Delete
            </button>
            {!isDefault && (
              <button type="button" onClick={() => void run("default", onMakeDefault)} disabled={busy !== null} className={cn(smallButton, "ml-auto disabled:cursor-wait")}>
                {busy === "default" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Star className="size-3.5" aria-hidden="true" />}
                Set as default
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
