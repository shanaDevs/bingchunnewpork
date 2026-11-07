import 'package:bing_chun_admin/core/exporter.dart';
import 'package:bing_chun_admin/data/mappers/admin_mappers.dart';
import 'package:bing_chun_admin/domain/entities/stock.dart';
import 'package:bing_chun_admin/domain/logic/period.dart';
import 'package:bing_chun_admin/presentation/reports/report_defs.dart';
import 'package:bing_chun_admin/presentation/screens/stock_actions.dart';
import 'package:flutter_test/flutter_test.dart';

StockItem _stock({int onHand = 40, int online = 35, int target = 100, int batches = 2, bool? isNew, int low = 25}) => StockItem(
  productId: 'p',
  name: 'Tea',
  categoryName: 'Tea',
  categorySlug: 'tea',
  basePrice: 500,
  cost: 0,
  isAvailable: true,
  weeklyTargetQty: target,
  weeklyReceivedQty: 0,
  onHandQty: onHand,
  onlineAvailableQty: online,
  batchCount: batches,
  isLowStock: false,
  isOutOfStock: false,
  isNewProduct: isNew,
  lowStockThreshold: low,
);

void main() {
  group('reports', () {
    ReportDef byId(String id) => allReports.firstWhere((r) => r.id == id);

    test('each role gets the web report set', () {
      expect(reportsFor(superAdmin: true).map((r) => r.id), [
        'branch-performance',
        'product-performance',
        'high-value-customers',
        'customer-loyalty',
        'global-overview',
        'wallet-ledger',
        'branch-settlement',
        'order-lifecycle',
        'order-fulfillment',
        'order-cancellations',
      ]);
      expect(reportsFor(superAdmin: false).map((r) => r.id), [
        'product-performance',
        'customer-loyalty',
        'global-overview',
        'wallet-ledger',
        'branch-settlement',
        'order-cancellations',
        'low-stock',
      ]);
    });

    test('period-style reports send the dashboard period', () {
      final p = byId('order-cancellations').params(const PeriodFilter.month());
      expect(p['period'], 'month');
      expect(p['limit'], '100');
    });

    test('custom ranges become from/to dates or ISO bounds', () {
      final range = PeriodFilter(PeriodPreset.custom, from: DateTime(2026, 10, 1), to: DateTime(2026, 10, 15));
      expect(byId('wallet-ledger').params(range), containsPair('from', '2026-10-01'));
      expect(byId('global-overview').params(range)['to'], '2026-10-15T23:59:59.000Z');
      expect(byId('order-lifecycle').params(range), containsPair('startDate', '2026-10-01'));
      expect(byId('branch-performance').params(range), containsPair('period', 'custom'));
    });

    test('rows and cells read the API payload', () {
      final def = byId('order-cancellations');
      final rows = def.rows({
        'cancellations': [
          {'orderNumber': 'BC-1', 'branchName': 'Bing Chun - Nugegoda', 'orderValue': 1250, 'paymentMethod': 'CARD', 'refundStatus': 'COMPLETE', 'cancelledBy': 'CUSTOMER', 'reason': 'Late'},
        ],
        'count': 1,
      });
      expect(rows, hasLength(1));
      expect(def.columns[1].cell(rows.first, 0), 'Nugegoda');
      expect(def.columns[2].cell(rows.first, 0), '1,250.00');
      expect(def.columns[2].csv!(rows.first, 0), 1250.0);
    });

    test('low stock keeps only low or out-of-stock items', () {
      final rows = byId('low-stock').rows({
        'items': [
          {'name': 'A', 'isLowStock': true},
          {'name': 'B', 'isOutOfStock': true},
          {'name': 'C'},
        ],
      });
      expect(rows.map((r) => r['name']), ['A', 'B']);
    });
  });

  group('refunds', () {
    test('cashier cancels and in-window cancels refund the whole order', () {
      final r = refundFromJson({
        'id': 'r1',
        'status': 'RECEIVED',
        'orderTotal': 1500,
        'salesTotal': 1200,
        'submittedBy': 'BRANCH_ADMIN',
        'cancelledWithinWindow': false,
        'order': {'orderNumber': 'BC-9', 'orderMode': 'TAKEAWAY'},
      });
      expect(r.isCashierCancel, isTrue);
      expect(r.calculatedAmount, 1500);
    });

    test('late cancels refund the configured share of sales', () {
      final r = refundFromJson({
        'id': 'r2',
        'status': 'RECEIVED',
        'orderTotal': 1500,
        'salesTotal': 1200,
        'cancelledWithinWindow': false,
        'configuredStatusRefundPercentage': 50,
        'order': {
          'orderNumber': 'BC-10',
          'statusEvents': [
            {'status': 'RECEIVED'},
            {'status': 'PREPARING'},
            {'status': 'CANCELLED'},
          ],
        },
      });
      expect(r.calculatedAmount, 600);
      expect(r.cancelledAtStatus, 'PREPARING');
    });

    test('rejected refunds show nothing paid back', () {
      final r = refundFromJson({'id': 'r3', 'status': 'REJECTED', 'orderTotal': 900, 'cancelledWithinWindow': true, 'order': <String, dynamic>{}});
      expect(r.displayAmount, 0);
    });
  });

  group('wallet and dashboard mappers', () {
    test('cent fields stay in cents and LKR fields stay LKR', () {
      final o = walletOverviewFromJson({
        'wallets': [
          {
            'storeId': 's1',
            'balance': '150000',
            'allTimeAvailableBalanceCents': 120000,
            'store': {'name': 'Bing Chun - Kandy', 'city': 'Kandy', 'isActive': true},
            '_count': {'transactions': 4},
          },
        ],
        'dashboard': {
          'allTimeEarnings': {'total': 500000},
          'allTimePayments': {'toBranchCents': 10000, 'toPlatformCents': 5000, 'toDeliveryLkr': 25},
          'refundsLkr': 300,
        },
      });
      expect(o.wallets.single.balanceCents, 120000);
      expect(o.dashboard!.totalPaymentsLkr, 175);
    });

    test('super dashboard wallet balance converts from cents', () {
      final d = superDashboardFromJson({'onlineWalletBalance': 250000, 'periodRevenue': 9000, 'revenueChannels': {'pickupCash': 100}});
      expect(d.onlineWalletBalance, 2500);
      expect(d.pickupCash, 100);
    });
  });

  group('stock receive rules', () {
    test('healthy stock below target gets a reset batch capped at the target', () {
      final i = _stock(onHand: 40, online: 35, target: 100);
      expect(receiveBatchType(i), 'RESET');
      expect(maxResetReceive(i), 60);
      expect(canBranchAdminReceive(i), isTrue);
    });

    test('low online stock is an emergency restock', () {
      final i = _stock(onHand: 20, online: 10, target: 100);
      expect(isEmergencyRestock(i), isTrue);
      expect(receiveBatchType(i), 'EMERGENCY');
    });

    test('no weekly target blocks receiving', () {
      expect(canBranchAdminReceive(_stock(target: 0)), isFalse);
    });

    test('activation needs stock above the low-stock level', () {
      final i = _stock(low: 25);
      expect(canActivateWithQty(25, i), isFalse);
      expect(canActivateWithQty(26, i), isTrue);
    });
  });

  test('CSV cells are quoted only when needed', () {
    expect(Exporter.buildCsv(['a', 'b'], [
      ['x', 'y,z'],
      ['say "hi"', 3],
    ]), 'a,b\nx,"y,z"\n"say ""hi""",3');
  });
}
