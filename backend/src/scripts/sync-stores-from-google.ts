/**
 * Match Bing Chun branches to Google Maps listings and write coordinates
 * and street addresses onto the stores table. Does not delete stores.
 *
 *   npm run sync:stores-google -w @bingchun/backend
 */
import path from 'path';
import dotenv from 'dotenv';
import { prisma } from '../lib/prisma';
import { haversineKm } from '../utils/geo';

dotenv.config({ path: path.join(__dirname, '../../.env') });

type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
  district: string;
  phone: string;
};

type StoreRow = {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  phone: string | null;
};

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'nextPageToken',
].join(',');

function inSriLanka(lat: number, lng: number): boolean {
  return lat >= 5.8 && lat <= 10 && lng >= 79.5 && lng <= 82;
}

function branchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/bing\s*chun/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pickComponent(
  components: Array<{ longText?: string; types?: string[] }> | undefined,
  ...types: string[]
): string {
  const match = components?.find((component) => types.some((type) => component.types?.includes(type)));
  return match?.longText?.replace(/\s+District$/i, '').trim() || '';
}

function cleanAddress(address: string): string {
  const withoutCountry = address
    .replace(/,?\s*Sri Lanka$/i, '')
    .replace(/,?\s*LK$/i, '')
    .trim();
  const withoutPlusCode = withoutCountry.replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,},?\s*/i, '').trim();
  if (/[^\u0000-\u024F]/.test(withoutPlusCode)) return '';
  return withoutPlusCode;
}

