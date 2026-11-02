import { isBranchManuallyClosed } from "@/lib/storeOrderingHours";
import { toMapLatLng } from "@/lib/storeCoordinates";
import type { Store } from "@/types";

export type LatLng = { lat: number; lng: number };

/** A store as the finder uses it: the admin's store, with its map position checked (null when it has none). */
export type FinderStore = Store & { location: LatLng | null };

/** The admin's stores from GET /stores, each with a usable map position where it has one. */
export const toFinderStores = (stores: Store[]): FinderStore[] =>
  stores.map((store) => ({ ...store, location: toMapLatLng(store.lat, store.lng) }));

export function distanceKm(a: LatLng, b: LatLng) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The stores nearest `from` first (a sorted copy); stores without a map position go last. */
export const sortByDistance = (list: FinderStore[], from: LatLng) =>
  [...list].sort(
    (a, b) => (a.location ? distanceKm(a.location, from) : Infinity) - (b.location ? distanceKm(b.location, from) : Infinity),
  );

/** Lower-cased, punctuation-free form, with leading zeros dropped so "Colombo 3" matches "Colombo 03". */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/\b0+(?=\d)/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Stores whose name, town, district or address contains the query (so "Colombo 5" works too). Name, town and
 * district matches come before address-only ones, so "Kandy" lists the Kandy stores before those on a Kandy Road.
 * With `near`, each group is nearest first.
 */
export function searchStores(stores: FinderStore[], query: string, near?: LatLng | null) {
  const needle = normalize(query);
  const sorted = (list: FinderStore[]) => (near ? sortByDistance(list, near) : list);
  if (!needle) return sorted(stores);
  const matches = (field: string | null | undefined) => normalize(field ?? "").includes(needle);
  const byPlace = stores.filter((store) => [store.name, store.city, store.district].some(matches));
  const byAddress = stores.filter((store) => !byPlace.includes(store) && matches(store.addressLine));
  return [...sorted(byPlace), ...sorted(byAddress)];
}

/** Straight-line distance for display: "850 m", "4.2 km", "18 km". */
export function formatDistance(km: number) {
  const metres = Math.max(50, Math.round((km * 1000) / 50) * 50);
  if (metres < 1000) return `${metres} m`;
  return km < 9.95 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** The store's address with its town, unless the address already names it. */
export function storeAddress(store: Store) {
  const line = store.addressLine.trim();
  const city = store.city?.trim();
  return city && !normalize(line).includes(normalize(city)) ? `${line}, ${city}` : line;
}

/** "23:00" → "11 PM", "09:30" → "9:30 AM". */
export function formatTime(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const suffix = hours >= 12 && hours < 24 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "9 AM – 11 PM". */
export const formatHours = (store: Pick<Store, "openTime" | "closeTime">) =>
  `${formatTime(store.openTime)} – ${formatTime(store.closeTime)}`;

const minutesOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export type StoreStatus =
  /** Open by its hours: "Open now · until 11 PM" (busy: open, but the branch has marked itself busy). */
  | { kind: "open"; until: string; busy: boolean }
  /** Outside its hours: "Closed · opens at 9 AM". */
  | { kind: "closed"; opensAt: string }
  /** The branch closed itself for the day from the admin panel. */
  | { kind: "closedToday" };

/**
 * Whether the store is open at `now` (the device's clock, as the rest of the app reads store hours), from the
 * admin's opening and closing times for that store; hours that run past midnight are handled.
 */
export function storeStatus(store: Store, now: Date): StoreStatus {
  if (isBranchManuallyClosed(store)) return { kind: "closedToday" };
  const open = minutesOf(store.openTime);
  const close = minutesOf(store.closeTime);
  const current = now.getHours() * 60 + now.getMinutes();
  const isOpen = close > open ? current >= open && current < close : current >= open || current < close;
  return isOpen
    ? { kind: "open", until: formatTime(store.closeTime), busy: store.isBusy }
    : { kind: "closed", opensAt: formatTime(store.openTime) };
}

/** The opening hours every store shares ("9 AM to 11 PM"), or null when they differ. */
export function sharedHours(stores: Store[]) {
  if (stores.length === 0) return null;
  const [first] = stores;
  const same = stores.every((store) => store.openTime === first.openTime && store.closeTime === first.closeTime);
  return same ? `${formatTime(first.openTime)} to ${formatTime(first.closeTime)}` : null;
}

/** Google Maps directions to the store (opens their app on phones); null without a map position. */
export const directionsHref = (store: FinderStore) =>
  store.location ? `https://www.google.com/maps/dir/?api=1&destination=${store.location.lat},${store.location.lng}` : null;

export const callHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
