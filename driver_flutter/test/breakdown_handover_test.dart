import 'package:flutter_test/flutter_test.dart';
import 'package:bing_chun_driver/data/models/breakdown_handover.dart';
import 'package:bing_chun_driver/data/models/driver.dart';

/// Shapes from packages/delivery-domain/src/jobHandover.ts and GET /delivery/me.
void main() {
  final now = DateTime.utc(2026, 11, 17, 10, 0);

  Map<String, dynamic> response({required String stage, bool collected = false, String? locAt}) => {
    'jobId': 'job-1',
    'rideCode': 'QD-10754',
    'stage': stage,
    'breakdownSpot': {'lat': 6.9, 'lng': 79.88},
    'replacement': {
      'driverId': 'd2',
      'jobId': 'job-2',
      'rideCode': 'QD-10760',
      'jobStatus': 'ASSIGNED',
      'name': 'Nuwan Pradeep',
      'phone': collected ? null : '0771234567',
      'profilePhotoUrl': 'https://x/p.jpg',
      'vehicleType': 'Bajaj Pulsar 150',
      'vehicleNumber': 'WP BHT-4521',
      'averageRating': 4.9,
      'accepted': true,
      'collected': collected,
      'location': locAt == null ? null : {'lat': 6.93, 'lng': 79.88, 'heading': 90, 'recordedAt': locAt},
      'distanceKm': 3.5,
      'etaMinutes': 15,
    },
    'orders': [
      {'orderId': 'o1', 'orderNumber': 'BC-2', 'sequence': 2, 'status': 'OUT_FOR_DELIVERY', 'cupCount': 3},
      {'orderId': 'o2', 'orderNumber': 'BC-3', 'sequence': 3, 'status': 'DELIVERED', 'cupCount': 1},
    ],
    'events': [
      {'at': '2026-11-17T09:00:00.000Z', 'kind': 'breakdown_reported', 'label': 'Vehicle breakdown reported'},
      {'at': '2026-11-17T09:10:00.000Z', 'kind': 'rider_assigned', 'label': 'Replacement rider assigned'},
      if (collected)
        {'at': '2026-11-17T09:40:00.000Z', 'kind': 'orders_collected', 'label': 'Orders collected from breakdown spot'},
    ],
  };

  test('parses the backend handover shape during handover', () {
    final h = BreakdownHandover.fromJson(response(stage: 'handover', locAt: '2026-11-17T09:58:00.000Z'), now: now);
    expect(h.isHandover, isTrue);
    expect(h.breakdownPoint?.lat, 6.9);
    expect(h.reportedAt, '2026-11-17T09:00:00.000Z');
    expect(h.events.map((e) => e.type), ['RIDER_ASSIGNED', 'REPORTED']); // newest first
    final r = h.replacements.single;
    expect(r.photoUrl, 'https://x/p.jpg');
    expect(r.rating, 4.9);
    expect(r.location, isNotNull);
    expect(r.etaMinutes, 15);
    expect(h.orders.first.itemCount, 3);
    // Not collected yet: only the delivered order counts as handed over.
    expect(h.handedOverCount, 1);
    expect(h.totalCount, 2);
  });

  test('drops a stale location and its distance / ETA', () {
    final h = BreakdownHandover.fromJson(response(stage: 'handover', locAt: '2026-11-17T09:00:00.000Z'), now: now);
    final r = h.replacements.single;
    expect(r.location, isNull);
    expect(r.distanceKm, isNull);
    expect(r.etaMinutes, isNull);
  });

  test('done once collected: all orders handed over, collected time from the event', () {
    final h = BreakdownHandover.fromJson(response(stage: 'done', collected: true), now: now);
    expect(h.isDone, isTrue);
    expect(h.handedOverCount, 2);
    expect(h.replacements.single.collectedAt, '2026-11-17T09:40:00.000Z');
    expect(h.replacements.single.phone, isNull);
  });

  test('finding rider with no replacement', () {
    final json = response(stage: 'finding_rider')..['replacement'] = null;
    final h = BreakdownHandover.fromJson(json, now: now);
    expect(h.isFindingRider, isTrue);
    expect(h.replacements, isEmpty);
  });

  test('GET /me open vehicle breakdown', () {
    final open = DriverProfile.fromJson({
      'id': 'd1',
      'name': 'A',
      'dutyStatus': 'OFF_DUTY',
      'vehicleBreakdown': {'id': 'b1', 'jobId': 'job-1', 'reportedAt': '2026-11-17T09:00:00.000Z', 'lat': 6.9, 'lng': 79.88},
    });
    expect(open.vehicleBreakdownKnown, isTrue);
    expect(open.vehicleBreakdown?.jobId, 'job-1');
    expect(open.copyWith(dutyStatus: 'OFF_DUTY').hasOpenBreakdown, isTrue);
    expect(open.copyWith(clearVehicleBreakdown: true).hasOpenBreakdown, isFalse);

    final none = DriverProfile.fromJson({'id': 'd1', 'name': 'A', 'vehicleBreakdown': null});
    expect(none.vehicleBreakdownKnown, isTrue);
    expect(none.hasOpenBreakdown, isFalse);

    final oldBackend = DriverProfile.fromJson({'id': 'd1', 'name': 'A'});
    expect(oldBackend.vehicleBreakdownKnown, isFalse);
  });
}
