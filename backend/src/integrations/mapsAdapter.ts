import { config } from '../config';
import { logger } from '../utils/logger';
import { haversineKm } from '../utils/geo';
import { nearestDeliveryArea, searchDeliveryAreas } from '../data/deliveryAreas';

export interface LatLng { lat: number; lng: number }
export interface PlaceResult { placeId: string; description: string; lat: number; lng: number }
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

class GoogleMapsAdapter implements MapsAdapter {
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.google.mapsApiKey}`;
    const res = await fetch(url);
    const data = await res.json() as {
      results?: {
        formatted_address: string;
        address_components?: { long_name: string; types: string[] }[];
      }[];
    };
    const result = data.results?.[0];
    if (!result) return null;

    const componentTypes = new Set([
      'neighborhood',
      'sublocality',
      'sublocality_level_1',
      'locality',
      'administrative_area_level_2',
    ]);
    const parts = (result.address_components ?? [])
      .filter((c) => c.types.some((t) => componentTypes.has(t)))
      .map((c) => c.long_name);

    const uniqueParts = [...new Set([...parts, result.formatted_address])];
    return uniqueParts.join(', ');
  }

  async geocode(address: string): Promise<LatLng | null> {
    const details = await this.geocodeDetails(address);
    return details ? { lat: details.lat, lng: details.lng } : null;
  }

  async geocodeDetails(address: string): Promise<GeocodeDetails | null> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:lk&key=${config.google.mapsApiKey}`;
    const res = await fetch(url);
    const data = await res.json() as {
      results?: {
        formatted_address: string;
        geometry: { location: LatLng };
        address_components?: AddressComponent[];
      }[];
    };
    const result = data.results?.[0];
    if (!result) return null;
    return parseGoogleGeocodeResult(result);
  }

  async autocomplete(query: string): Promise<PlaceResult[]> {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:lk&key=${config.google.mapsApiKey}`;
    const res = await fetch(url);
    const data = await res.json() as { predictions?: { place_id: string; description: string }[] };
    return (data.predictions || []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      lat: 0,
      lng: 0,
    }));
  }

  async getDistance(origin: LatLng, dest: LatLng): Promise<DistanceResult> {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}&key=${config.google.mapsApiKey}`;
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

function createMapsAdapter(): MapsAdapter {
  if (config.google.mapsApiKey) return new GoogleMapsAdapter();
  return new OsmMapsAdapter();
}

export const mapsAdapter = createMapsAdapter();