async function searchPage(query: string, pageToken?: string): Promise<{ places: Place[]; nextPageToken?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY is missing');
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: 'LK',
      pageSize: 20,
      languageCode: 'en',
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Places search failed (${res.status}): ${detail.slice(0, 240)}`);
  }
  const data = await res.json() as {
    nextPageToken?: string;
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      nationalPhoneNumber?: string;
      addressComponents?: Array<{ longText?: string; types?: string[] }>;
    }>;
  };
  const places: Place[] = [];
  for (const place of data.places ?? []) {
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    const name = place.displayName?.text?.trim() || '';
    if (!place.id || !name || lat == null || lng == null || !inSriLanka(lat, lng)) continue;
    if (!/bing\s*chun/i.test(name)) continue;
    places.push({
      id: place.id,
      name,
      address: cleanAddress(place.formattedAddress || ''),
      lat,
      lng,
      city: pickComponent(place.addressComponents, 'locality', 'postal_town', 'administrative_area_level_3', 'sublocality_level_1'),
      district: pickComponent(place.addressComponents, 'administrative_area_level_2', 'administrative_area_level_1'),
      phone: place.nationalPhoneNumber?.trim() || '',
    });
  }
  return { places, nextPageToken: data.nextPageToken };
}

async function searchAll(query: string): Promise<Place[]> {
  const found = new Map<string, Place>();
  let pageToken: string | undefined;
  for (let page = 0; page < 8; page += 1) {
    const result = await searchPage(query, pageToken);
    for (const place of result.places) found.set(place.id, place);
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return [...found.values()];
}

function scoreMatch(store: StoreRow, place: Place): number {
  const storeKey = branchKey(store.name);
  const placeKey = branchKey(place.name);
  const distance = haversineKm(store.lat, store.lng, place.lat, place.lng);
  let score = 0;
  if (storeKey && placeKey && storeKey === placeKey) score += 100;
  else if (storeKey && place.address.toLowerCase().includes(storeKey)) score += 45;
  if (distance < 0.08) score += 55;
  else if (distance < 0.2) score += 35;
  else if (distance < 0.6) score += 12;
  else if (distance > 8 && score < 100) score -= 50;
  return score;
}

function displayName(place: Place, fallbackCity: string): string {
  const key = branchKey(place.name);
  if (key) {
    const titled = key.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    return `Bing Chun - ${titled}`;
  }
  if (fallbackCity) return `Bing Chun - ${fallbackCity}`;
  return place.name;
}

async function main(): Promise<void> {
  const listed = await searchAll('Bing Chun Sri Lanka');
  const places = new Map<string, Place>();
  for (const place of listed) places.set(place.id, place);
  console.log(`Google listings: ${places.size}`);

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      addressLine: true,
      city: true,
      district: true,
      lat: true,
      lng: true,
      phone: true,
    },
    orderBy: { name: 'asc' },
  });
  console.log(`Database stores: ${stores.length}`);

  const pairs: Array<{ store: StoreRow; place: Place; score: number }> = [];
  for (const store of stores) {
    for (const place of places.values()) {
      const score = scoreMatch(store, place);
      if (score >= 55) pairs.push({ store, place, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedStores = new Set<string>();
  const usedPlaces = new Set<string>();
  const matched: Array<{ store: StoreRow; place: Place }> = [];
  for (const pair of pairs) {
    if (usedStores.has(pair.store.id) || usedPlaces.has(pair.place.id)) continue;
    usedStores.add(pair.store.id);
    usedPlaces.add(pair.place.id);
    matched.push(pair);
  }

  const unmatched = stores.filter((store) => !usedStores.has(store.id));
  for (const store of unmatched) {
    const branch = branchKey(store.name);
    if (!branch) continue;
    const result = await searchPage(`Bing Chun ${branch} Sri Lanka`);
    const ranked = result.places
      .map((place) => ({ place, score: scoreMatch(store, place) }))
      .filter((row) => row.score >= 70 && !usedPlaces.has(row.place.id))
      .sort((a, b) => b.score - a.score);
    const winner = ranked[0]?.place;
    if (!winner) {
      console.log(`  no Google match: ${store.name}`);
      continue;
    }
    usedPlaces.add(winner.id);
    usedStores.add(store.id);
    places.set(winner.id, winner);
    matched.push({ store, place: winner });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  let updated = 0;
  for (const { store, place } of matched) {
    const moved = haversineKm(store.lat, store.lng, place.lat, place.lng);
    const address = place.address && place.address.length > 3 ? place.address : store.addressLine;
    const city = place.city || store.city;
    const district = place.district || store.district;
    const sameSpot = moved < 0.02 && address === store.addressLine && city === store.city && district === store.district;
    if (sameSpot) continue;
    await prisma.store.update({
      where: { id: store.id },
      data: {
        lat: place.lat,
        lng: place.lng,
        addressLine: address,
        city,
        district,
        ...(store.phone ? {} : place.phone ? { phone: place.phone } : {}),
      },
    });
    updated += 1;
    console.log(
      `  updated ${store.name}: ${moved.toFixed(2)} km -> ${place.lat.toFixed(6)}, ${place.lng.toFixed(6)} | ${address}`,
    );
  }

  let created = 0;
  for (const place of places.values()) {
    if (usedPlaces.has(place.id)) continue;
    if (!branchKey(place.name)) continue;
    const nearby = stores.find((store) => haversineKm(store.lat, store.lng, place.lat, place.lng) < 0.15);
    if (nearby) continue;
    const name = displayName(place, place.city);
    const existing = await prisma.store.findFirst({ where: { name }, select: { id: true } });
    if (existing) continue;
    await prisma.store.create({
      data: {
        name,
        addressLine: place.address || name,
        city: place.city || 'Colombo',
        district: place.district || 'Colombo',
        lat: place.lat,
        lng: place.lng,
        phone: place.phone || '+94 76 546 6686',
        openTime: '08:00',
        closeTime: '23:00',
        isActive: true,
        deliveryEnabled: true,
      },
    });
    created += 1;
    console.log(`  added ${name}: ${place.lat.toFixed(6)}, ${place.lng.toFixed(6)} | ${place.address}`);
  }

  console.log(`Done. Updated ${updated}, added ${created}, already current ${matched.length - updated}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
