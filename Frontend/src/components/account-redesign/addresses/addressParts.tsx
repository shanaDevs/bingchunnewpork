"use client";

import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, CircleAlert, CircleCheck, House, LoaderCircle, MapPin, Star, Truck, type LucideIcon } from "lucide-react";
import { cn } from "@/components/home-redesign/lib/cn";
import { api } from "@/lib/api";
import type { DeliveryValidation } from "@/types";

/** The backend allows at most this many saved addresses (lib/userAddresses). */
export const MAX_ADDRESSES = 5;

/** The labels offered as chips. The backend keeps any text, so an older address may have its own name ("Mum's place"): shown as Other with that name. */
export type LabelKind = "home" | "work" | "other";
export const LABEL_KINDS: { kind: LabelKind; text: string; icon: LucideIcon }[] = [
  { kind: "home", text: "Home", icon: House },
  { kind: "work", text: "Work", icon: BriefcaseBusiness },
  { kind: "other", text: "Other", icon: MapPin },
];

export function labelKind(label: string): LabelKind {
  const value = label.trim().toLowerCase();
  return value === "home" ? "home" : value === "work" ? "work" : "other";
}

/** The icon for an address's label: a house, a briefcase, or a pin for any other. */
export function LabelIcon({ label, className }: { label: string; className?: string }) {
  const kind = labelKind(label);
  if (kind === "home") return <House className={className} aria-hidden="true" />;
  if (kind === "work") return <BriefcaseBusiness className={className} aria-hidden="true" />;
  return <MapPin className={className} aria-hidden="true" />;
}

/** "Default", the sunny tag on the default address. */
export function DefaultAddressChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sun-300 px-2 py-0.5 text-[0.6875rem] font-bold tracking-[0.08em] text-brand-950 uppercase">
      <Star className="size-3 fill-current" aria-hidden="true" />
      Default
    </span>
  );
}

const branchName = (name: string) => name.replace(/^Bing Chun\s*[-–—]\s*/i, "Bing Chun ");

/**
 * Whether a branch delivers to a pin, from the same check checkout uses (POST /stores/validate-delivery, which only
 * reads): green "In range of Bing Chun …"; amber "Outside our delivery range (12.4 km from …)" when no branch
 * reaches; otherwise (no pin, a branch in range but closed right now, or the check failing) the neutral "Delivery is
 * checked when you order".
 */
export function CoverageNote({ lat, lng, className }: { lat?: number | null; lng?: number | null; className?: string }) {
  const pinned = lat != null && lng != null;
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-coverage", lat, lng],
    queryFn: () => api.post<DeliveryValidation>("/stores/validate-delivery", { lat, lng }),
    enabled: pinned,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const status = !pinned ? "unchecked" : isLoading ? "checking" : data?.eligible && data.store ? "inRange" : data?.reason === "out-of-range" ? "outOfRange" : "unchecked";
  const tone = status === "inRange" ? "text-emerald-700" : status === "outOfRange" ? "text-amber-700" : "text-slate-500";
  const Icon = status === "inRange" ? CircleCheck : status === "outOfRange" ? CircleAlert : status === "checking" ? LoaderCircle : Truck;

  return (
    <p
      title={status === "inRange" ? "Checked from the pin on the map. Confirmed again when you order." : undefined}
      className={cn("flex items-start gap-1.5 text-xs font-medium", tone, className)}
    >
      <Icon className={cn("mt-px size-3.5 shrink-0", status === "checking" && "animate-spin")} aria-hidden="true" />
      {status === "inRange"
        ? `In range of ${branchName(data!.store!.name)}`
        : status === "outOfRange"
          ? `Outside our delivery range${data?.nearestBranch ? ` (${data.nearestBranch.distanceKm} km from ${branchName(data.nearestBranch.name)})` : ""}`
          : status === "checking"
            ? "Checking delivery…"
            : "Delivery is checked when you order"}
    </p>
  );
}
