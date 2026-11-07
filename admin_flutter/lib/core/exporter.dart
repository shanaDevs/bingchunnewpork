import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import 'format.dart';

/// Report / table exports — the web `downloadCsv` and AdminReportPdf, delivered
/// through the system share sheet (save to Files, Drive, email, WhatsApp…).
abstract final class Exporter {
  /// Quotes a CSV cell only when it would break the row.
  static String csvCell(Object? v) {
    final s = v == null ? '' : '$v';
    return s.contains(RegExp('[",\n\r]')) ? '"${s.replaceAll('"', '""')}"' : s;
  }

  static String buildCsv(List<String> headers, List<List<Object?>> rows) => [
    headers.map(csvCell).join(','),
    for (final r in rows) r.map(csvCell).join(','),
  ].join('\n');

  static Future<void> shareCsv(
    BuildContext context, {
    required String filename,
    required List<String> headers,
    required List<List<Object?>> rows,
  }) async {
    // UTF-8 BOM so Excel opens Sinhala / Chinese text correctly.
    final bytes = [0xEF, 0xBB, 0xBF, ...utf8.encode(buildCsv(headers, rows))];
    await _share(context, filename.endsWith('.csv') ? filename : '$filename.csv', bytes, 'text/csv');
  }

  /// Landscape A4 table report with a title block, summary chips and page numbers.
  static Future<void> sharePdf(
    BuildContext context, {
    required String filename,
    required String title,
    required String subtitle,
    required List<String> headers,
    required List<List<String>> rows,
    List<(String, String)> summary = const [],
    Set<int> numericColumns = const {},
  }) async {
    final brand = PdfColor.fromInt(0xFF1E3A8A);
    final doc = pw.Document(title: title, author: 'Bing Chun');
    final generated = formatReceiptDate(DateTime.now());
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4.landscape,
        margin: const pw.EdgeInsets.all(28),
        header: (ctx) => ctx.pageNumber == 1
            ? pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text('BING CHUN', style: pw.TextStyle(color: brand, fontWeight: pw.FontWeight.bold, fontSize: 10, letterSpacing: 2)),
                  pw.SizedBox(height: 4),
                  pw.Text(title, style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
                  pw.SizedBox(height: 2),
                  pw.Text('$subtitle  ·  Generated $generated', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                  if (summary.isNotEmpty) ...[
                    pw.SizedBox(height: 10),
                    pw.Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        for (final (label, value) in summary)
                          pw.Container(
                            padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: pw.BoxDecoration(
                              color: PdfColor.fromInt(0xFFEFF4FF),
                              borderRadius: pw.BorderRadius.circular(6),
                            ),
                            child: pw.Column(
                              crossAxisAlignment: pw.CrossAxisAlignment.start,
                              children: [
                                pw.Text(label, style: const pw.TextStyle(fontSize: 7.5, color: PdfColors.grey700)),
                                pw.Text(value, style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ],
                  pw.SizedBox(height: 12),
                ],
              )
            : pw.SizedBox(),
        footer: (ctx) => pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text('Page ${ctx.pageNumber} of ${ctx.pagesCount}', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
        ),
        build: (ctx) => [
          if (rows.isEmpty)
            pw.Padding(
              padding: const pw.EdgeInsets.all(24),
              child: pw.Text('No rows for the selected filters.', style: const pw.TextStyle(color: PdfColors.grey700)),
            )
          else
            pw.TableHelper.fromTextArray(
              headers: headers,
              data: rows,
              headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 8),
              headerDecoration: pw.BoxDecoration(color: brand),
              cellStyle: const pw.TextStyle(fontSize: 8),
              cellPadding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 4),
              oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF5F7FB)),
              cellAlignments: {for (final i in numericColumns) i: pw.Alignment.centerRight},
              headerAlignments: {for (final i in numericColumns) i: pw.Alignment.centerRight},
            ),
        ],
      ),
    );
    final bytes = await doc.save();
    if (!context.mounted) return;
    await _share(context, filename.endsWith('.pdf') ? filename : '$filename.pdf', bytes, 'application/pdf');
  }

  static Future<void> _share(BuildContext context, String filename, List<int> bytes, String mime) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null || !box.hasSize ? null : box.localToGlobal(Offset.zero) & box.size;
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: mime)], fileNameOverrides: [filename], sharePositionOrigin: origin),
    );
  }
}
