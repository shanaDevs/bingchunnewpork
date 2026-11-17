import 'package:bing_chun_admin/data/mappers/delivery_mappers.dart';
import 'package:bing_chun_admin/data/mappers/stock_mappers.dart';
import 'package:bing_chun_admin/domain/entities/admin_session.dart';
import 'package:bing_chun_admin/domain/entities/delivery.dart';
import 'package:bing_chun_admin/domain/entities/stock.dart';
import 'package:bing_chun_admin/domain/logic/delivery_rules.dart';
import 'package:bing_chun_admin/domain/logic/menu_access.dart';
import 'package:bing_chun_admin/domain/logic/stock_rules.dart';
import 'package:flutter_test/flutter_test.dart';

const _branch = AdminSession(id: 'a', name: 'B', email: 'b@x', role: 'STORE_MANAGER', storeId: 's1', deliveryEnabled: true);
const _super = AdminSession(id: 'z', name: 'S', email: 's@x', role: 'SYSTEM_ADMIN');

const _read = MenuPermission(read: true, any: true);
const _none = MenuPermission(read: false, any: false);

StockItem _item({
  int onHand = 100,
  bool low = false,
  bool out = false,
  bool deactivated = false,
  bool catalogOff = false,
  bool? isNew,
  int target = 150,
}) => StockItem(
  productId: 'p',
  name: 'Tea',
  categoryName: 'Bubble Tea',
  categorySlug: 'bubble-tea',
  basePrice: 450,
  cost: 0,
  isAvailable: !deactivated,
  weeklyTargetQty: target,
  weeklyReceivedQty: 0,
  onHandQty: onHand,
  onlineAvailableQty: onHand,
  batchCount: 1,
  isLowStock: low,
  isOutOfStock: out,
  isBranchDeactivated: deactivated,
  catalogAvailable: !catalogOff,
  isNewProduct: isNew,
);

