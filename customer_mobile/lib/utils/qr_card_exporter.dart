import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

const _filesChannel = MethodChannel('lk.bingchun.bing_chun_customer/files');

/// Captures a [RepaintBoundary] to PNG bytes.
Future<Uint8List?> captureRepaintBoundaryPng({
  required GlobalKey boundaryKey,
  double pixelRatio = 3,
}) async {
  final boundary =
      boundaryKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
  if (boundary == null) return null;

  final image = await boundary.toImage(pixelRatio: pixelRatio);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  return byteData?.buffer.asUint8List();
}

Future<Directory> _fallbackDownloadDirectory() async {
  if (Platform.isAndroid) {
    final external = await getExternalStorageDirectory();
    if (external != null) {
      final fallback = Directory('${external.path}/Download');
      if (!await fallback.exists()) {
        await fallback.create(recursive: true);
      }
      return fallback;
    }
  }

  final downloads = await getDownloadsDirectory();
  if (downloads != null) {
    final bingChun = Directory('${downloads.path}/BingChun');
    if (!await bingChun.exists()) {
      await bingChun.create(recursive: true);
    }
    return bingChun;
  }

  return getApplicationDocumentsDirectory();
}

/// Saves raw bytes into Files → Download → BingChun.
Future<String?> saveBytesToDownloads({
  required Uint8List bytes,
  required String fileName,
  required String mimeType,
}) async {
  final safeName = fileName.replaceAll(RegExp(r'[^\w.\-]+'), '_');

  if (Platform.isAndroid) {
    try {
      final saved = await _filesChannel.invokeMethod<String>(
        'saveFileToDownloads',
        <String, dynamic>{
          'fileName': safeName,
          'bytes': bytes,
          'mimeType': mimeType,
        },
      );
      if (saved != null && saved.isNotEmpty) return saved;
    } catch (_) {
      // Fall through to dart IO fallback.
    }
  }

  final dir = await _fallbackDownloadDirectory();
  final file = File('${dir.path}/$safeName');
  await file.writeAsBytes(bytes, flush: true);
  return file.path;
}

/// Captures a [RepaintBoundary] and saves the PNG to device Files/Downloads.
Future<String?> saveRepaintBoundaryPng({
  required GlobalKey boundaryKey,
  required String fileName,
}) async {
  final bytes = await captureRepaintBoundaryPng(boundaryKey: boundaryKey);
  if (bytes == null) return null;
  return saveBytesToDownloads(
    bytes: bytes,
    fileName: fileName,
    mimeType: 'image/png',
  );
}

/// Captures a [RepaintBoundary] widget and shares it as a PNG file.
Future<bool> shareRepaintBoundaryPng({
  required GlobalKey boundaryKey,
  required String fileName,
  String? shareText,
}) async {
  final bytes = await captureRepaintBoundaryPng(boundaryKey: boundaryKey);
  if (bytes == null) return false;

  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$fileName');
  await file.writeAsBytes(bytes, flush: true);

  await Share.shareXFiles(
    [XFile(file.path, mimeType: 'image/png')],
    text: shareText,
    subject: shareText,
  );

  return true;
}
