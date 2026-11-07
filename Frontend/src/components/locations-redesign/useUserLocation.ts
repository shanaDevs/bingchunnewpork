"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "./stores";

export type UserLocationState =
  | { status: "locating" | "idle"; location: null }
  | { status: "found"; location: LatLng }
  /** denied: the customer (or the browser) refused; unavailable: no fix, timed out, or no geolocation. */
  | { status: "denied" | "unavailable"; location: null };

type Result = { location: LatLng } | { error: "denied" | "unavailable" };

/** The last position found, kept for this page visit so turning it on again doesn't ask again. Never stored. */
let lastFound: LatLng | null = null;

/**
 * The customer's current position from the browser, requested once `active` turns true (the browser shows its
 * permission prompt the first time). `retry` asks again after a failure; after a refusal most browsers won't
 * prompt again until the customer changes the site's location setting.
 */
export function useUserLocation(active: boolean): UserLocationState & { retry: () => void } {
  const [result, setResult] = useState<Result | null>(() => (lastFound ? { location: lastFound } : null));
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  useEffect(() => {
    if (!active || !supported || result) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        lastFound = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!cancelled) setResult({ location: lastFound });
      },
      (error) => {
        if (!cancelled) setResult({ error: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [active, supported, result]);

  const retry = () => setResult(null);

  if (result && "location" in result) return { status: "found", location: result.location, retry };
  if (result) return { status: result.error, location: null, retry };
  if (!supported) return { status: "unavailable", location: null, retry };
  return { status: active ? "locating" : "idle", location: null, retry };
}