void main() {
  group('MenuAccess', () {
    test('super admins get the super admin page set', () {
      expect(MenuAccess(const {}, _super).pages, [
        AppPage.dashboard,
        AppPage.allOrders,
        AppPage.refunds,
        AppPage.sales,
        AppPage.wallet,
        AppPage.jason,
        AppPage.menu,
        AppPage.promotions,
        AppPage.reports,
      ]);
    });

    test('branch admins see only the dashboard until permissions load', () {
      expect(const MenuAccess.base(_branch).pages, [AppPage.dashboard]);
    });

    test('branch admin pages follow menu read permissions', () {
      final access = MenuAccess(const {'ORDERS': _read, 'DELIVERY': _read, 'STOCK': _read, 'CASHIERS': _read}, _branch);
      expect(access.pages, [
        AppPage.dashboard,
        AppPage.orders,
        AppPage.refunds,
        AppPage.delivery,
        AppPage.liveDrivers,
        AppPage.stock,
        AppPage.cashiers,
      ]);
    });

    test('branch admins never see super admin pages', () {
      const access = MenuAccess.defaults(_branch);
      for (final p in [AppPage.allOrders, AppPage.jason, AppPage.menu, AppPage.promotions]) {
        expect(access.allows(p), isFalse, reason: p.name);
      }
      expect(access.allows(AppPage.settings), isTrue);
      expect(access.allows(AppPage.wallet), isTrue);
    });

    test('write grants are read per action', () {
      final access = MenuAccess(const {'CASHIERS': MenuPermission(read: true, any: true, update: true)}, _branch);
      expect(access.canUpdate('CASHIERS'), isTrue);
      expect(access.canDelete('CASHIERS'), isFalse);
      expect(access.canCreate('CASHIERS'), isFalse);
    });

    test('Live Drivers uses its own row when granted, else falls back to DELIVERY', () {
      expect(
        MenuAccess(const {'DELIVERY': _read, 'LIVE_DRIVERS': _none}, _branch).allows(AppPage.liveDrivers),
        isTrue,
      );
      expect(
        MenuAccess(const {
          'DELIVERY': _read,
          'LIVE_DRIVERS': MenuPermission(read: false, any: true),
        }, _branch).allows(AppPage.liveDrivers),
        isFalse,
      );
    });

    test('pickup-only branches never see delivery pages', () {
      const pickupOnly = AdminSession(
        id: 'a',
        name: 'B',
        email: 'b',
        role: 'STORE_MANAGER',
        storeId: 's',
        deliveryEnabled: false,
      );
      final access = MenuAccess(const {'DELIVERY': _read, 'LIVE_DRIVERS': _read}, pickupOnly);
      expect(access.allows(AppPage.delivery), isFalse);
      expect(access.allows(AppPage.liveDrivers), isFalse);
    });
  });

  group('stock rules', () {
    test('level tabs are exclusive', () {
      expect(matchesLevel(_item(), StockLevel.inStock), isTrue);
      expect(matchesLevel(_item(low: true), StockLevel.lowStock), isTrue);
      expect(matchesLevel(_item(out: true, onHand: 0), StockLevel.outOfStock), isTrue);
      expect(matchesLevel(_item(deactivated: true), StockLevel.inactive), isTrue);
      expect(matchesLevel(_item(catalogOff: true, out: true), StockLevel.inactive), isTrue);
      expect(matchesLevel(_item(catalogOff: true, out: true), StockLevel.outOfStock), isFalse);
      expect(matchesLevel(_item(deactivated: true), StockLevel.inStock), isFalse);
      expect(matchesLevel(_item(isNew: true, onHand: 0, target: 0), StockLevel.newProducts), isTrue);
    });

    test('KPIs count like the web cards', () {
      final k = StockKpis([_item(), _item(low: true), _item(out: true), _item(deactivated: true)]);
      expect(k.all, 4);
      expect(k.lowStock, 1);
      expect(k.outOfStock, 1);
      expect(k.inactive, 1);
      expect(k.active, 2);
    });

    test('low remaining is 10% or less of the batch', () {
      final b = stockBatchFromJson({
        'id': 'b',
        'batchNumber': 'R-1',
        'receivedQty': 100,
        'remainingQty': 10,
        'receivedAt': '2026-10-01T00:00:00Z',
        'status': 'ACTIVE',
      });
      expect(isLowRemaining(b), isTrue);
    });
  });

  group('delivery', () {
    test('cashier queries are pinned to today', () {
      final active = deliveryJobsQuery(tab: DeliveryJobsTab.active, storeId: 's1', today: '2026-10-30');
      expect(active['scheduledAtFrom'], '2026-10-30');
      expect(active.containsKey('status'), isFalse);
      final done = deliveryJobsQuery(tab: DeliveryJobsTab.completed, storeId: 's1', today: '2026-10-30', driverId: 'd');
      expect(done['status'], 'COMPLETED');
      expect(done['dateFrom'], '2026-10-30');
      expect(done['driverId'], 'd');
    });

    test('past-due held jobs leave the Active tab', () {
      final job = deliveryJobFromJson({
        'id': 'j',
        'title': 'Run',
        'status': 'ASSIGNED',
        'orderCount': 2,
        'displayStatus': 'ABANDONED',
        'scheduledAt': '2026-10-30T08:00:00Z',
      });
      expect(isActiveDeliveryJob(job), isFalse);
      expect(job.effectiveStatus, 'ABANDONED');
    });

    test('Actual GPS is offered for cancelled jobs, not missed', () {
      final cancelled = deliveryJobFromJson({
        'id': 'j',
        'title': 'Run',
        'status': 'CANCELLED',
        'orderCount': 1,
        'scheduledAt': '2026-10-30T08:00:00Z',
        'driver': {'id': 'd1', 'name': 'R'},
      });
      expect(jobLikelyHasRiderGps(cancelled), isTrue);
      expect(isLiveDeliveryRun(cancelled.status), isFalse);

      final missed = deliveryJobFromJson({
        'id': 'j',
        'title': 'Run',
        'status': 'SCHEDULED',
        'displayStatus': 'MISSED',
        'orderCount': 1,
        'scheduledAt': '2026-10-30T08:00:00Z',
      });
      expect(jobLikelyHasRiderGps(missed), isFalse);
    });

    test('pings extend the rider trail and keep it bounded', () {
      var d = const LiveDriver(driverId: 'd', name: 'R', dutyStatus: 'ON_DUTY');
      for (var i = 0; i < LiveDriver.maxTrail + 5; i++) {
        d = d.moved(GeoPoint(6.9 + i / 1000, 79.8));
      }
      expect(d.trail.length, LiveDriver.maxTrail);
      expect(d.location!.lat, closeTo(6.9 + (LiveDriver.maxTrail + 4) / 1000, 1e-9));
    });

    test('zero coordinates are treated as missing', () {
      expect(geoOrNull({'lat': 0, 'lng': 0}), isNull);
      expect(geoOrNull({'lat': 6.87, 'lng': 79.86}), isNotNull);
    });
  });
}
