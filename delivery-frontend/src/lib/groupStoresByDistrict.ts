export const STORE_DISTRICT_ORDER = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Kandy',
  'Kurunegala',
  'Kegalle',
  'Ratnapura',
  'Puttalam',
  'Galle',
  'Matara',
] as const;

export function groupStoresByDistrict<T extends { district?: string | null }>(stores: T[]) {
  const map = new Map<string, T[]>();
  for (const store of stores) {
    const key = store.district?.trim() || 'Other';
    const list = map.get(key) ?? [];
    list.push(store);
    map.set(key, list);
  }

  const known = new Set<string>(STORE_DISTRICT_ORDER);
  const extra = [...map.keys()].filter((district) => !known.has(district)).sort();
  const keys = [...STORE_DISTRICT_ORDER.filter((district) => map.has(district)), ...extra];

  return keys.map((district) => ({ district, stores: map.get(district) ?? [] }));
}
