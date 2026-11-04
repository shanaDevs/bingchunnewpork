import 'package:bing_chun_admin/core/runtime_config.dart';
import 'package:bing_chun_admin/data/mappers/mappers.dart';
import 'package:bing_chun_admin/domain/entities/order.dart';
import 'package:bing_chun_admin/domain/logic/counter_payment.dart';
import 'package:bing_chun_admin/domain/logic/order_query.dart';
import 'package:bing_chun_admin/domain/logic/order_rules.dart';
import 'package:bing_chun_admin/domain/logic/period.dart';
import 'package:flutter_test/flutter_test.dart';

OrderDetail _order({
  String status = OrderStatus.ready,
  String mode = OrderMode.takeaway,
  String method = PaymentMethod.cashAtCounter,
  String payment = 'PENDING',
  double total = 1300,
  double? prepaid,
  double? balanceDue,
  bool? canEdit,
  bool canCancel = false,
  DateTime? cancelWindowEndsAt,
}) => OrderDetail(
  id: 'o1',
  orderNumber: 'BC-1001',
  orderMode: mode,
  status: status,
  total: total,
  createdAt: DateTime(2026, 10, 30),
  paymentMethod: method,
  paymentStatus: payment,
  prepaidAmount: prepaid,
  balanceDue: balanceDue,
  canEdit: canEdit,
  canCancel: canCancel,
  cancelWindowEndsAt: cancelWindowEndsAt,
  subtotal: total,
);

