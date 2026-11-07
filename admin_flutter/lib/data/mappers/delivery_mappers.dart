import '../../core/runtime_config.dart';
import '../../domain/entities/delivery.dart';
import '../json.dart';

GeoPoint? geoOrNull(Json j, {String lat = 'lat', String lng = 'lng'}) {
  final a = dblOrNull(j, lat);
  final b = dblOrNull(j, lng);
  if (a == null || b == null) return null;
  final p = GeoPoint(a, b);
  return p.isValid ? p : null;
}

List<GeoPoint> _path(Json j) => listOf(j, 'path', geoOrNull).whereType<GeoPoint>().toList();

DeliveryJob deliveryJobFromJson(Json j) {
  final driver = objOrNull(j, 'driver') ?? const <String, dynamic>{};
  return DeliveryJob(
    id: str(j, 'id'),
    rideCode: strOrNull(j, 'rideCode'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    displayStatus: strOrNull(j, 'displayStatus'),
    orderCount: intOf(j, 'orderCount'),
    deliveredCount: intOf(j, 'deliveredCount'),
    totalCups: intOrNull(j, 'totalCups'),
    totalRevenue: dblOrNull(j, 'totalRevenue'),
    distanceKm: dblOrNull(j, 'totalDistanceKm') ?? dblOrNull(j, 'estimatedDistanceKm'),
    estimatedMinutes: intOrNull(j, 'estimatedMinutes'),
    actualDistanceKm: dblOrNull(j, 'actualDistanceKm'),
    actualMinutes: intOrNull(j, 'actualMinutes'),
    hasActualRoute: boolOf(j, 'hasActualRoute'),
    scheduledAt: dateOrNull(j, 'scheduledAt') ?? DateTime.now(),
    completedAt: dateOrNull(j, 'completedAt'),
    storeId: strOrNull(j, 'storeId'),
    storeName: strOrNull(j, 'storeName'),
    driverId: strOrNull(driver, 'id'),
    driverName: strOrNull(driver, 'name'),
    createdAt: dateOrNull(j, 'createdAt'),
  );
}

DeliveryStop _stopFromJson(Json j) => DeliveryStop(
  orderId: str(j, 'orderId'),
  orderNumber: str(j, 'orderNumber'),
  sequence: intOf(j, 'sequence'),
  status: str(j, 'status'),
  customerName: str(j, 'customerName'),
  customerPhone: str(j, 'customerPhone'),
  addressLine: str(j, 'addressLine'),
  city: str(j, 'city'),
  location: geoOrNull(j),
  total: dblOrNull(j, 'total'),
  paymentMethod: strOrNull(j, 'paymentMethod'),
  paymentStatus: strOrNull(j, 'paymentStatus'),
  items: listOf(
    j,
    'items',
    (i) => DeliveryStopItem(
      productName: str(i, 'productName'),
      quantity: intOf(i, 'quantity', 1),
      totalPrice: dblOrNull(i, 'totalPrice'),
      imageUrl: AppConfig.resolveAssetUrl(strOrNull(i, 'imageUrl')),
    ),
  ),
  deliveryState: str(j, 'deliveryState', 'Pending'),
  terminalEventAt: dateOrNull(j, 'terminalEventAt'),
  cancelReason: strOrNull(j, 'cancelReason'),
  failureOutcome: strOrNull(j, 'failureOutcome'),
  failureNote: strOrNull(j, 'failureNote'),
);

DeliveryJobDetail deliveryJobDetailFromJson(Json j) {
  final store = objOrNull(j, 'store') ?? const <String, dynamic>{};
  final pickup = objOrNull(j, 'pickup');
  final failure = objOrNull(j, 'vehicleFailure');
  return DeliveryJobDetail(
    id: str(j, 'id'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    scheduledAt: dateOrNull(j, 'scheduledAt') ?? DateTime.now(),
    assignedAt: dateOrNull(j, 'assignedAt'),
    startedAt: dateOrNull(j, 'startedAt'),
    returnStartedAt: dateOrNull(j, 'returnStartedAt'),
    completedAt: dateOrNull(j, 'completedAt'),
    totalDistanceKm: dblOrNull(j, 'totalDistanceKm'),
    storeId: str(store, 'id'),
    storeName: str(store, 'name'),
    storeAddress: [str(store, 'addressLine'), str(store, 'city')].where((s) => s.isNotEmpty).join(', '),
    storeLocation: geoOrNull(store) ?? const GeoPoint(6.9271, 79.8612),
    driverName: strOrNull(objOrNull(j, 'driver') ?? const {}, 'name'),
    orderCount: intOf(j, 'orderCount'),
    deliveredCount: intOf(j, 'deliveredCount'),
    returningToBranch: boolOf(j, 'returningToBranch'),
    pickedUp: boolOf(j, 'pickedUp'),
    stops: listOf(j, 'orders', _stopFromJson)..sort((a, b) => a.sequence.compareTo(b.sequence)),
    vehicleFailure: failure == null ? null : geoOrNull(failure),
    pickupLabel: pickup == null ? null : strOrNull(pickup, 'label'),
    pickupLocation: pickup == null ? null : geoOrNull(pickup),
  );
}

DeliveryRoute deliveryRouteFromJson(Json j) {
  final store = objOrNull(j, 'store') ?? const <String, dynamic>{};
  final summary = objOrNull(j, 'summary') ?? const <String, dynamic>{};
  return DeliveryRoute(
    startName: str(store, 'name'),
    startAddress: [str(store, 'addressLine'), str(store, 'city')].where((s) => s.isNotEmpty).join(', '),
    start: geoOrNull(store) ?? const GeoPoint(6.9271, 79.8612),
    path: _path(j),
    totalDistanceKm: dbl(summary, 'totalDistanceKm'),
    estimatedMinutes: intOf(summary, 'estimatedMinutes'),
    stops: [
      for (final s in listOf(j, 'stops', (s) => s))
        if (geoOrNull(s) case final p?)
          RouteStop(
            orderId: strOrNull(s, 'orderId'),
            orderNumber: str(s, 'orderNumber'),
            customerName: str(s, 'customerName'),
            location: p,
            sequence: intOf(s, 'sequence'),
            addressLine: strOrNull(s, 'addressLine'),
            city: strOrNull(s, 'city'),
            district: strOrNull(s, 'district'),
            itemCount: intOrNull(s, 'itemCount'),
            distanceFromPreviousKm: dblOrNull(s, 'distanceFromPreviousKm'),
            etaMinutesFromPrevious: intOrNull(s, 'etaMinutesFromPrevious'),
            status: strOrNull(s, 'status'),
          ),
    ]..sort((a, b) => a.sequence.compareTo(b.sequence)),
  );
}

ActualRoute actualRouteFromJson(Json j) {
  final store = objOrNull(j, 'store') ?? const <String, dynamic>{};
  return ActualRoute(
    startName: str(store, 'name'),
    start: geoOrNull(store) ?? const GeoPoint(6.9271, 79.8612),
    path: _path(j),
    stops: [
      for (final s in listOf(j, 'stops', (s) => s))
        if (geoOrNull(s) case final p?) (orderNumber: str(s, 'orderNumber'), location: p),
    ],
    estimatedDistanceKm: dblOrNull(j, 'estimatedDistanceKm'),
    estimatedMinutes: intOrNull(j, 'estimatedMinutes'),
    actualDistanceKm: dblOrNull(j, 'actualDistanceKm'),
    actualMinutes: intOrNull(j, 'actualMinutes'),
  );
}

LiveDriver liveDriverFromJson(Json j) => LiveDriver(
  driverId: str(j, 'driverId'),
  name: str(j, 'name'),
  dutyStatus: str(j, 'dutyStatus', 'OFF_DUTY'),
  storeName: strOrNull(j, 'storeName'),
  location: geoOrNull(j),
  heading: dblOrNull(j, 'heading'),
  updatedAt: dateOrNull(j, 'updatedAt'),
  jobId: strOrNull(j, 'jobId'),
  trail: listOf(j, 'recentPath', geoOrNull).whereType<GeoPoint>().toList(),
);

DriverPing? driverPingFromJson(Json j) {
  final p = geoOrNull(j);
  if (p == null) return null;
  return DriverPing(
    location: p,
    driverId: strOrNull(j, 'driverId'),
    jobId: strOrNull(j, 'jobId'),
    heading: dblOrNull(j, 'heading'),
    at: dateOrNull(j, 'updatedAt') ?? dateOrNull(j, 'recordedAt'),
  );
}

DeliveryStopItem _pendingItemFromJson(Json i) => DeliveryStopItem(
  productName: str(i, 'productName'),
  quantity: intOf(i, 'quantity'),
  totalPrice: dblOrNull(i, 'totalPrice'),
  imageUrl: AppConfig.resolveAssetUrl(strOrNull(i, 'imageUrl')),
);

PendingDeliveryOrder pendingDeliveryOrderFromJson(Json j) => PendingDeliveryOrder(
  orderId: str(j, 'orderId'),
  orderNumber: str(j, 'orderNumber'),
  createdAt: dateOrNull(j, 'createdAt'),
  customerName: str(j, 'customerName'),
  customerPhone: str(j, 'customerPhone'),
  addressLine: str(j, 'addressLine'),
  city: str(j, 'city'),
  district: str(j, 'district'),
  paymentMethod: str(j, 'paymentMethod'),
  paymentStatus: str(j, 'paymentStatus'),
  location: geoOrNull(j),
  items: listOf(j, 'items', _pendingItemFromJson),
);

ClusterStop _clusterStopFromJson(Json s, int index) => ClusterStop(
  orderNumber: str(s, 'orderNumber'),
  customerName: str(s, 'customerName'),
  itemCount: intOf(s, 'itemCount'),
  sequence: intOrNull(s, 'sequence') ?? index + 1,
  addressLine: strOrNull(s, 'addressLine'),
  city: strOrNull(s, 'city'),
  district: strOrNull(s, 'district'),
  location: geoOrNull(s),
  paymentMethod: strOrNull(s, 'paymentMethod'),
  paymentStatus: strOrNull(s, 'paymentStatus'),
);

DeliveryCluster _clusterFromJson(Json c, Json? store) {
  final preview = objOrNull(c, 'routePreview');
  final previewStops = preview == null ? const <Json>[] : listOf(preview, 'stops', (s) => s);
  final raw = previewStops.isNotEmpty ? previewStops : listOf(c, 'orders', (s) => s);
  final hasPath = preview != null && _path(preview).isNotEmpty;
  return DeliveryCluster(
    id: str(c, 'id'),
    label: str(c, 'label'),
    orderIds: [for (final id in (c['orderIds'] as List? ?? const [])) '$id'],
    stops: [for (final (i, s) in raw.indexed) _clusterStopFromJson(s, i)],
    // Like the web, the classify preview is reused only when it has a road path and stops.
    route: store != null && hasPath && previewStops.isNotEmpty
        ? deliveryRouteFromJson({'store': store, ...preview})
        : null,
  );
}

ClassifyResult classifyResultFromJson(Json j) {
  final store = objOrNull(j, 'store');
  final storePoint = store == null ? null : geoOrNull(store);
  return ClassifyResult(
    mode: str(j, 'mode', 'manual'),
    totalCups: intOf(j, 'totalCups'),
    maxCupsPerRider: intOf(j, 'maxCupsPerRider', 20),
    store: store == null || storePoint == null
        ? null
        : (
            name: str(store, 'name'),
            address: [str(store, 'addressLine'), str(store, 'city')].where((s) => s.isNotEmpty).join(', '),
            location: storePoint,
          ),
    clusters: listOf(j, 'clusters', (c) => _clusterFromJson(c, storePoint == null ? null : store)),
  );
}
