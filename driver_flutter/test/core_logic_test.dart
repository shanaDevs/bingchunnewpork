import 'package:bing_chun_driver/core/format.dart';
import 'package:bing_chun_driver/core/ride_alert.dart';
import 'package:bing_chun_driver/data/models/delivery_job.dart';
import 'package:bing_chun_driver/data/models/delivery_route.dart';
import 'package:bing_chun_driver/data/models/driver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Behaviour checks for logic ported from driver_android (Format.kt, RideAlertPriority.kt,
/// DeliveryJob.kt, DeliveryRoute.kt).
void main() {
  setUpAll(() => initializeDateFormatting('en'));

  group('Format', () {
    test('money groups thousands', () {
      expect(Format.money(0), 'Rs. 0');
      expect(Format.money(1250), 'Rs. 1,250');
      expect(Format.money(1234567), 'Rs. 1,234,567');
    });

    test('displayRideId prefers ride code, else short uppercase id', () {
      expect(Format.displayRideId('RIDE-1024', 'abc'), 'RIDE-1024');
      expect(Format.displayRideId(null, 'a1b2c3d4-e5f6'), '#A1B2C3D4');
      expect(Format.displayRideId('  ', 'abc'), '#ABC');
    });

    test('deliverySummary pluralises', () {
      expect(Format.deliverySummary(1), 'Delivery • 1 order');
      expect(Format.deliverySummary(3, 1), 'Delivery • 3 orders (1 cup)');
      expect(Format.deliverySummary(2, 5), 'Delivery • 2 orders (5 cups)');
    });

    test('duration', () {
      expect(Format.duration(45), '45m');
      expect(Format.duration(135), '2h 15m');
      expect(Format.duration(-5), '0m');
    });

    test('shortAddress drops noise and duplicates, keeps street + area + city', () {
      expect(
        Format.shortAddress('12 Main St, Nugegoda, Western Province, Sri Lanka', 'Colombo', 'Colombo'),
        '12 Main St, Nugegoda, Colombo',
      );
      expect(Format.shortAddress('', null, null), 'Address unavailable');
    });

    test('pickupUnlockHint', () {
      expect(Format.pickupUnlockHint(null, 100, false), 'Getting GPS…');
      expect(Format.pickupUnlockHint(50, 100, true), 'At the branch · pickup unlocked');
      expect(Format.pickupUnlockHint(250.4, 100, false), '250 m from branch · 150 m closer to unlock (within 100m)');
    });

    test('isToday uses the device zone', () {
      expect(Format.isToday(DateTime.now().toUtc().toIso8601String()), isTrue);
      expect(Format.isToday('2001-01-01T00:00:00Z'), isFalse);
      expect(Format.isToday(null), isFalse);
    });

    test('shortBranchName strips the brand prefix', () {
      expect(Format.shortBranchName('Bing Chun - Nugegoda'), 'Nugegoda');
      expect(Format.shortBranchName('Bing Chun — Kandy'), 'Kandy');
    });

    test('haversine is ~111km per degree of latitude', () {
      final d = haversineMetres(6.0, 79.0, 7.0, 79.0);
      expect(d, closeTo(111195, 200));
    });
  });

  group('Ride alert priority', () {
    const a = RideAlert(jobId: 'a', storeId: 's1');
    const b = RideAlert(jobId: 'b', storeId: 's2');
    const c = RideAlert(jobId: 'c', storeId: 's1');

    test('no rejection keeps arrival order', () {
      expect(prioritizedRideAlerts([a, b, c], null, null).map((e) => e.jobId), ['a', 'b', 'c']);
    });

    test('after a reject: other branches first, rejected job last', () {
      final order = prioritizedRideAlerts([a, b, c], 'a', 's1').map((e) => e.jobId).toList();
      expect(order, ['b', 'c', 'a']);
      expect(pickNextRideAlert([a, b, c], 'a', 's1')?.jobId, 'b');
    });

    test('socket payload parsing fills dropoff and extra stops', () {
      final alert = RideAlert.fromSocket({
        'id': 'job-1',
        'orderCount': 3,
        'storeName': 'Bing Chun - Nugegoda',
        'deliveryFee': 450,
        'estimatedDistanceKm': 4.2,
        'previewStops': [
          {'customerName': 'Nimal', 'addressLine': '12 Main St', 'city': 'Nugegoda', 'district': 'Colombo'},
          {'customerName': 'Kamal', 'addressLine': '3 Lake Rd', 'city': 'Maharagama', 'district': 'Colombo'},
        ],
      });
      expect(alert.jobId, 'job-1');
      expect(alert.dropoffName, 'Nimal');
      expect(alert.dropoffAddress, '12 Main St, Nugegoda, Colombo');
      expect(alert.extraStopCount, 2);
      expect(alert.estimatedDistanceKm, 4.2);
      expect(alert.notificationBody, contains('Delivery Fee: Rs. 450'));
    });

    test('push payload round-trips through toJson', () {
      const original = RideAlert(jobId: 'j', rideCode: 'RIDE-7', orderCount: 2, estimatedMinutes: 18, deliveryFee: 300);
      final copy = RideAlert.fromPush(original.toJson());
      expect(copy.jobId, 'j');
      expect(copy.rideCode, 'RIDE-7');
      expect(copy.orderCount, 2);
      expect(copy.estimatedMinutes, 18);
      expect(copy.deliveryFee, 300);
    });
  });

  group('Job rules', () {
    DeliveryJobDetail job({String status = 'ASSIGNED', bool pickedUp = false, int delivered = 0, JobPickup? pickup}) =>
        DeliveryJobDetail.fromJson({
          'id': 'j1',
          'title': 'Run',
          'status': status,
          'scheduledAt': '2026-10-21T04:00:00Z',
          'store': {'id': 's1', 'name': 'Store', 'addressLine': '', 'city': '', 'lat': 6.9, 'lng': 79.9, 'completionRadiusM': 100},
          'orderCount': 2,
          'deliveredCount': delivered,
          'pickedUp': pickedUp,
          if (pickup != null) 'pickup': {'lat': pickup.lat, 'lng': pickup.lng, 'label': pickup.label},
        });

    test('pickup / start / reject gates', () {
      expect(job().needsPickup, isTrue);
      expect(job().canReject, isTrue);
      expect(job(pickedUp: true).canStart, isTrue);
      expect(job(pickedUp: true).canReject, isFalse);
    });

    test('branch geofence unlocks pickup within the radius', () {
      expect(job().pickupUnlockedAt(null), isFalse);
      expect(job().pickupUnlockedAt(150), isFalse);
      expect(job().pickupUnlockedAt(80), isTrue);
    });

    test('pickup override has no geofence', () {
      final j = job(pickup: const JobPickup(lat: 7, lng: 80, label: 'Breakdown spot'));
      expect(j.hasPickupOverride, isTrue);
      expect(j.pickupUnlockedAt(null), isTrue);
      expect(j.pickupPlaceName, 'Breakdown spot');
    });

    test('complete needs RETURNING, all delivered, and within radius', () {
      expect(job(status: 'RETURNING', delivered: 2).canCompleteAt(50), isTrue);
      expect(job(status: 'RETURNING', delivered: 1).canCompleteAt(50), isFalse);
      expect(job(status: 'RETURNING', delivered: 2).canCompleteAt(500), isFalse);
      expect(job(status: 'IN_PROGRESS', delivered: 2).canCompleteAt(50), isFalse);
    });

    test('tolerant parsing defaults missing fields', () {
      final p = DriverProfile.fromJson({'id': 'd', 'name': 'Driver'});
      expect(p.dutyStatus, 'OFF_DUTY');
      expect(p.isOnline, isFalse);
      expect(p.alertEligible, isTrue);
      expect(p.canClaimMore, isTrue);
    });

    test('pool store ids are unique and non-blank', () {
      final p = DriverProfile.fromJson({
        'id': 'd',
        'name': 'x',
        'storeId': 's1',
        'store': {'id': 's1', 'name': 'A'},
        'accessibleStores': [
          {'id': 's2', 'name': 'B'},
          {'id': '', 'name': 'C'},
        ],
      });
      expect(p.poolStoreIds, ['s1', 's2']);
    });
  });

  group('Route', () {
    test('fallback route skips stops without coordinates and orders by sequence', () {
      final j = DeliveryJobDetail.fromJson({
        'id': 'j',
        'title': '',
        'status': 'IN_PROGRESS',
        'scheduledAt': '',
        'store': {'id': 's', 'name': 'S', 'addressLine': '', 'city': '', 'lat': 6.9, 'lng': 79.9},
        'orderCount': 2,
        'deliveredCount': 0,
        'orders': [
          {'orderId': 'o1', 'orderNumber': '1', 'sequence': 1, 'status': 'DELIVERED', 'lat': 6.91, 'lng': 79.91},
          {'orderId': 'o2', 'orderNumber': '2', 'sequence': 2, 'status': 'OUT_FOR_DELIVERY', 'lat': 6.92, 'lng': 79.92},
          {'orderId': 'o3', 'orderNumber': '3', 'sequence': 3, 'status': 'OUT_FOR_DELIVERY'},
        ],
      });
      final r = fallbackRouteFor(j);
      expect(r.stops.length, 2);
      expect(r.nextStopSequence, 2);
      expect(r.waypoints.length, 3);
      final target = liveRouteTarget(r, j, null);
      expect(target, isA<RouteLiveTargetStop>());
      expect((target as RouteLiveTargetStop).sequence, 2);
    });
  });
}
