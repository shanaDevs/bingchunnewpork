import 'package:bing_chun_admin/presentation/components/re_ring_button.dart';
import 'package:bing_chun_admin/data/mappers/delivery_mappers.dart';
import 'package:bing_chun_admin/data/mappers/mappers.dart';
import 'package:bing_chun_admin/domain/entities/delivery.dart';
import 'package:bing_chun_admin/domain/entities/order.dart';
import 'package:bing_chun_admin/domain/logic/delivery_selection.dart';
import 'package:bing_chun_admin/domain/logic/orders_csv.dart';
import 'package:bing_chun_admin/domain/logic/takeaway_queue.dart';
import 'package:flutter_test/flutter_test.dart';

OrderSummary _o(String id, {String status = OrderStatus.received, int minute = 0, String mode = OrderMode.takeaway}) =>
    orderSummaryFromJson({
      'id': id,
      'orderNumber': 'BC-$id',
      'orderMode': mode,
      'status': status,
      'total': 1250,
      'createdAt': DateTime.utc(2026, 10, 30, 4, minute).toIso8601String(),
      'paymentMethod': 'CASH_AT_COUNTER',
      'paymentStatus': 'PENDING',
      'items': [
        {'id': 'i', 'productName': 'Milk Tea', 'quantity': 2, 'unitPrice': 625, 'totalPrice': 1250},
      ],
    });

