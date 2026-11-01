import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Bonded Bluetooth printer row from the native ESC/POS channel.
class BondedPrinter {
  const BondedPrinter({required this.name, required this.address});
  final String name;
  final String address;

  factory BondedPrinter.fromMap(Map<Object?, Object?> m) => BondedPrinter(
    name: (m['name'] as String?)?.trim().isNotEmpty == true ? m['name'] as String : 'Unknown',
    address: m['address'] as String? ?? '',
  );
}

/// Flutter side of SUN IFORCE-style thermal printing: SPP connect + ESC/POS bytes.
final class BluetoothPrinter {
  BluetoothPrinter._();

  static const _channel = MethodChannel('com.bingchun.bing_chun_cashier/bluetooth_printer');

  static bool get isSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<bool> hasPermission() async {
    if (!isSupported) return false;
    return await _channel.invokeMethod<bool>('hasPermission') ?? false;
  }

  static Future<bool> requestPermission() async {
    if (!isSupported) return false;
    return await _channel.invokeMethod<bool>('requestPermission') ?? false;
  }

  static Future<bool> isBluetoothOn() async {
    if (!isSupported) return false;
    return await _channel.invokeMethod<bool>('isBluetoothOn') ?? false;
  }

  static Future<List<BondedPrinter>> listBonded() async {
    if (!isSupported) return const [];
    final raw = await _channel.invokeMethod<List<Object?>>('listBonded') ?? const [];
    return [
      for (final row in raw)
        if (row is Map<Object?, Object?>) BondedPrinter.fromMap(row),
    ];
  }

  static Future<bool> connect(String mac) async {
    if (!isSupported) return false;
    return await _channel.invokeMethod<bool>('connect', {'mac': mac}) ?? false;
  }

  static Future<void> disconnect() async {
    if (!isSupported) return;
    await _channel.invokeMethod<void>('disconnect');
  }

  /// Body lines may use `[TITLE]` / `[B]` / `[C]` prefixes (same markup as SUN).
  static Future<void> printReceipt({String title = '', required String body, String footer = ''}) async {
    if (!isSupported) throw UnsupportedError('Bluetooth printing is Android-only');
    await _channel.invokeMethod<void>('printReceipt', {
      'title': title,
      'body': body,
      'footer': footer,
    });
  }

  static Future<void> feedAndCut() async {
    if (!isSupported) return;
    await _channel.invokeMethod<void>('feedAndCut');
  }

  /// Connect → print → cut → disconnect. Throws on failure.
  static Future<void> runJob({
    required String mac,
    required Future<void> Function() job,
  }) async {
    final ok = await connect(mac);
    if (!ok) throw Exception('Could not connect to printer $mac');
    try {
      await job();
      await feedAndCut();
    } finally {
      await disconnect();
    }
  }
}
