'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl, getSocketUrl } from '@/lib/apiBase';
import { getAdminSession } from '@/lib/adminAuth';

export type AdminJobDriverPosition = {
  lat: number;
  lng: number;
  updatedAt?: string;
};

export type AdminJobLiveRouteData = {
  path: Array<{ lat: number; lng: number }>;
  driverPosition?: AdminJobDriverPosition | null;
  vehicleFailure?: { lat: number; lng: number; orderId?: string } | null;
  actualDistanceKm?: number | null;
  driverId?: string | null;
  source?: 'live';
};

type LiveRouteApiResponse = AdminJobLiveRouteData & {
  driverPosition?: { lat: number; lng: number; updatedAt?: string; recordedAt?: string } | null;
  vehicleFailure?: { lat: number; lng: number; orderId?: string } | null;
  driverId?: string | null;
};

type VehicleFailureEvent = {
  jobId?: string;
  lat?: number;
  lng?: number;
  orderId?: string;
};

type DriverLocationEvent = {
  jobId?: string | null;
  driverId?: string;
  lat?: number;
  lng?: number;
  updatedAt?: string;
  recordedAt?: string;
};

function appendPathPoint(
  path: Array<{ lat: number; lng: number }>,
  lat: number,
  lng: number,
): Array<{ lat: number; lng: number }> {
  const last = path[path.length - 1];
  if (last && last.lat === lat && last.lng === lng) return path;
  return [...path, { lat, lng }];
}

function normalizeDriverPosition(
  pos?: { lat: number; lng: number; updatedAt?: string; recordedAt?: string } | null,
): AdminJobDriverPosition | undefined {
  if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') return undefined;
  return {
    lat: pos.lat,
    lng: pos.lng,
    updatedAt: pos.updatedAt ?? pos.recordedAt,
  };
}

async function fetchLiveRoute(jobId: string, storeId: string): Promise<AdminJobLiveRouteData> {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/admin/delivery-jobs/${encodeURIComponent(jobId)}/live-route${qs}`,
    { headers: adminAuthHeaders(), credentials: 'include' },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Failed to load live route');
  const data = json.data as LiveRouteApiResponse;
  return {
    path: data.path ?? [],
    driverPosition: normalizeDriverPosition(data.driverPosition),
    vehicleFailure: data.vehicleFailure ?? null,
    actualDistanceKm: data.actualDistanceKm ?? null,
    driverId: data.driverId ?? null,
    source: 'live',
  };
}

type Options = {
  jobId: string;
  storeId: string;
  driverId?: string | null;
  enabled?: boolean;
  pollIntervalMs?: number;
};

export function useAdminJobLiveRoute({
  jobId,
  storeId,
  driverId,
  enabled = true,
  pollIntervalMs = 12000,
}: Options) {
  const [data, setData] = useState<AdminJobLiveRouteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const dataRef = useRef<AdminJobLiveRouteData | null>(null);

  const applyLiveData = useCallback((next: AdminJobLiveRouteData) => {
    dataRef.current = next;
    setData(next);
    if (next.path.length === 0 && !next.driverPosition) {
      setNotice('No GPS yet — rider must be online with location on.');
    } else {
      setNotice(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !jobId) return;
    try {
      const next = await fetchLiveRoute(jobId, storeId);
      applyLiveData(next);
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Unable to load live path');
    }
  }, [applyLiveData, enabled, jobId, storeId]);

  useEffect(() => {
    if (!enabled || !jobId) {
      setData(null);
      dataRef.current = null;
      setNotice(null);
      setSocketConnected(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const runInitial = async () => {
      try {
        const next = await fetchLiveRoute(jobId, storeId);
        if (!cancelled) applyLiveData(next);
      } catch (e: unknown) {
        if (!cancelled) {
          setNotice(e instanceof Error ? e.message : 'Unable to load live path');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void runInitial();

    const pollId = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    const admin = getAdminSession();
    let socket: Socket | null = null;

    if (admin) {
      try {
        socket = io(getSocketUrl(), {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          withCredentials: true,
        });

        socket.on('connect', () => {
          if (!cancelled) setSocketConnected(true);
        });
        socket.on('disconnect', () => {
          if (!cancelled) setSocketConnected(false);
        });

        socket.emit('joinAdmin', { adminId: admin.id, storeId: storeId || admin.storeId });

        socket.on('driverLocation', (payload: DriverLocationEvent) => {
          if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return;
          const knownDriverId = driverId || dataRef.current?.driverId;
          const jobMatch = payload.jobId === jobId;
          const driverMatch =
            Boolean(knownDriverId) &&
            payload.driverId === knownDriverId &&
            (payload.jobId == null || payload.jobId === '' || payload.jobId === jobId);
          if (!jobMatch && !driverMatch) return;

          const updatedAt = payload.updatedAt ?? payload.recordedAt;
          setData((prev) => {
            const base = prev ?? dataRef.current ?? { path: [] };
            const nextPath = appendPathPoint(base.path, payload.lat!, payload.lng!);
            const next: AdminJobLiveRouteData = {
              ...base,
              path: nextPath,
              driverPosition: { lat: payload.lat!, lng: payload.lng!, updatedAt },
              source: 'live',
            };
            dataRef.current = next;
            return next;
          });
          setNotice(null);
        });

        socket.on('vehicleFailureReported', (payload: VehicleFailureEvent) => {
          if (payload.jobId !== jobId) return;
          if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return;
          setData((prev) => {
            const base = prev ?? dataRef.current ?? { path: [] };
            const next: AdminJobLiveRouteData = {
              ...base,
              vehicleFailure: {
                lat: payload.lat!,
                lng: payload.lng!,
                orderId: payload.orderId,
              },
              source: 'live',
            };
            dataRef.current = next;
            return next;
          });
        });
      } catch {
        /* socket optional */
      }
    }

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      socket?.disconnect();
      setSocketConnected(false);
    };
  }, [applyLiveData, driverId, enabled, jobId, pollIntervalMs, refresh, storeId]);

  const driverPosition = data?.driverPosition
    ? { lat: data.driverPosition.lat, lng: data.driverPosition.lng }
    : undefined;

  const vehicleFailure = data?.vehicleFailure
    ? { lat: data.vehicleFailure.lat, lng: data.vehicleFailure.lng }
    : undefined;

  return {
    path: data?.path ?? [],
    driverPosition,
    driverPositionMeta: data?.driverPosition,
    vehicleFailure,
    actualDistanceKm: data?.actualDistanceKm ?? null,
    loading,
    notice,
    socketConnected,
    findDriverReady: Boolean(driverPosition),
    refresh,
  };
}
