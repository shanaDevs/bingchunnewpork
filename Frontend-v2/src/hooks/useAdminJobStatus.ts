'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { connectAdminSocketWithRooms } from '@/lib/adminSocket';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAdminSession } from '@/lib/adminAuth';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

type JobStatusResponse = {
  status: string;
  pickedUp?: boolean;
  driverId?: string | null;
};

async function fetchJobStatus(jobId: string, storeId: string): Promise<JobStatusResponse> {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/admin/delivery-jobs/${encodeURIComponent(jobId)}${qs}`,
    { headers: adminAuthHeaders(), credentials: 'include' },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Failed to load job status');
  const data = json.data as {
    status?: string;
    pickedUp?: boolean;
    driver?: { id?: string } | null;
  };
  return {
    status: data.status ?? '',
    pickedUp: data.pickedUp,
    driverId: data.driver?.id ?? null,
  };
}

type Options = {
  jobId: string;
  storeId: string;
  initialStatus?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
};

export function useAdminJobStatus({
  jobId,
  storeId,
  initialStatus = '',
  enabled = true,
  pollIntervalMs = 12000,
}: Options) {
  const [status, setStatus] = useState(initialStatus);
  const [pickedUp, setPickedUp] = useState<boolean | undefined>(undefined);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(initialStatus);

  const applyStatus = useCallback(
    (nextStatus: string, nextPickedUp?: boolean, nextDriverId?: string | null) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      if (nextPickedUp !== undefined) setPickedUp(nextPickedUp);
      if (nextDriverId !== undefined) setDriverId(nextDriverId);
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !jobId) return;
    if (!storeId) {
      setError('Branch ID required to sync job status');
      return;
    }
    try {
      const data = await fetchJobStatus(jobId, storeId);
      applyStatus(data.status, data.pickedUp, data.driverId);
      setError(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to sync job status';
      setError(`${message} (API: ${getApiBaseUrl()})`);
    }
  }, [applyStatus, enabled, jobId, storeId]);

  useEffect(() => {
    if (initialStatus) {
      applyStatus(initialStatus);
    }
  }, [initialStatus, jobId, applyStatus]);

  useEffect(() => {
    if (!enabled || !jobId) {
      setStatus(initialStatus || '');
      statusRef.current = initialStatus || '';
      setPickedUp(undefined);
      setDriverId(null);
      setError(null);
      return;
    }

    if (!storeId) {
      setError('Branch ID required to sync job status');
      return;
    }

    let cancelled = false;
    let pollInFlight = false;
    setLoading(true);
    setError(null);

    const pollOnce = async () => {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;
      try {
        const data = await fetchJobStatus(jobId, storeId);
        if (!cancelled) {
          applyStatus(data.status, data.pickedUp, data.driverId);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Unable to sync job status';
          setError(`${message} (API: ${getApiBaseUrl()})`);
        }
      } finally {
        pollInFlight = false;
      }
    };

    void pollOnce().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const pollId = window.setInterval(() => {
      if (TERMINAL_STATUSES.has(statusRef.current)) return;
      void pollOnce();
    }, pollIntervalMs);

    const admin = getAdminSession();
    let socket: Socket | null = null;

    if (admin) {
      void connectAdminSocketWithRooms(
        [{ adminId: admin.id, storeId: storeId || admin.storeId }],
        (created) => {
          if (cancelled) {
            created.disconnect();
            return;
          }
          socket = created;
          created.on('deliveryJobUpdated', (payload: { jobId?: string; status?: string }) => {
            if (cancelled || payload?.jobId !== jobId) return;
            if (payload.status) {
              applyStatus(payload.status);
              setError(null);
            } else {
              void pollOnce();
            }
          });
        },
      );
    }

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      socket?.disconnect();
    };
  }, [applyStatus, enabled, initialStatus, jobId, pollIntervalMs, storeId]);

  return {
    status,
    pickedUp,
    driverId,
    loading,
    error,
    refresh,
  };
}
