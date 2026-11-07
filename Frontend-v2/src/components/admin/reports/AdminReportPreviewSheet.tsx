'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { FileSpreadsheet, FileText, Globe, Mail, MapPin, Printer, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ReportPdfRow } from '@/components/admin/AdminReportPdf';
import type { ReportStatCard } from '@/components/admin/AdminReportPdf';
import {
  buildReportPreviewMetaFields,
  buildReportPreviewPrintHtml,
  formatReportPreviewDateLabel,
  type ReportPreviewFooterTotal,
} from './reportPreviewPrint';

export type { ReportPreviewFooterTotal };

export type AdminReportPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  docTitle: string;
  reportTitle: string;
  reportDescription: string;
  scopeLabel: string;
  periodLabel: string;
  filterLabel?: string;
  statusLine: string;
  referencePrefix: string;
  stats?: ReportStatCard[];
  columns: string[];
  rows: ReportPdfRow[] | string[][];
  alignRightFromColumn?: number;
  footerTotals?: ReportPreviewFooterTotal[];
  emptyMessage?: string;
  rowCountLabel?: string;
  infoSubtitle?: string;
  onExportExcel?: () => void;
};

const EMPTY_STATS: ReportStatCard[] = [];
const EMPTY_FOOTER_TOTALS: ReportPreviewFooterTotal[] = [];

function buildIncludedStats(count: number): Record<number, boolean> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [index, true]));
}

function normalizeRows(rows: ReportPdfRow[] | string[][]): string[][] {
  if (rows.length === 0) return [];
  if (Array.isArray(rows[0])) return rows as string[][];
  return (rows as ReportPdfRow[]).map((row) =>
    row.cells.map((cell) => (cell == null || cell === '' ? '—' : String(cell))),
  );
}

function isBadgeColumn(column: string) {
  return column.trim().toLowerCase() === 'category';
}

