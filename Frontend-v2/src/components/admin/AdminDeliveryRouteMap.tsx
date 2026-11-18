'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, Marker, Circle, Tooltip, useMap } from 'react-leaflet';
import AppMapTiles from '@/components/maps/AppMapTiles';
import L from 'leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryRoutePayload, DeliveryRouteStop, DeliveryRouteStore } from '@/lib/deliveryRoute';
import { formatRouteAddress, routeStartPrimaryDetail, stopMapPosition, stopPlannedGhostPosition } from '@/lib/deliveryRoute';
import {
  buildRouteMapPinHtml,
  customerInitial,
  routeMapPinMetrics,
  stopSecondaryDetail,
} from '@/lib/deliveryRouteMarkers';

const COLOMBO: [number, number] = [6.9271, 79.8612];

function branchMarkerIcon(
  selected: boolean,
  storeName: string,
  storeAddress: string,
  options: { fallbackLabel: string; primaryDetail: string },
): L.DivIcon {
  const { iconSize, iconAnchor } = routeMapPinMetrics(selected);
  return L.divIcon({
    className: 'route-map-pin-wrapper',
    html: buildRouteMapPinHtml({
      fallbackLabel: options.fallbackLabel,
      title: selected ? storeName : undefined,
      primaryDetail: selected ? options.primaryDetail : undefined,
      secondaryDetail: selected && storeAddress ? ` · ${storeAddress}` : undefined,
      selected,
      isStore: true,
    }),
    iconSize,
    iconAnchor,
  });
}

function stopMarkerIcon(stop: DeliveryRouteStop, selected: boolean): L.DivIcon {
  const { iconSize, iconAnchor } = routeMapPinMetrics(selected);
  return L.divIcon({
    className: 'route-map-pin-wrapper',
    html: buildRouteMapPinHtml({
      imageUrl: stop.imageUrl,
      fallbackLabel: customerInitial(stop.customerName),
      extraItemCount: stop.extraItemCount,
      title: selected ? stop.customerName : undefined,
      primaryDetail: selected ? stop.orderNumber : undefined,
      secondaryDetail: selected ? stopSecondaryDetail(stop) : undefined,
      selected,
      delivered: stop.status === 'DELIVERED',
    }),
    iconSize,
    iconAnchor,
  });
}

function stopKey(orderId?: string, orderNumber?: string) {
  return orderId ?? orderNumber ?? '';
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function driverMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'live-delivery-map-marker',
    html: `<div class="live-delivery-map-marker__driver" aria-hidden="true"><svg class="live-delivery-map-marker__driver-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function runWhenMapReady(map: L.Map, action: () => void) {
  const run = () => {
    try {
      if (!map.getContainer().isConnected) return;
      map.invalidateSize({ animate: false });
      action();
    } catch {
      /* map may be mid-unmount */
    }
  };

  if ((map as L.Map & { _loaded?: boolean })._loaded) {
    requestAnimationFrame(run);
    return;
  }
  map.whenReady(() => requestAnimationFrame(run));
}

function MapResizeTrigger({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* ignore */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map, trigger]);
  return null;
}

function vehicleFailureMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'live-delivery-map-marker live-delivery-map-marker--vehicle-failure',
    html: `<div class="live-delivery-map-marker__failure" aria-hidden="true"><span class="live-delivery-map-marker__failure-ring"></span><span class="live-delivery-map-marker__failure-dot"></span></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

function LiveDriverMarker({
  position,
  highlighted,
}: {
  position: { lat: number; lng: number };
  highlighted?: boolean;
}) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const icon = useMemo(() => driverMarkerIcon(), []);

  useEffect(() => {
    markerRef.current?.setLatLng([position.lat, position.lng]);
  }, [position.lat, position.lng]);

  if (!isValidLatLng(position.lat, position.lng)) return null;

  return (
    <Marker
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={icon}
      zIndexOffset={highlighted ? 2500 : 2000}
    />
  );
}

