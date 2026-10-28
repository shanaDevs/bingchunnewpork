'use client';

import { useEffect, useRef, useState } from 'react';

const TRANSITION_MS = 3000;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Animates the timeline bicycle along route nodes.
 * Integer index = sitting on that node. Fractional = on the connector
 * (vehicle failure sits halfway between last reached and the failed stop).
 * - Snaps immediately when the sheet opens or the job changes (no journey replay).
 * - Animates once along the line only when the route point advances while the sheet stays open.
 */
export function useTimelineRiderPosition(
  targetNodeIndex: number | null,
  jobKey: string,
  sheetOpen: boolean,
): number | null {
  const [displayIndex, setDisplayIndex] = useState<number | null>(targetNodeIndex);
  const committedIndexRef = useRef<number | null>(targetNodeIndex);
  const animFrameRef = useRef<number | null>(null);
  const jobKeyRef = useRef(jobKey);
  const wasSheetOpenRef = useRef(false);

  useEffect(() => {
    const cancelAnimation = () => {
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const snapTo = (index: number | null) => {
      cancelAnimation();
      committedIndexRef.current = index;
      setDisplayIndex(index);
    };

    const jobChanged = jobKeyRef.current !== jobKey;
    const sheetJustOpened = sheetOpen && !wasSheetOpenRef.current;
    wasSheetOpenRef.current = sheetOpen;

    if (jobChanged) {
      jobKeyRef.current = jobKey;
    }

    // Opening the sheet or switching jobs: show the latest point immediately.
    if (jobChanged || sheetJustOpened) {
      snapTo(targetNodeIndex);
      return;
    }

    if (!sheetOpen) {
      return;
    }

    const prev = committedIndexRef.current;
    if (prev === targetNodeIndex) {
      return;
    }

    if (targetNodeIndex === null) {
      snapTo(null);
      return;
    }

    // Non-forward changes snap instantly (no replay).
    if (prev === null || targetNodeIndex < prev) {
      snapTo(targetNodeIndex);
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      snapTo(targetNodeIndex);
      return;
    }

    // One-time movement along the route when the job advances to the next point.
    const start = prev;
    const end = targetNodeIndex;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / TRANSITION_MS);
      const eased = easeInOutCubic(t);
      setDisplayIndex(start + (end - start) * eased);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        committedIndexRef.current = end;
        setDisplayIndex(end);
        animFrameRef.current = null;
      }
    };

    cancelAnimation();
    animFrameRef.current = requestAnimationFrame(tick);

    return cancelAnimation;
  }, [targetNodeIndex, jobKey, sheetOpen]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return displayIndex;
}
