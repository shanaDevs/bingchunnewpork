'use client';

import { Fragment, useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, Polyline, ZoomControl, useMap } from 'react-leaflet';
import AppMapTiles from '@/components/maps/AppMapTiles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DELIVERY_RIDER_MARKER_GLYPH } from '@/components/delivery/DeliveryBikeMarkerIcon';

const COLOMBO: [number, number] = [6.9271, 79.8612];

const storeIcon = L.divIcon({
  className: 'delivery-map-branch-marker',
  html: '<div class="delivery-map-branch-marker__dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export type LivePathPoint = {
  lat: number;
  lng: number;
  recordedAt?: string;
  heading?: number | null;
};

export type LiveStoreMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  addressLine?: string;
};

export type LiveDriverMarker = {
  jobId: string;
  driverId?: string;
  driverName: string;
  storeName?: string;
  lat: number;
  lng: number;
  heading?: number | null;
  updatedAt?: string;
  path?: LivePathPoint[];
};

export type LiveDestinationMarker = {
  lat: number;
  lng: number;
  label?: string;
};

const destinationIcon = L.divIcon({
  className: 'live-delivery-map-marker live-delivery-map-marker--dropoff',
  html: '<div class="live-delivery-map-marker__dropoff"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function driverDivIcon(selected: boolean, heading?: number | null) {
  const rotation =
    heading == null || Number.isNaN(Number(heading))
      ? ''
      : ` style="transform:rotate(${Number(heading) - 90}deg)"`;
  return L.divIcon({
    className: `live-delivery-map-marker live-delivery-map-marker--driver${selected ? ' live-delivery-map-marker--selected' : ''}`,
    html: `<div class="live-delivery-map-marker__driver${selected ? ' live-delivery-map-marker__driver--selected' : ''}"><span class="live-delivery-map-marker__driver-rot"${rotation}>${DELIVERY_RIDER_MARKER_GLYPH}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function FitBounds({
  points,
  mode,
}: {
  points: [number, number][];
  mode: 'continuous' | 'once';
}) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length === 0) return;
    if (mode === 'once' && fitted.current) return;
    fitted.current = true;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56] });
  }, [points, map, mode]);
  return null;
}

function FocusDriver({
  position,
  nonce,
}: {
  position: [number, number] | null;
  nonce: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!position || nonce === 0) return;
    map.flyTo(position, Math.max(map.getZoom(), 14), { duration: 0.55 });
  }, [position, nonce, map]);
  return null;
}

const TAIL_POINT_LIMIT = 10;

function tailPositions(path: LivePathPoint[]): [number, number][] {
  return path.slice(-TAIL_POINT_LIMIT).map((point) => [point.lat, point.lng]);
}

interface Props {
  stores: LiveStoreMarker[];
  drivers: LiveDriverMarker[];
  destination?: LiveDestinationMarker | null;
  selectedDriverId?: string | null;
  selectedDriverIds?: string[];
  onDriverSelect?: (driverId: string) => void;
  className?: string;
  fitBoundsMode?: 'continuous' | 'once';
  zoomPosition?: 'topleft' | 'topright';
  focusPosition?: [number, number] | null;
  focusNonce?: number;
}

export default function AdminLiveDriversMap({
  stores,
  drivers,
  destination,
  selectedDriverId,
  selectedDriverIds,
  onDriverSelect,
  className = '',
  fitBoundsMode = 'continuous',
  zoomPosition = 'topleft',
  focusPosition = null,
  focusNonce = 0,
}: Props) {
  const points = useMemo<[number, number][]>(
    () => [
      ...stores.map((s) => [s.lat, s.lng] as [number, number]),
      ...drivers.map((d) => [d.lat, d.lng] as [number, number]),
      ...(destination ? [[destination.lat, destination.lng] as [number, number]] : []),
    ],
    [stores, drivers, destination],
  );
  const center = points[0] ?? COLOMBO;

  return (
    <div className={`delivery-map-wrap h-full w-full ${className}`}>
      <MapContainer center={center} zoom={12} scrollWheelZoom zoomControl={false} className="h-full w-full">
        <AppMapTiles />
        <ZoomControl position={zoomPosition} />
        <FitBounds points={points} mode={fitBoundsMode} />
        <FocusDriver position={focusPosition} nonce={focusNonce} />
        {stores.map((store) => (
          <Marker key={store.id} position={[store.lat, store.lng]} icon={storeIcon}>
            <Popup>
              <strong>{store.name}</strong>
              {store.addressLine && <div>{store.addressLine}</div>}
            </Popup>
          </Marker>
        ))}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Popup>
              <strong>{destination.label ?? 'Drop-off'}</strong>
            </Popup>
          </Marker>
        )}
        {drivers.map((driver) => {
          const driverId = driver.driverId ?? driver.jobId;
          const selected = Boolean(
            (selectedDriverIds && selectedDriverIds.includes(driverId)) ||
              (selectedDriverId && driverId === selectedDriverId),
          );
          const positions = tailPositions(driver.path ?? []);
          return (
            <Fragment key={driverId}>
              {positions.length >= 2 && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: selected ? '#f59e0b' : '#307ef2',
                    opacity: selected ? 0.9 : 0.8,
                    weight: selected ? 10 : 8,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: `live-driver-tail${selected ? ' live-driver-tail--selected' : ''}`,
                    interactive: false,
                  }}
                />
              )}
              <Marker
                key={`${driverId}-bike`}
                position={[driver.lat, driver.lng]}
                icon={driverDivIcon(selected, driver.heading)}
                zIndexOffset={selected ? 800 : 400}
                eventHandlers={
                  onDriverSelect
                    ? {
                        click: () => onDriverSelect(driverId),
                      }
                    : undefined
                }
              >
                <Popup>
                  <strong>{driver.driverName}</strong>
                  {driver.storeName && <div>{driver.storeName}</div>}
                  {driver.updatedAt && (
                    <div className="text-xs opacity-70">
                      Updated {new Date(driver.updatedAt).toLocaleTimeString()}
                    </div>
                  )}
                </Popup>
              </Marker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