void main() {
  group('counter payment', () {
    test('card is always valid', () {
      expect(counterPaymentValid(CounterPaymentMethod.card, '', 1000), isTrue);
    });

    test('cash must cover the amount due', () {
      expect(counterPaymentValid(CounterPaymentMethod.cash, '999', 1000), isFalse);
      expect(counterPaymentValid(CounterPaymentMethod.cash, '1000', 1000), isTrue);
    });

    test('empty cash is only allowed when the amount is optional (POS)', () {
      expect(counterPaymentValid(CounterPaymentMethod.cash, '', 1000), isFalse);
      expect(counterPaymentValid(CounterPaymentMethod.cash, '', 1000, requireCashAmount: false), isTrue);
    });

    test('change and shortfall', () {
      expect(cashChange('1500', 1300), 200);
      expect(cashChange('1000', 1300), -300);
      expect(cashChange('', 1300), isNull);
    });

    test('API values', () {
      expect(CounterPaymentMethod.cash.apiValue, 'CASH_AT_COUNTER');
      expect(CounterPaymentMethod.card.apiValue, 'CARD');
    });
  });

  group('order rules', () {
    test('cash pickup pending payment is fully editable', () {
      expect(orderEditMode(_order()), OrderEditMode.full);
    });

    test('paid pickup can only add items', () {
      expect(orderEditMode(_order(payment: 'PAID', method: PaymentMethod.payhere)), OrderEditMode.addOnly);
    });

    test('server flags override the defaults', () {
      final o = _order(canEdit: false);
      expect(orderEditMode(o), isNull);
      expect(orderEditLockedReason(o), 'Cash pickup order editing is disabled in settings');
    });

    test('delivery orders are not editable', () {
      expect(orderEditLockedReason(_order(mode: OrderMode.delivery)), 'Only pickup orders can be edited');
    });

    test('unpaid pickup collects the full total; paid collects only the balance', () {
      expect(counterAmountDue(_order()), 1300);
      expect(counterAmountDue(_order(payment: 'PAID', prepaid: 1000)), 300);
      expect(counterAmountDue(_order(payment: 'PAID', balanceDue: 0)), 0);
    });

    test('customer cancel window hides accept / reject', () {
      final now = DateTime(2026, 10, 30, 12);
      final open = _order(
        status: OrderStatus.received,
        canCancel: true,
        cancelWindowEndsAt: now.add(const Duration(minutes: 2)),
      );
      expect(isCustomerCancelWindowActive(open, now), isTrue);
      expect(isCustomerCancelWindowActive(open, now.add(const Duration(minutes: 3))), isFalse);
    });
  });

  group('OrderQuery', () {
    const period = PeriodFilter(PeriodPreset.custom, from: null, to: null);

    test('pickup queue searches by token and sorts by pickup', () {
      final q = OrderQuery(
        tab: OrderTab.pickup,
        period: PeriodFilter(PeriodPreset.custom, from: DateTime(2026, 10, 1), to: DateTime(2026, 10, 30)),
        search: '12',
      );
      final p = q.listParams(1);
      expect(p['orderMode'], 'TAKEAWAY');
      expect(p['fulfillmentQueue'], 'pickup');
      expect(p['sortBy'], 'pickup');
      expect(p['searchBy'], 'token');
      expect(p['search'], '12');
      expect(p['status'], 'RECEIVED');
      expect(p['startDate'], '2026-10-01');
      expect(p['endDate'], '2026-10-30');
    });

    test('archives drop the mode filter and list newest first', () {
      final q = const OrderQuery(tab: OrderTab.pickup, period: period, archive: ArchiveView.cancelled, sortDir: 'desc');
      final p = q.listParams(2);
      expect(p['status'], 'CANCELLED');
      expect(p.containsKey('orderMode'), isFalse);
      expect(p['page'], '2');
      expect(OrderQuery.defaultSortDir(ArchiveView.cancelled), 'desc');
    });

    test('tab badge counts exclude finished orders', () {
      final p = const OrderQuery(tab: OrderTab.pickup, period: period).tabCountParams(OrderTab.delivery);
      expect(p['excludeStatus'], 'DELIVERED,OUT_FOR_DELIVERY,CANCELLED');
      expect(p['orderMode'], 'DELIVERY');
      expect(p['limit'], '1');
    });

    test('custom period is not ready until both dates are picked', () {
      expect(period.ready, isFalse);
      expect(const PeriodFilter.today().ready, isTrue);
    });
  });

  group('mappers', () {
    test('relative product images resolve against the API origin', () {
      final origin = AppConfig.socketOrigin;
      expect(AppConfig.resolveAssetUrl('/products/a.png'), '$origin/products/a.png');
      expect(AppConfig.resolveAssetUrl('https://cdn.x/a.png'), 'https://cdn.x/a.png');
      expect(origin.endsWith('/api'), isFalse);
    });

    test('order detail reads nested user, store, items and toppings', () {
      final o = orderDetailFromJson({
        'id': 'o9',
        'orderNumber': 'BC-9',
        'orderMode': 'TAKEAWAY',
        'status': 'READY',
        'total': '1450',
        'createdAt': '2026-10-30T08:00:00.000Z',
        'paymentMethod': 'CASH_AT_COUNTER',
        'paymentStatus': 'PENDING',
        'queuePosition': 7,
        'user': {'name': 'Nimal', 'phone': '0771234567'},
        'store': {'id': 's1', 'name': 'Bing Chun - Nugegoda'},
        'items': [
          {
            'id': 'i1',
            'productName': 'Bubble Milk Tea',
            'quantity': 2,
            'unitPrice': 700,
            'totalPrice': 1400,
            'product': {'imageUrl': 'https://x/y.png'},
            'toppings': [
              {'toppingName': 'Pearls'},
            ],
          },
        ],
      });
      expect(o.total, 1450);
      expect(o.queuePosition, 7);
      expect(o.storeId, 's1');
      expect(customerDisplayName(o), 'Nimal');
      expect(o.items.single.toppings, ['Pearls']);
      expect(o.items.single.imageUrl, 'https://x/y.png');
    });

    test('dashboard converts wallet cents and reads chart series', () {
      final d = dashboardFromJson({
        'periodRevenue': 64975,
        'periodRefundAmount': 0,
        'onlineWalletBalance': 13831979,
        'revenueChannels': {'pickupCash': 0, 'pickupCard': 0, 'pickupOnline': 0, 'deliveryCard': 64975},
        'needsAttention': [
          {'type': 'active', 'label': 'Orders in progress', 'count': 10, 'href': '/admin/orders'},
        ],
        'peakHours': [
          {'hour': 9, 'label': '9 AM', 'orders': 9, 'revenue': 5000},
        ],
        'monthlyOverview': [
          {'month': 'Oct 2026', 'revenue': 64975, 'orders': 17, 'outflow': 0},
        ],
      });
      expect(d.onlineWalletBalance, closeTo(138319.79, 0.001));
      expect(d.deliveryOnline, 64975);
      expect(d.needsAttention.single.label, 'Orders in progress');
      expect(d.peakHours.single.orders, 9);
      expect(d.monthlyOverview.single.shortMonth, 'Oct');
    });

    test('stored notifications recover order number and mode', () {
      final n = noticeFromJson({
        'id': 'n1',
        'type': 'NEW_ORDER',
        'title': 'New pickup order',
        'message': 'Nimal placed order BC-77 · 2 items',
        'createdAt': '2026-10-30T08:00:00.000Z',
      });
      expect(n.orderNumber, 'BC-77');
      expect(n.orderMode, OrderMode.takeaway);
    });

    test('product toppings unwrap the { topping } join rows', () {
      final p = productFromJson({
        'id': 'p1',
        'categoryId': 'c1',
        'name': 'Bubble Milk Tea',
        'basePrice': 650,
        'category': {'name': 'Milk Tea'},
        'toppings': [
          {
            'topping': {'id': 't1', 'name': 'Pearls', 'extraPrice': 100, 'isAvailable': true},
          },
          {
            'topping': {'id': 't2', 'name': 'Jelly', 'extraPrice': 80, 'isAvailable': false},
          },
        ],
      });
      expect(p.categoryName, 'Milk Tea');
      expect(p.imageUrl, isNull);
      expect(p.availableToppings.map((t) => t.id), ['t1']);
      expect(p.splitName, ('Bubble', 'Milk Tea'));
    });
  });
}
