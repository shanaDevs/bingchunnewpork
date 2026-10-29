'use client';

import { adminApiFetch } from '@/lib/adminApi';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { ArrowLeft, Clock, Loader2, MapPin } from 'lucide-react';
import type { ActualRoutePayload } from '@/components/admin/AdminActualRouteMap';

const MAP_STAGE_CLASS = 'actual-route-view__stage min-h-[520px] h-[min(72vh,720px)]';

const AdminActualRouteMap = dynamic(() => import('@/components/admin/AdminActualRouteMap'), {
  ssr: false,
  loading: () => (
    <div
      className={`${MAP_STAGE_CLASS} flex items-center justify-center bg-navy-light text-sm text-muted`}
    >
      <Loader2 size={20} className="mr-2 animate-spin" />
      Loading map…
    </div>
  ),
});

async function fetchActualRoute(jobId: string, storeId: string): Promise<ActualRoutePayload> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return adminApiFetch<ActualRoutePayload>(
    `/admin/delivery-jobs/${encodeURIComponent(jobId)}/actual-route${qs}`,
  );
}

type Props = {
  jobId: string;
  storeId: string;
  onBack: () => void;
};

export default function AdminActualRouteView({ jobId, storeId, onBack }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-actual-route', jobId, storeId],
    queryFn: () => fetchActualRoute(jobId, storeId),
    enabled: Boolean(jobId),
  });

  const hasGpsPath = (data?.path.length ?? 0) >= 2;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-navy-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand"
            >
              <ArrowLeft size={14} />
              Back to delivery
            </button>
            <h2 className="flex items-center gap-2 text-xl font-bold text-fg">
              <MapPin size={20} className="text-brand" />
              {data ? `Actual route · ${data.rideCode ?? data.title}` : 'Actual route'}
            </h2>
            {data ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} />
                  {data.store.name}
                </span>
                <span className="tabular-nums">
                  Est. {data.estimatedDistanceKm != null ? `${data.estimatedDistanceKm} km` : '—'}
                  {' · '}
                  {data.estimatedMinutes != null ? `${data.estimatedMinutes} min` : '—'}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock size={13} />
                  Actual {data.actualDistanceKm != null ? `${data.actualDistanceKm} km` : '—'}
                  {' · '}
                  {data.actualMinutes != null ? `${data.actualMinutes} min` : '—'}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={`${MAP_STAGE_CLASS} flex items-center justify-center p-8 text-muted`}>
          <Loader2 size={20} className="mr-2 animate-spin" />
          Loading actual route…
        </div>
      ) : error || !data ? (
        <div className="p-8 text-center space-y-3">
          <p className="text-red-400">{error instanceof Error ? error.message : 'Route not found'}</p>
          <button type="button" onClick={onBack} className="text-sm text-brand hover:underline">
            Back to delivery
          </button>
        </div>
      ) : (
        <>
          {!hasGpsPath ? (
            <div className="border-b border-navy-border bg-navy-light/30 px-4 py-3 text-sm text-muted sm:px-5">
              No GPS trace recorded — showing branch and stop pins only.
            </div>
          ) : null}
          <div className={MAP_STAGE_CLASS}>
            <AdminActualRouteMap route={data} className="h-full w-full" />
          </div>
        </>
      )}
    </div>
  );
}
