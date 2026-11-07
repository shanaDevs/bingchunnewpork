import { api } from '@/lib/api';
import type { Store } from '@/types';
import type { DeliveryInfo, OrderMode, TakeawayInfo } from '@/store/cartStore';

export interface FulfillmentStore {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  distanceKm: number;
}

interface SwitchBranchParams {
  orderMode: OrderMode;
  fulfillmentStore: FulfillmentStore;
  deliveryInfo: {
    address: string;
    lat?: number;
    lng?: number;
    estimatedMinutes: number;
  } | null;
}

export interface SwitchBranchResult {
  ok: boolean;
  error?: string;
  deliveryInfo?: DeliveryInfo;
  takeawayInfo?: TakeawayInfo;
}

export async function switchOrderToBranch({
  orderMode,
  fulfillmentStore,
  deliveryInfo,
}: SwitchBranchParams): Promise<SwitchBranchResult> {
  if (orderMode === 'TAKEAWAY') {
    const store = await api.get<Store>(`/stores/${fulfillmentStore.id}`);
    return {
      ok: true,
      takeawayInfo: {
        storeId: store.id,
        storeName: store.name,
        openTime: store.openTime,
        closeTime: store.closeTime,
        onlineOrderStartTime: store.onlineOrderStartTime,
        onlineOrderStopTime: store.onlineOrderStopTime,
        pickupCutoffMinutes: store.pickupCutoffMinutes,
        branchClosedAt: store.branchClosedAt,
      },
    };
  }

  if (!deliveryInfo?.lat || !deliveryInfo?.lng) {
    return { ok: false, error: 'Delivery address is required to switch branches.' };
  }

  const store = await api.get<Store & { deliveryZones: { id: string; radiusKm: number; fee: number; minOrder: number }[] }>(
    `/stores/${fulfillmentStore.id}`,
  );

  const distKm = haversineKm(deliveryInfo.lat, deliveryInfo.lng, store.lat, store.lng);
  const zone = store.deliveryZones
    ?.filter((z) => distKm <= z.radiusKm)
    .sort((a, b) => a.radiusKm - b.radiusKm)[0];

  if (!zone) {
    return {
      ok: false,
      error: `${fulfillmentStore.name} cannot deliver to your address. Try takeaway instead.`,
    };
  }

  return {
    ok: true,
    deliveryInfo: {
      storeId: store.id,
      storeName: store.name,
      zoneId: zone.id,
      fee: zone.fee,
      minOrder: zone.minOrder,
      estimatedMinutes: deliveryInfo.estimatedMinutes,
      address: deliveryInfo.address,
      lat: deliveryInfo.lat,
      lng: deliveryInfo.lng,
      openTime: store.openTime,
      closeTime: store.closeTime,
      onlineOrderStartTime: store.onlineOrderStartTime,
      onlineOrderStopTime: store.onlineOrderStopTime,
      pickupCutoffMinutes: store.pickupCutoffMinutes,
      branchClosedAt: store.branchClosedAt,
    },
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
