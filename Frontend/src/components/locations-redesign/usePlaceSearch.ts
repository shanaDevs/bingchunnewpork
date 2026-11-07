"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { LatLng } from "./stores";

export type Place = { name: string; location: LatLng };

export type PlaceSearch =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "found"; place: Place }
  /** Not a place we could find (or the lookup failed). */
  | { status: "notFound" };

/** What GET /stores/address/geocode answers (the backend's geocoder, limited to Sri Lanka). */
type GeocodeDetails = { address: string; lat: number; lng: number; addressLine: string; city: string; district: string };

/** Wait for typing to pause, so a lookup isn't sent for every letter. */
const DEBOUNCE_MS = 600;
const MIN_LENGTH = 3;
/** After a failed lookup (offline, server error), the same text is tried again after this long. */
const RETRY_AFTER_MS = 30_000;

/** Answers for this page visit, by normalised query (null: no such place in Sri Lanka). */
const found = new Map<string, Place | null>();
/** When a lookup last failed, by normalised query. */
const failedAt = new Map<string, number>();

const normalise = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");

/** "jaffna town" → "Jaffna Town", for naming a place by what was typed. */
const titleCase = (text: string) => text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

/**
 * Finds a typed place in Sri Lanka (town, suburb, landmark) with the backend's geocoder, once `enabled` and the
 * query has at least 3 characters. Used when the store search matches nothing, to offer the stores nearest that
 * place instead. The backend answers 400 when it finds nothing.
 */
export function usePlaceSearch(query: string, enabled: boolean): PlaceSearch {
  const key = normalise(query);
  const active = enabled && key.length >= MIN_LENGTH;
  // Bumped when a lookup lands, to re-read the maps above.
  const [, setLookups] = useState(0);

  useEffect(() => {
    if (!active || found.has(key)) return;
    const lastFailure = failedAt.get(key);
    if (lastFailure !== undefined && Date.now() - lastFailure < RETRY_AFTER_MS) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const hit = await api.get<GeocodeDetails>(`/stores/address/geocode?address=${encodeURIComponent(key)}`);
        const usable = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng);
        found.set(key, usable ? { name: hit.city || titleCase(key), location: { lat: hit.lat, lng: hit.lng } } : null);
        failedAt.delete(key);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) found.set(key, null);
        else failedAt.set(key, Date.now());
      }
      if (!cancelled) setLookups((count) => count + 1);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, key]);

  if (!active) return { status: "idle" };
  if (found.has(key)) {
    const place = found.get(key);
    return place ? { status: "found", place } : { status: "notFound" };
  }
  return failedAt.has(key) ? { status: "notFound" } : { status: "searching" };
}