function RouteMapView({
  route,
  branchStore,
  highlightedStopKey,
  boundsPoints,
  fitNonce,
  fullscreen,
  driverPosition,
  vehicleFailurePosition,
}: {
  route: DeliveryRoutePayload;
  branchStore?: DeliveryRouteStore;
  highlightedStopKey?: string | null;
  boundsPoints: [number, number][];
  fitNonce?: number;
  fullscreen?: boolean;
  driverPosition?: { lat: number; lng: number };
  vehicleFailurePosition?: { lat: number; lng: number };
}) {
  const returnStore = branchStore ?? route.store;
  const map = useMap();
  const driverPositionRef = useRef(driverPosition);
  const vehicleFailureRef = useRef(vehicleFailurePosition);
  const boundsPointsRef = useRef(boundsPoints);
  driverPositionRef.current = driverPosition;
  vehicleFailureRef.current = vehicleFailurePosition;
  boundsPointsRef.current = boundsPoints;

  useEffect(() => {
    runWhenMapReady(map, () => {
      const driver = driverPositionRef.current;
      const breakdown = vehicleFailureRef.current;
      const points = boundsPointsRef.current;

      if (highlightedStopKey === 'vehicle-failure' && breakdown && isValidLatLng(breakdown.lat, breakdown.lng)) {
        map.flyTo([breakdown.lat, breakdown.lng], 17, { animate: true, duration: 0.45 });
        return;
      }

      if (highlightedStopKey === 'driver' && driver && isValidLatLng(driver.lat, driver.lng)) {
        map.flyTo([driver.lat, driver.lng], 17, { animate: true, duration: 0.45 });
        return;
      }

      if (highlightedStopKey === 'store') {
        map.flyTo([route.store.lat, route.store.lng], 16, { animate: true, duration: 0.45 });
        return;
      }

      if (highlightedStopKey === 'store-return') {
        map.flyTo([returnStore.lat, returnStore.lng], 16, { animate: true, duration: 0.45 });
        return;
      }

      if (highlightedStopKey) {
        const stop = route.stops.find((s) => stopKey(s.orderId, s.orderNumber) === highlightedStopKey);
        if (stop && isValidLatLng(stop.lat, stop.lng)) {
          map.flyTo([stop.lat, stop.lng], 16, { animate: true, duration: 0.45 });
        }
        return;
      }

      if (points.length === 0) return;
      if (points.length === 1) {
        map.setView(points[0], 15, { animate: false });
        return;
      }
      const pad = fullscreen ? 96 : 72;
      map.fitBounds(L.latLngBounds(points), { padding: [pad, pad], animate: true });
    });
  }, [highlightedStopKey, route, returnStore.lat, returnStore.lng, map, fitNonce, fullscreen]);

  return null;
}

type Props = {
  route: DeliveryRoutePayload;
  /** Real outlet for return marker and completion zone when start is a pickup override. */
  branchStore?: DeliveryRouteStore;
  highlightedStopKey?: string | null;
  fitNonce?: number;
  onStopSelect?: (key: string) => void;
  className?: string;
  showReturnToStore?: boolean;
  completionRadiusM?: number;
  actualPath?: Array<{ lat: number; lng: number }>;
  driverPosition?: { lat: number; lng: number };
  vehicleFailurePosition?: { lat: number; lng: number };
  pathOverlayLabel?: 'Actual' | 'Live';
  showLegend?: boolean;
  fullscreen?: boolean;
  initialPathLayers?: { planned?: boolean; actual?: boolean };
};