export default function AdminReportPreviewSheet({
  open,
  onClose,
  docTitle,
  reportTitle,
  reportDescription,
  scopeLabel,
  periodLabel,
  filterLabel,
  statusLine,
  referencePrefix,
  stats = EMPTY_STATS,
  columns,
  rows,
  alignRightFromColumn = 2,
  footerTotals = EMPTY_FOOTER_TOTALS,
  emptyMessage = 'No data for the selected filters.',
  onExportExcel,
}: AdminReportPreviewSheetProps) {
  const matrixRows = useMemo(() => normalizeRows(rows), [rows]);
  const [reference, setReference] = useState(`${referencePrefix}-PREVIEW`);
  const [previewDateLabel, setPreviewDateLabel] = useState(() => formatReportPreviewDateLabel());

  const [includedStats, setIncludedStats] = useState<Record<number, boolean>>({});
  const wasOpenRef = useRef(false);
  const badgeColumnIndexes = useMemo(
    () => columns.flatMap((column, index) => (isBadgeColumn(column) ? [index] : [])),
    [columns],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (justOpened) {
      setReference(`${referencePrefix}-${Date.now()}`);
      setPreviewDateLabel(formatReportPreviewDateLabel());
      setIncludedStats(buildIncludedStats(stats.length));
      return;
    }

    setIncludedStats((prev) => {
      if (stats.length !== Object.keys(prev).length) {
        return buildIncludedStats(stats.length);
      }
      return prev;
    });
  }, [open, stats.length, referencePrefix]);

  const visibleStats = stats.filter((_, index) => includedStats[index] !== false);
  const visibleStatCount = visibleStats.length;
  const labelColSpan = Math.max(columns.length - footerTotals.length, 1);
  const hasExportExcel = typeof onExportExcel === 'function';
  const metaFields = useMemo(
    () =>
      buildReportPreviewMetaFields({
        scopeLabel,
        dateLabel: previewDateLabel,
        reference,
        periodLabel,
        filterLabel,
      }),
    [scopeLabel, previewDateLabel, reference, periodLabel, filterLabel],
  );

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', `${reportTitle} Print`);
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      return;
    }

    doc.open();
    doc.write(
      buildReportPreviewPrintHtml({
        docTitle,
        reportTitle,
        reportDescription,
        scopeLabel,
        periodLabel,
        filterLabel,
        statusLine,
        reference,
        dateLabel: previewDateLabel,
        stats: stats.filter((_, index) => includedStats[index] !== false),
        columns,
        rows: matrixRows,
        alignRightFromColumn,
        footerTotals,
        badgeColumnIndexes,
        logoSrc: `${window.location.origin}/brand/logo.avif`,
      }),
    );
    doc.close();

    const cleanup = () => {
      iframe.remove();
      win.removeEventListener('afterprint', cleanup);
      window.removeEventListener('afterprint', cleanup);
    };
    win.addEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);

    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
      window.setTimeout(cleanup, 1500);
    };

    const imgs = Array.from(doc.images);
    if (imgs.length === 0) {
      requestAnimationFrame(() => requestAnimationFrame(triggerPrint));
      return;
    }
    let remaining = imgs.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) triggerPrint();
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener('load', done);
        img.addEventListener('error', done);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-[min(72rem,92vw)] p-0 gap-0 bg-[#f4f6f8] text-slate-900 overflow-hidden flex flex-col h-full data-[side=right]:w-[min(72rem,92vw)] data-[side=right]:max-w-[min(72rem,92vw)]"
      >
        <SheetHeader className="admin-report-preview-no-print border-b border-slate-200 bg-white px-5 py-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-semibold text-[#0f172a]">Report Preview</SheetTitle>
              <SheetDescription className="text-[12px] text-slate-500 mt-0.5">
                {reportTitle} · {scopeLabel} · review before printing
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                disabled={matrixRows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer size={13} /> Print
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={matrixRows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileText size={13} /> Export PDF
              </button>
              {hasExportExcel && (
                <button
                  type="button"
                  onClick={onExportExcel}
                  disabled={matrixRows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2563eb] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                >
                  <FileSpreadsheet size={13} /> Export Excel
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {stats.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Include in PDF
              </span>
              {stats.map((stat, index) => (
                <label
                  key={`${stat.label}-${index}`}
                  className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-[#2563eb] focus:ring-[#2563eb] w-3.5 h-3.5"
                    checked={includedStats[index] !== false}
                    onChange={(e) =>
                      setIncludedStats((prev) => ({ ...prev, [index]: e.target.checked }))
                    }
                  />
                  {stat.label}
                </label>
              ))}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="admin-report-preview-print m-4 sm:m-6 rounded-xl border border-slate-200 bg-white shadow-[0_1px_8px_rgba(15,23,42,0.06)] overflow-hidden">
            <header className="flex items-start justify-between gap-6 px-7 pt-7 pb-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-11 w-11 shrink-0">
                  <Image src="/brand/logo.avif" alt="Bing Chun" fill sizes="44px" className="object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-[#0f172a] tracking-tight">Bing Chun Delivery</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Sri Lanka</p>
                </div>
              </div>
              <div className="text-right shrink-0 max-w-[22rem]">
                <p className="text-[20px] font-semibold leading-tight text-[#0f172a]">{reportTitle}</p>
                <p className="text-[12px] font-semibold text-[#0f172a] mt-1.5">Period: {periodLabel}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{reportDescription}</p>
              </div>
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-5 border-y border-slate-200">
              {metaFields.map((item, index) => (
                <div
                  key={item.label}
                  className={`px-5 py-3.5 ${index % 2 === 1 ? 'border-l border-slate-200' : ''} ${
                    index > 0 ? 'sm:border-l sm:border-slate-200' : ''
                  }`}
                >
                  <p className="text-[10px] font-medium text-slate-400">{item.label}</p>
                  <p className="text-[12px] font-semibold text-[#0f172a] mt-1 break-words">{item.value}</p>
                </div>
              ))}
            </div>

            {visibleStatCount > 0 && (
              <div
                className={`grid grid-cols-2 mt-3 bg-[#f8fafc] border-y border-slate-200 ${
                  visibleStatCount === 1
                    ? 'sm:grid-cols-1'
                    : visibleStatCount === 2
                      ? 'sm:grid-cols-2'
                      : visibleStatCount === 3
                        ? 'sm:grid-cols-3'
                        : visibleStatCount >= 5
                          ? 'sm:grid-cols-5'
                          : 'sm:grid-cols-4'
                }`}
              >
                {visibleStats.map((stat, index) => (
                  <div
                    key={`${stat.label}-${index}`}
                    className={`px-5 py-4 text-center ${
                      index % 2 === 1 ? 'border-l border-slate-200' : ''
                    } ${index > 0 ? 'sm:border-l sm:border-slate-200' : ''}`}
                  >
                    <p className="text-[18px] font-semibold text-[#0f172a] tracking-tight">{stat.value}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="px-0">
              {matrixRows.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">{emptyMessage}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-[11px]">
                    <thead>
                      <tr style={{ background: '#1e293b' }}>
                        {columns.map((col, index) => (
                          <th
                            key={`${col}-${index}`}
                            className={`px-3.5 py-2.5 font-semibold ${
                              index >= alignRightFromColumn ? 'text-right' : 'text-left'
                            }`}
                            style={{ color: '#ffffff', background: '#1e293b' }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="bg-white border-b border-slate-200">
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className={`px-3.5 py-2.5 text-slate-800 ${
                                cellIndex >= alignRightFromColumn ? 'text-right whitespace-nowrap' : ''
                              }`}
                            >
                              {badgeColumnIndexes.includes(cellIndex) && cell !== '—' ? (
                                <span className="inline-flex items-center rounded-full bg-[#eef4fb] px-2 py-0.5 text-[10px] font-medium text-[#334e68]">
                                  {cell}
                                </span>
                              ) : (
                                cell
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {footerTotals.length > 0 && (
                      <tfoot>
                        <tr className="bg-white">
                          <td
                            colSpan={labelColSpan}
                            className="px-3.5 py-2.5 border-t border-slate-300 text-[11px] font-bold text-[#0f172a]"
                          >
                            Total
                          </td>
                          {footerTotals.map((total) => (
                            <td
                              key={total.label}
                              className="px-3.5 py-2.5 border-t border-slate-300 text-right text-[11px] font-bold text-[#0f172a] whitespace-nowrap"
                            >
                              {total.prefix ? `${total.prefix} ` : ''}
                              {total.value}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            <footer className="px-7 pt-6 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pb-5">
                <div>
                  <p className="text-[12px] font-semibold text-[#0f172a] mb-3">Report Information</p>
                  <dl className="space-y-1.5 text-[11px]">
                    {[
                      { label: 'Report Type', value: reportTitle },
                      { label: 'Generated On', value: previewDateLabel },
                      { label: 'Period', value: periodLabel },
                      { label: 'Filters', value: filterLabel || '—' },
                    ].map((item) => (
                      <div key={item.label} className="grid grid-cols-[7.25rem_1fr] gap-2">
                        <dt className="text-slate-500">{item.label}</dt>
                        <dd className="text-slate-800">
                          <span className="text-slate-400 mr-2">:</span>
                          {item.value}
                        </dd>
                      </div>
                    ))}
                    <div className="grid grid-cols-[7.25rem_1fr] gap-2">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-slate-800">
                        <span className="text-slate-400 mr-2">:</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />
                          {statusLine}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-semibold text-[#0f172a] mb-3">Contact Information</p>
                    <ul className="space-y-2 text-[11px] text-slate-600">
                      <li className="flex items-start gap-2">
                        <MapPin size={13} className="mt-0.5 text-slate-400 shrink-0" />
                        <span>
                          Bing Chun Delivery
                          <br />
                          Head Office – Sri Lanka
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Mail size={13} className="text-slate-400 shrink-0" />
                        support@bingchun.lk
                      </li>
                      <li className="flex items-center gap-2">
                        <Globe size={13} className="text-slate-400 shrink-0" />
                        www.bingchun.lk
                      </li>
                    </ul>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="relative h-12 w-12 ml-auto">
                      <Image src="/brand/logo.avif" alt="Bing Chun" fill sizes="48px" className="object-contain" />
                    </div>
                    <p className="text-[11px] font-semibold text-[#0f172a] mt-1.5">Bingchun</p>
                    <p className="text-[8px] tracking-[0.12em] uppercase text-slate-400 mt-0.5">
                      Good drinks · brighter days
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
                <p>This is a system generated report.</p>
                <p>Page 1 of 1</p>
              </div>
            </footer>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
