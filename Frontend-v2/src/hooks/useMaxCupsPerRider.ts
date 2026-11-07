'use client';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useQuery } from '@tanstack/react-query';
import { DEFAULT_MAX_CUPS_PER_RIDER } from '@/lib/deliverySelection';

async function fetchMaxCupsPerRider(): Promise<number> {
  const res = await fetch(`${getApiBaseUrl()}/settings/app`);
  const json = await res.json();
  const value = json?.data?.maxCupsPerRider;
  if (typeof value === 'number' && value >= 1 && value <= 100) return value;
  return DEFAULT_MAX_CUPS_PER_RIDER;
}

export function useMaxCupsPerRider(): number {
  const { data } = useQuery({
    queryKey: ['admin-app-settings', 'maxCupsPerRider'],
    queryFn: fetchMaxCupsPerRider,
    staleTime: 60_000,
  });
  return data ?? DEFAULT_MAX_CUPS_PER_RIDER;
}