void main() {
  group('delivery selection (web deliverySelection.ts)', () {
    test('adds orders until the cup limit', () {
      final sel = <String, ({String orderNumber, int cups})>{'a': (orderNumber: 'A', cups: 15)};
      expect(canAddOrderToSelection(sel, 5, 20).ok, isTrue);
      final blocked = canAddOrderToSelection(sel, 6, 20);
      expect(blocked.ok, isFalse);
      expect(blocked.newTotal, 21);
    });

    test('a single oversized order is still allowed on its own', () {
      expect(canAddOrderToSelection({}, 25, 20).ok, isTrue);
      expect(isValidDeliveryGroup(25, 1, 20), isTrue);
      expect(isValidDeliveryGroup(25, 2, 20), isFalse);
      expect(groupOverLimit(25, 2, 20), isTrue);
      expect(isValidDeliveryGroup(0, 0, 20), isFalse);
    });

    test('run title matches the web', () {
      expect(deliveryGroupTitle(1, 1), 'Delivery · 1 order (1 cup)');
      expect(deliveryGroupTitle(3, 12), 'Delivery · 3 orders (12 cups)');
    });
  });

  group('takeaway queue (web AdminTakeawayQueuePanel)', () {
    test('status only moves forward', () {
      expect(isQueueStatusDisabled(OrderStatus.preparing, OrderStatus.received), isTrue);
      expect(isQueueStatusDisabled(OrderStatus.preparing, OrderStatus.ready), isFalse);
      expect(isQueueStatusDisabled(OrderStatus.received, OrderStatus.preparing), isFalse);
    });

    test('moves swap neighbours and stop at the ends', () {
      final q = [_o('1'), _o('2'), _o('3')];
      expect(moveInQueue(q, 1, -1), ['2', '1', '3']);
      expect(moveInQueue(q, 2, 1), isNull);
      expect(moveInQueue(q, 0, -1), isNull);
    });

    test('ordered-time sorts', () {
      final q = [_o('late', minute: 30), _o('early', minute: 5)];
      expect(sortQueue(q, QueueSort.queue).map((o) => o.id), ['late', 'early']);
      expect(sortQueue(q, QueueSort.orderedAsc).map((o) => o.id), ['early', 'late']);
      expect(sortQueue(q, QueueSort.orderedDesc).map((o) => o.id), ['late', 'early']);
      expect(queueItemCount(q.first), 2);
    });
  });

  group('orders CSV (web exportCsv)', () {
    test('columns, mode labels and quoted location', () {
      final delivery = orderSummaryFromJson({
        'id': 'd',
        'orderNumber': 'BC-9',
        'orderMode': OrderMode.delivery,
        'status': 'READY',
        'total': 980.5,
        'createdAt': '2026-10-30T04:00:00Z',
        'deliveryAddressLine': '12, "Lake" Rd',
        'store': {'name': 'Dehiwala, 1'},
      });
      final csv = ordersCsv([_o('1'), delivery], showStore: true, formatDate: (_) => '10/30/2026');
      final lines = csv.split('\n');
      expect(lines.first, 'Order Number,Mode,Store,Delivery Location,Total,Status,Date');
      expect(lines[1], 'BC-1,Pick up,,"",1250,RECEIVED,10/30/2026');
      expect(lines[2], 'BC-9,Delivery,"Dehiwala, 1","12, ""Lake"" Rd",980.5,READY,10/30/2026');
      expect(
        ordersCsv(const [], showStore: false, formatDate: (_) => '').split('\n').first,
        'Order Number,Mode,Delivery Location,Total,Status,Date',
      );
    });
  });

  group('delivery grouping mappers', () {
    test('pending order', () {
      final o = pendingDeliveryOrderFromJson({
        'orderId': 'o1',
        'orderNumber': 'BC-1',
        'customerName': 'Nimal',
        'customerPhone': '077',
        'addressLine': '1 Main St',
        'city': 'Dehiwala',
        'district': 'Colombo',
        'paymentMethod': 'PAYHERE',
        'paymentStatus': 'PAID',
        'lat': 6.85,
        'lng': 79.86,
        'items': [
          {'productName': 'Tea', 'quantity': 3},
        ],
      });
      expect(o.location?.lat, 6.85);
      expect(o.items.single.quantity, 3);
    });

    test('classify result reuses the route preview only with a road path', () {
      final store = {
        'id': 's',
        'name': 'Dehiwala',
        'lat': 6.85,
        'lng': 79.86,
        'addressLine': 'Galle Rd',
        'city': 'Dehiwala',
      };
      final r = classifyResultFromJson({
        'store': store,
        'mode': 'directional',
        'totalCups': 14,
        'maxCupsPerRider': 20,
        'clusters': [
          {
            'id': 'c1',
            'label': 'Delivery Run #1 - North',
            'orderIds': ['o1', 'o2'],
            'orders': [
              {'orderNumber': 'BC-1', 'customerName': 'A', 'itemCount': 4},
            ],
            'routePreview': {
              'stops': [
                {'orderNumber': 'BC-2', 'customerName': 'B', 'itemCount': 6, 'sequence': 1, 'lat': 6.86, 'lng': 79.87},
                {'orderNumber': 'BC-1', 'customerName': 'A', 'itemCount': 4, 'sequence': 2, 'lat': 6.87, 'lng': 79.88},
              ],
              'path': [
                {'lat': 6.85, 'lng': 79.86},
                {'lat': 6.87, 'lng': 79.88},
              ],
              'summary': {'stopCount': 2, 'totalDistanceKm': 3.2, 'estimatedMinutes': 14},
            },
          },
          {
            'id': 'c2',
            'label': 'Delivery Run #2 - South',
            'orderIds': ['o3'],
            'orders': [
              {'orderNumber': 'BC-3', 'customerName': 'C', 'itemCount': 4},
            ],
          },
        ],
      });
      expect(r.clusters, hasLength(2));
      final first = r.clusters.first;
      expect(first.orderIds, ['o1', 'o2']);
      expect(first.totalCups, 10);
      expect(first.route?.stops.map((s) => s.orderNumber), ['BC-2', 'BC-1']);
      expect(first.route?.estimatedMinutes, 14);
      expect(r.clusters.last.route, isNull);
      expect(r.clusters.last.stops.single.sequence, 1);
      expect(r.without('c1').clusters.single.id, 'c2');
    });
  });

  group('re-ring (web ReRingButton)', () {
    final created = DateTime(2026, 10, 30, 10);
    DeliveryJob job({String status = 'SCHEDULED', String? driver}) => DeliveryJob(
      id: 'j',
      title: 'Run',
      status: status,
      orderCount: 2,
      scheduledAt: created,
      createdAt: created,
      driverName: driver,
    );

    test('only unclaimed scheduled jobs, 30 s after publishing', () {
      expect(ReRingButton.eligible(job(), created.add(const Duration(seconds: 29))), isFalse);
      expect(ReRingButton.eligible(job(), created.add(const Duration(seconds: 30))), isTrue);
      expect(ReRingButton.eligible(job(driver: 'Kamal'), created.add(const Duration(minutes: 2))), isFalse);
      expect(ReRingButton.eligible(job(status: 'ASSIGNED'), created.add(const Duration(minutes: 2))), isFalse);
    });
  });
}
