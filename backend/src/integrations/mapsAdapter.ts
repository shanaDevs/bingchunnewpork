import { getGoogleMapsApiKey } from '../lib/googleMapsKey';
import { logger } from '../utils/logger';
import { haversineKm } from '../utils/geo';
import { nearestDeliveryArea, searchDeliveryAreas } from '../data/deliveryAreas';

export interface LatLng { lat: number; lng: number }
export interface PlaceResult {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
  lat: number;
  lng: number;
}
export interface DistanceResult { distanceKm: number; durationMinutes: number }
export interface GeocodeDetails {
  address: string;
  lat: number;
  lng: number;
  addressLine: string;
  city: string;
  district: string;
}

interface MapsAdapter {
  geocode(address: string): Promise<LatLng | null>;
  geocodeDetails(address: string): Promise<GeocodeDetails | null>;
  reverseGeocode(lat: number, lng: number): Promise<string | null>;
  autocomplete(query: string, bias?: LatLng): Promise<PlaceResult[]>;
  getDistance(origin: LatLng, dest: LatLng): Promise<DistanceResult>;
}

const NOMINATIM_HEADERS = {
  'User-Agent': 'BingChunDelivery/1.0 (contact@bingchunsrilanka.lk)',
  Accept: 'application/json',
};

function formatPhotonAddress(props: Record<string, string | undefined>): string {
  const parts = [
    props.name,
    props.street,
    props.housenumber,
    props.city || props.town || props.village || props.suburb,
    props.state,
    props.country,
  ].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

function isInSriLanka(lat: number, lng: number): boolean {
  return lat >= 5.8 && lat <= 10 && lng >= 79.5 && lng <= 82;
}

type AddressComponent = { long_name: string; types: string[] };

function pickAddressComponent(components: AddressComponent[], ...types: string[]): string {
  const match = components.find((component) => types.some((type) => component.types.includes(type)));
  return match?.long_name?.trim() ?? '';
}

function normalizeDistrict(value: string): string {
  return value.replace(/\s+District$/i, '').trim();
}

function buildAddressLine(components: AddressComponent[], formattedAddress: string): string {
  const streetNumber = pickAddressComponent(components, 'street_number');
  const route = pickAddressComponent(components, 'route');
  const street = [streetNumber, route].filter(Boolean).join(' ').trim();
  if (street) return street;

  const fallback = [
    pickAddressComponent(components, 'premise', 'establishment', 'point_of_interest'),
    pickAddressComponent(components, 'neighborhood', 'sublocality', 'sublocality_level_1'),
  ].find(Boolean);

  if (fallback) return fallback;
  return formattedAddress.split(',')[0]?.trim() || formattedAddress;
}

function parseGoogleGeocodeResult(result: {
  formatted_address: string;
  geometry: { location: LatLng };
  address_components?: AddressComponent[];
}): GeocodeDetails {
  const components = result.address_components ?? [];
  const city =
    pickAddressComponent(components, 'locality', 'postal_town', 'sublocality_level_1', 'administrative_area_level_3') ||
    pickAddressComponent(components, 'administrative_area_level_2');
  const district =
    normalizeDistrict(pickAddressComponent(components, 'administrative_area_level_2')) ||
    normalizeDistrict(pickAddressComponent(components, 'administrative_area_level_1'));

  return {
    address: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    addressLine: buildAddressLine(components, result.formatted_address),
    city,
    district,
  };
}

function parseNominatimGeocodeResult(entry: {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}): GeocodeDetails {
  const addr = entry.address ?? {};
  const addressLine =
    [addr.road, addr.house_number].filter(Boolean).join(' ').trim() ||
    addr.pedestrian ||
    entry.display_name.split(',')[0]?.trim() ||
    entry.display_name;
  const city = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || '';
  const district =
    normalizeDistrict(addr.state_district || '') ||
    normalizeDistrict(addr.county || '') ||
    normalizeDistrict(addr.state || '');

  return {
    address: entry.display_name,
    lat: parseFloat(entry.lat),
    lng: parseFloat(entry.lon),
    addressLine,
    city,
    district,
  };
}

function parseDescriptionFallback(description: string, lat: number, lng: number): GeocodeDetails {
  const parts = description.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? '';
  const district = parts.length >= 1 ? parts[parts.length - 1] : '';

  return {
    address: description,
    lat,
    lng,
    addressLine: parts[0] ?? description,
    city,
    district: normalizeDistrict(district),
  };
}

function mergePlaceResults(local: PlaceResult[], remote: PlaceResult[], limit = 25): PlaceResult[] {
  const seen = new Set<string>();
  const merged: PlaceResult[] = [];
  for (const place of [...local, ...remote]) {
    const key = place.description.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
    if (merged.length >= limit) break;
  }
  return merged;
}

class OsmMapsAdapter implements MapsAdapter {
  async geocode(address: string): Promise<LatLng | null> {
    const details = await this.geocodeDetails(address);
    return details ? { lat: details.lat, lng: details.lng } : null;
  }

  async geocodeDetails(address: string): Promise<GeocodeDetails | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=lk&addressdetails=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    const data = (await res.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      address?: Record<string, string>;
    }[];
    if (!data[0]) return null;
    return parseNominatimGeocodeResult(data[0]);
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    if (!data.display_name) return null;

    const addr = data.address;
    if (!addr) return data.display_name;

    const parts = [
      addr.neighbourhood || addr.suburb || addr.quarter,
      addr.road,
      addr.city || addr.town || addr.village,
      addr.state,
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : data.display_name;
  }

  async autocomplete(query: string, bias?: LatLng): Promise<PlaceResult[]> {
    const local = searchDeliveryAreas(query, 60);
    if (local.length >= 8) return local;

    const params = new URLSearchParams({
      q: query,
      limit: '10',
      lang: 'en',
    });
    if (bias) {
      params.set('lat', String(bias.lat));
      params.set('lon', String(bias.lng));
    }

    try {
      const url = `https://photon.komoot.io/api?${params.toString()}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        features?: {
          properties: Record<string, string | undefined>;
          geometry: { coordinates: [number, number] };
        }[];
      };

      const remote = (data.features ?? [])
        .map((f, i) => {
          const [lng, lat] = f.geometry.coordinates;
          const description = formatPhotonAddress(f.properties);
          return {
            placeId: `osm_${f.properties.osm_id ?? i}`,
            description: description || query,
            lat,
            lng,
          };
        })
        .filter((p) => isInSriLanka(p.lat, p.lng) && p.description.length > 2);

      return mergePlaceResults(local, remote);
    } catch {
      return local;
    }
  }

  async getDistance(origin: LatLng, dest: LatLng): Promise<DistanceResult> {
    const distanceKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
    return { distanceKm, durationMinutes: Math.round((distanceKm / 25) * 60) + 5 };
  }
}

class MockMapsAdapter implements MapsAdapter {
  async geocode(address: string): Promise<LatLng | null> {
    const details = await this.geocodeDetails(address);
    return details ? { lat: details.lat, lng: details.lng } : null;
  }

  async geocodeDetails(address: string): Promise<GeocodeDetails | null> {
    await new Promise((r) => setTimeout(r, 150));
    logger.debug(`[MAPS MOCK] Geocode: ${address}`);
    const lat = 6.9271 + (Math.random() - 0.5) * 0.1;
    const lng = 79.8612 + (Math.random() - 0.5) * 0.1;
    return parseDescriptionFallback(address, lat, lng);
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 100));
    return nearestDeliveryArea(lat, lng).description;
  }

  async autocomplete(query: string): Promise<PlaceResult[]> {
    await new Promise((r) => setTimeout(r, 100));
    return searchDeliveryAreas(query, 60);
  }

  async getDistance(origin: LatLng, dest: LatLng): Promise<DistanceResult> {
    await new Promise((r) => setTimeout(r, 150));
    const distanceKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
    return { distanceKm, durationMinutes: Math.round((distanceKm / 25) * 60) + 5 };
  }
}

type PlacesComponent = { longText?: string; types?: string[] };

function placesComponents(components: PlacesComponent[] | undefined): AddressComponent[] {
  return (components ?? []).map((component) => ({
    long_name: component.longText?.trim() || '',
    types: component.types ?? [],
  }));
}

async function placesRequest<T>(path: string, fieldMask: string, init?: RequestInit): Promise<T | null> {
  const key = await getGoogleMapsApiKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (err) {
    logger.warn('[MAPS] Places request failed', err);
    return null;
  }
}

class GoogleMapsAdapter implements MapsAdapter {
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const data = await placesRequest<{
      places?: Array<{ formattedAddress?: string; displayName?: { text?: string } }>;
    }>(
      'places:searchNearby',
      'places.formattedAddress,places.displayName',
      {
        method: 'POST',
        body: JSON.stringify({
          maxResultCount: 1,
          rankPreference: 'DISTANCE',
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: 80,
            },
          },
        }),
      },
    );
    const place = data?.places?.[0];
    return place?.formattedAddress || place?.displayName?.text || null;
  }

  async geocode(address: string): Promise<LatLng | null> {
    const details = await this.geocodeDetails(address);
    return details ? { lat: details.lat, lng: details.lng } : null;
  }

  async geocodeDetails(address: string): Promise<GeocodeDetails | null> {
    const data = await placesRequest<{
      places?: Array<{
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        addressComponents?: PlacesComponent[];
      }>;
    }>(
      'places:searchText',
      'places.formattedAddress,places.location,places.addressComponents',
      {
        method: 'POST',
        body: JSON.stringify({ textQuery: address, regionCode: 'LK', pageSize: 1 }),
      },
    );
    const place = data?.places?.[0];
    const location = place?.location;
    if (!place || !location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      return null;
    }
    return parseGoogleGeocodeResult({
      formatted_address: place.formattedAddress || address,
      geometry: { location: { lat: location.latitude, lng: location.longitude } },
      address_components: placesComponents(place.addressComponents),
    });
  }

  async autocomplete(query: string, bias?: LatLng): Promise<PlaceResult[]> {
    const body: Record<string, unknown> = {
      input: query,
      includedRegionCodes: ['lk'],
      languageCode: 'en',
    };
    if (bias) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: 30000,
        },
      };
    }
    const data = await placesRequest<{
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    }>(
      'places:autocomplete',
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat',
      { method: 'POST', body: JSON.stringify(body) },
    );
    return (data?.suggestions ?? []).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      const description = prediction?.text?.text?.trim() || '';
      if (!prediction?.placeId || !description) return [];
      return [{
        placeId: prediction.placeId,
        description,
        mainText: prediction.structuredFormat?.mainText?.text?.trim() || description,
        secondaryText: prediction.structuredFormat?.secondaryText?.text?.trim() || '',
        lat: 0,
        lng: 0,
      }];
    });
  }

  async getDistance(origin: LatLng, dest: LatLng): Promise<DistanceResult> {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}&key=${await getGoogleMapsApiKey()}`;
    const res = await fetch(url);
    const data = await res.json() as {
      rows?: { elements?: { distance?: { value: number }; duration?: { value: number } }[] }[];
    };
    const el = data.rows?.[0]?.elements?.[0];
    return {
      distanceKm: (el?.distance?.value ?? 5000) / 1000,
      durationMinutes: Math.round((el?.duration?.value ?? 1800) / 60),
    };
  }
}

const googleMaps = new GoogleMapsAdapter();
const osmMaps = new OsmMapsAdapter();

async function activeMapsAdapter(): Promise<MapsAdapter> {
  const key = await getGoogleMapsApiKey();
  return key ? googleMaps : osmMaps;
}

/** Uses the settings key immediately, so a saved key switches every lookup. */
export const mapsAdapter: MapsAdapter = {
  geocode: async (address) => (await activeMapsAdapter()).geocode(address) ?? osmMaps.geocode(address),
  geocodeDetails: async (address) => (await activeMapsAdapter()).geocodeDetails(address) ?? osmMaps.geocodeDetails(address),
  reverseGeocode: async (lat, lng) => (await activeMapsAdapter()).reverseGeocode(lat, lng) ?? osmMaps.reverseGeocode(lat, lng),
  autocomplete: async (query, bias) => {
    const primary = await (await activeMapsAdapter()).autocomplete(query, bias);
    if (primary.length > 0) return primary;
    return osmMaps.autocomplete(query, bias);
  },
  getDistance: async (origin, dest) => (await activeMapsAdapter()).getDistance(origin, dest),
};

const OSM_TILES = {
  provider: 'osm' as const,
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap',
};

let tileSession: { key: string; session: string; expiry: number } | null = null;

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/** Google map tiles for the customer map, or OpenStreetMap when no key is saved. */
export async function getCustomerMapTiles(): Promise<{ provider: 'google' | 'osm'; url: string; attribution: string }> {
  const key = await getGoogleMapsApiKey();
  if (!key) return OSM_TILES;

  const now = Date.now();
  if (!tileSession || tileSession.key !== key || tileSession.expiry < now + 60_000) {
    try {
      const res = await fetch(
        `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapType: 'roadmap', language: 'en-US', region: 'LK' }),
        },
      );
      if (!res.ok) return OSM_TILES;
      const data = await res.json() as { session?: string; expiry?: string };
      if (!data.session) return OSM_TILES;
      const expirySeconds = Number(data.expiry);
      tileSession = {
        key,
        session: data.session,
        expiry: Number.isFinite(expirySeconds) ? expirySeconds * 1000 : now + 60 * 60 * 1000,
      };
    } catch (err) {
      logger.warn('[MAPS] Google tile session failed', err);
      return OSM_TILES;
    }
  }

  if (!tileSession) return OSM_TILES;

  return {
    provider: 'google',
    url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(tileSession.session)}&key=${encodeURIComponent(key)}`,
    attribution: '&copy; Google',
  };
}

/** Driving path from the Google Directions API. Null lets the map draw a straight line. */
export async function getDrivingPath(points: LatLng[]): Promise<LatLng[] | null> {
  if (points.length < 2) return null;
  const key = await getGoogleMapsApiKey();
  if (!key) return null;

  const origin = points[0];
  const dest = points[points.length - 1];
  const via = points.slice(1, -1);
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    mode: 'driving',
    key,
  });
  if (via.length > 0) {
    params.set('waypoints', via.map((point) => `${point.lat},${point.lng}`).join('|'));
  }

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      routes?: { overview_polyline?: { points?: string } }[];
    };
    const encoded = data.routes?.[0]?.overview_polyline?.points;
    if (!encoded) return null;
    const path = decodePolyline(encoded);
    return path.length >= 2 ? path : null;
  } catch (err) {
    logger.warn('[MAPS] Google directions failed', err);
    return null;
  }
}

/** Coordinates for a Google Place selected from customer address search. */
export async function getPlaceLocation(placeId: string): Promise<(LatLng & { address: string }) | null> {
  const key = await getGoogleMapsApiKey();
  if (!key || !placeId || placeId.startsWith('area_') || placeId.startsWith('osm_')) return null;

  try {
    const data = await placesRequest<{
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>(
      `places/${encodeURIComponent(placeId)}`,
      'location,formattedAddress',
    );
    const lat = data?.location?.latitude;
    const lng = data?.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: lat as number,
      lng: lng as number,
      address: data?.formattedAddress || '',
    };
  } catch (err) {
    logger.warn('[MAPS] Google place details failed', err);
    return null;
  }
}
