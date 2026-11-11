'use client';

import { useEffect } from 'react';
import { MapContainer, CircleMarker, useMap } from 'react-leaflet';
import AppMapTiles from '@/components/maps/AppMapTiles';
import 'leaflet/dist/leaflet.css';

function MapResizeTrigger() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* map may be mid-unmount */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

type Props = {
  lat: number;
  lng: number;
};

/** Single delivery stop pin for modals (avoids Google Maps iframe + CSP). */
export default function AdminStopPinMap({ lat, lng }: Props) {
  const position: [number, number] = [lat, lng];

  return (
    <div className="delivery-map-wrap h-full w-full">
      <MapContainer center={position} zoom={16} scrollWheelZoom className="h-full w-full">
        <AppMapTiles />
        <MapResizeTrigger />
        <CircleMarker
          center={position}
          radius={10}
          pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9 }}
        />
      </MapContainer>
    </div>
  );
}
