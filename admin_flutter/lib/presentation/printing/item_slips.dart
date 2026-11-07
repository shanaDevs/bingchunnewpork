import '../../core/bluetooth_printer.dart';
import '../../core/runtime_config.dart';
import '../../domain/entities/order.dart';
import '../../l10n/l10n.dart';

/// One 3-inch (≈80 mm) cup/kitchen slip — order number + item name.
class ItemSlip {
  const ItemSlip({required this.orderNumber, required this.itemName, required this.index, required this.total});

  final String orderNumber;
  final String itemName;
  final int index;
  final int total;

  String get escPosBody => [
    '[TITLE]ORDER SLIP',
    '[C]$orderNumber',
    '',
    '[B]$itemName',
    ItemSlips.sep,
    if (total > 1) '[C]$index / $total',
  ].join('\n');
}

/// 3-inch cup/kitchen slips over Bluetooth ESC/POS — one slip per item unit.
final class ItemSlips {
  ItemSlips._();

  static const sep = '--------------------------------';

  /// Expands each [OrderLine] by quantity into separate slips.
  static List<ItemSlip> buildSlips(OrderDetail order) {
    final out = <ItemSlip>[];
    for (final item in order.items) {
      final qty = item.quantity < 1 ? 1 : item.quantity;
      for (var i = 0; i < qty; i++) {
        out.add(ItemSlip(orderNumber: order.orderNumber, itemName: item.productName, index: 0, total: 0));
      }
    }
    final total = out.length;
    return [
      for (final (i, s) in out.indexed)
        ItemSlip(orderNumber: s.orderNumber, itemName: s.itemName, index: i + 1, total: total),
    ];
  }

  /// Connect → print every slip → cut → disconnect (SUN IFORCE flow).
  static Future<void> printSlips(List<ItemSlip> slips) async {
    final mac = RuntimeConfig.instance.bluetoothPrinterMac?.trim() ?? '';
    if (mac.isEmpty) {
      throw Exception(tr('No Bluetooth printer selected. Open More → Printer.'));
    }
    if (slips.isEmpty) throw Exception(tr('This order has no items to print'));

    await BluetoothPrinter.runJob(
      mac: mac,
      job: () async {
        for (final slip in slips) {
          await BluetoothPrinter.printReceipt(body: slip.escPosBody);
        }
      },
    );
  }

  static Future<void> printForOrder(OrderDetail order) => printSlips(buildSlips(order));

  /// Settings "Test print" — same connect → receipt → cut → disconnect cycle.
  static Future<void> printTest({required String mac}) async {
    await BluetoothPrinter.runJob(
      mac: mac,
      job: () async {
        await BluetoothPrinter.printReceipt(
          title: 'BING CHUN TEST PRINT',
          body: [
            sep,
            '[C]Printer connected',
            '[C]Paper: 80mm / 3 inch',
            '[C]Font A · 48 columns',
            sep,
          ].join('\n'),
          footer: '--- END OF TEST ---',
        );
      },
    );
  }
}
