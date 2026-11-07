"use client";

import { useSyncExternalStore } from "react";
import { breakpoints } from "@/components/home-redesign/config/motion";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(breakpoints.reducedMotion);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(breakpoints.reducedMotion).matches;
}

// Assume motion is allowed during server rendering; the client corrects it on hydration.
function getServerSnapshot() {
  return false;
}

/** Returns true when the user has asked the OS to minimise motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
