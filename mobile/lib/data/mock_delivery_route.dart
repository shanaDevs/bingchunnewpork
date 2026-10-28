import '../models/delivery_route.dart';
import '../models/driver_session.dart';

const previewDriver = DriverSession(
  id: 'preview-driver',
  name: 'Nugegoda Driver',
  role: 'DELIVERY_DRIVER',
  storeId: 'preview-store',
  storeName: 'Bing Chun - Nugegoda',
  storeCity: 'Nugegoda',
);

DeliveryRoute mockDeliveryRoute() {
  const store = RouteStore(
    id: 'preview-store',
    name: 'Bing Chun - Nugegoda',
    addressLine: 'Dawala Road, Nugegoda',
    city: 'Nugegoda',
    lat: 6.8726,
    lng: 79.8897,
  );

  final stops = [
    const RouteStop(
      orderId: '1',
      orderNumber: 'BC-24061',
      customerName: 'Amaya Perera',
      customerPhone: '0771234567',
      addressLine: '45 Station Road',
      city: 'Nugegoda',
      district: 'Colombo',
      status: 'READY',
      total: 1280,
      itemCount: 3,
      lat: 6.8698,
      lng: 79.8934,
      sequence: 1,
      distanceFromPreviousKm: 0.62,
      etaMinutesFromPrevious: 5,
    ),
    const RouteStop(
      orderId: '2',
      orderNumber: 'BC-24062',
      customerName: 'Dilshan Fernando',
      customerPhone: '0719876543',
      addressLine: '12 Kirillapone Ave',
      city: 'Nugegoda',
      district: 'Colombo',
      status: 'OUT_FOR_DELIVERY',
      total: 890,
      itemCount: 2,
      lat: 6.8751,
      lng: 79.9012,
      sequence: 2,
      distanceFromPreviousKm: 1.14,
      etaMinutesFromPrevious: 7,
    ),
    const RouteStop(
      orderId: '3',
      orderNumber: 'BC-24063',
      customerName: 'Sithmi Jayawardena',
      customerPhone: '0765554433',
      addressLine: '88 High Level Road',
      city: 'Nugegoda',
      district: 'Colombo',
      status: 'READY',
      total: 2150,
      itemCount: 5,
      lat: 6.8642,
      lng: 79.9048,
      sequence: 3,
      distanceFromPreviousKm: 0.78,
      etaMinutesFromPrevious: 6,
    ),
    const RouteStop(
      orderId: '4',
      orderNumber: 'BC-24064',
      customerName: 'Guest',
      customerPhone: '0751122334',
      addressLine: '3 Samagi Mawatha',
      city: 'Kohuwala',
      district: 'Colombo',
      status: 'READY',
      total: 650,
      itemCount: 1,
      lat: 6.8780,
      lng: 79.8952,
      sequence: 4,
      distanceFromPreviousKm: 1.42,
      etaMinutesFromPrevious: 8,
    ),
  ];

  return DeliveryRoute(
    store: store,
    stops: stops,
    summary: RouteSummary(
      stopCount: stops.length,
      totalDistanceKm: stops.fold(0.0, (n, s) => n + s.distanceFromPreviousKm),
      estimatedMinutes: stops.fold(0, (n, s) => n + s.etaMinutesFromPrevious),
      generatedAt: DateTime.now(),
    ),
  );
}