export default function AdminDeliveryRouteMap({
  route,
  branchStore,
  highlightedStopKey = null,
  fitNonce = 0,
  onStopSelect,
  className = '',
  showReturnToStore = false,
  completionRadiusM,
  actualPath,
  driverPosition,
  vehicleFailurePosition,
  pathOverlayLabel = 'Actual',
  showLegend = false,
  fullscreen = false,
  initialPathLayers,
}: Props) {
  const returnStore = branchStore ?? route.store;
  const pathPoints: [number, number][] = useMemo(
    () => route.path.map((p) => [p.lat, p.lng]),
    [route.path],
  );
  const actualPathPoints: [number, number][] = useMemo(
    () =>
      (actualPath ?? [])
        .filter((p) => isValidLatLng(p.lat, p.lng))
        .map((p) => [p.lat, p.lng] as [number, number]),
    [actualPath],
  );
  const plannedVisible = (initialPathLayers?.planned ?? true) && pathPoints.length >= 2;
  const actualVisible = (initialPathLayers?.actual ?? true) && actualPathPoints.length >= 2;
  const boundsPoints: [number, number][] = useMemo(() => {
    const points: [number, number][] = [
      [route.store.lat, route.store.lng],
      ...route.stops.map((s) => {
        const pin = stopMapPosition(s);
        return [pin.lat, pin.lng] as [number, number];
      }),
      ...route.stops
        .map((s) => stopPlannedGhostPosition(s))
        .filter((p): p is { lat: number; lng: number } => p != null)
        .map((p) => [p.lat, p.lng] as [number, number]),
      ...(plannedVisible ? pathPoints : []),
      ...(actualVisible ? actualPathPoints : []),
    ];
    if (
      returnStore.lat !== route.store.lat ||
      returnStore.lng !== route.store.lng
    ) {
      points.push([returnStore.lat, returnStore.lng]);
    }
    if (driverPosition && isValidLatLng(driverPosition.lat, driverPosition.lng)) {
      points.push([driverPosition.lat, driverPosition.lng]);
    }
    if (vehicleFailurePosition && isValidLatLng(vehicleFailurePosition.lat, vehicleFailurePosition.lng)) {
      points.push([vehicleFailurePosition.lat, vehicleFailurePosition.lng]);
    }
    return points;
  }, [
    route.store.lat,
    route.store.lng,
    returnStore.lat,
    returnStore.lng,
    route.stops,
    pathPoints,
    actualPathPoints,
    plannedVisible,
    actualVisible,
    driverPosition,
    vehicleFailurePosition,
  ]);
  const center = boundsPoints[0] ?? COLOMBO;
  const storeSelected = highlightedStopKey === 'store';
  const returnStoreSelected = highlightedStopKey === 'store-return';
  const startAddress = formatRouteAddress([route.store.addressLine, route.store.city]);
  const returnAddress = formatRouteAddress([returnStore.addressLine, returnStore.city]);
  const startPrimaryDetail = routeStartPrimaryDetail(route.store);

  return (
    <div className={`delivery-map-wrap h-full w-full relative ${className}`}>
      {showLegend && (actualVisible || plannedVisible) && (
        <div className="route-map-legend" aria-label="Route legend">
          {plannedVisible && (
            <span className="route-map-legend__item">
              <span className="route-map-legend__swatch route-map-legend__swatch--planned" aria-hidden />
              Planned
            </span>
          )}
          {actualVisible && (
            <span className="route-map-legend__item">
              <span className="route-map-legend__swatch route-map-legend__swatch--actual" aria-hidden />
              {pathOverlayLabel}
            </span>
          )}
        </div>
      )}
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        <AppMapTiles />
        <MapResizeTrigger trigger={fitNonce} />
        <RouteMapView
          route={route}
          branchStore={branchStore}
          highlightedStopKey={highlightedStopKey}
          boundsPoints={boundsPoints}
          fitNonce={fitNonce}
          fullscreen={fullscreen}
          driverPosition={driverPosition}
          vehicleFailurePosition={vehicleFailurePosition}
        />
        {completionRadiusM != null && completionRadiusM > 0 && (
          <Circle
            center={[returnStore.lat, returnStore.lng]}
            radius={completionRadiusM}
            pathOptions={{
              color: '#16a34a',
              weight: 2,
              dashArray: '6 6',
              fillColor: '#22c55e',
              fillOpacity: 0.12,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]} className="route-completion-zone-tooltip">
              Job completion zone
            </Tooltip>
          </Circle>
        )}
        {plannedVisible && (
          <Polyline
            positions={pathPoints}
            pathOptions={{
              color: '#2563eb',
              weight: highlightedStopKey ? 4 : 5,
              opacity: highlightedStopKey ? 0.45 : 0.9,
            }}
          />
        )}
        {actualVisible && (
          <Polyline
            positions={actualPathPoints}
            pathOptions={{
              color: '#16a34a',
              weight: 5,
              opacity: 0.9,
            }}
          />
        )}
        {driverPosition && isValidLatLng(driverPosition.lat, driverPosition.lng) && (
          <LiveDriverMarker
            position={driverPosition}
            highlighted={highlightedStopKey === 'driver'}
          />
        )}
        {vehicleFailurePosition && isValidLatLng(vehicleFailurePosition.lat, vehicleFailurePosition.lng) && (
          <Marker
            position={[vehicleFailurePosition.lat, vehicleFailurePosition.lng]}
            icon={vehicleFailureMarkerIcon()}
            zIndexOffset={highlightedStopKey === 'vehicle-failure' ? 2600 : 2400}
            eventHandlers={
              onStopSelect ? { click: () => onStopSelect('vehicle-failure') } : undefined
            }
          >
            <Tooltip direction="top" offset={[0, -12]}>
              Vehicle failure
            </Tooltip>
          </Marker>
        )}
        <Marker
          key={`store-${storeSelected ? 'selected' : 'default'}`}
          position={[route.store.lat, route.store.lng]}
          icon={branchMarkerIcon(storeSelected, route.store.name, startAddress, {
            fallbackLabel: 'A',
            primaryDetail: startPrimaryDetail,
          })}
          eventHandlers={onStopSelect ? { click: () => onStopSelect('store') } : undefined}
          zIndexOffset={storeSelected ? 1000 : 0}
        />
        {route.stops.map((stop) => {
          const key = stopKey(stop.orderId, stop.orderNumber);
          const selected = highlightedStopKey === key;
          const pin = stopMapPosition(stop);
          const ghost = stopPlannedGhostPosition(stop);
          return (
            <Fragment key={`${key}-${selected ? 'selected' : 'default'}`}>
              <Marker
                position={[pin.lat, pin.lng]}
                icon={stopMarkerIcon(stop, selected)}
                eventHandlers={onStopSelect ? { click: () => onStopSelect(key) } : undefined}
                zIndexOffset={selected ? 1000 : 0}
              />
              {ghost ? (
                <Marker position={[ghost.lat, ghost.lng]} zIndexOffset={0} interactive={false}>
                  <Tooltip direction="top" offset={[0, -8]}>
                    Address
                  </Tooltip>
                </Marker>
              ) : null}
            </Fragment>
          );
        })}
        {showReturnToStore && (
          <Marker
            key={`store-return-${returnStoreSelected ? 'selected' : 'default'}`}
            position={[returnStore.lat, returnStore.lng]}
            icon={branchMarkerIcon(returnStoreSelected, returnStore.name, returnAddress, {
              fallbackLabel: 'B',
              primaryDetail: 'Return to Branch',
            })}
            eventHandlers={onStopSelect ? { click: () => onStopSelect('store-return') } : undefined}
            zIndexOffset={returnStoreSelected ? 1001 : 500}
          />
        )}
      </MapContainer>
    </div>
  );
}
