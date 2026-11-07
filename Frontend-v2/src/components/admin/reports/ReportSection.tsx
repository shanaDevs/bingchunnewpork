'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import AdminPrintCanvas, { printScopedAdminReport } from '@/components/admin/AdminPrintCanvas';
import AdminReportPdf, { type ReportPdfRow, type ReportPdfTotal, type ReportStatCard } from '@/components/admin/AdminReportPdf';
import ReportOptionsBar, { type ReportOption } from '@/components/admin/ReportOptionsBar';
import { buildPageList } from '@/lib/pagination';

export const REPORT_PAGE_SIZE = 10;

type Props = {
  id: string;
  title: string;
  description: string;
  controls?: ReactNode;
  columnOptions?: ReportOption[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (key: string) => void;
  onExportCsv?: () => void;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  pdfTitle: string;
  pdfReference: string;
  pdfPeriodLabel?: string;
  pdfFilterLabel?: string;
  pdfStats?: ReportStatCard[];
  pdfColumns: string[];
  pdfRows: ReportPdfRow[];
  pdfTotals?: ReportPdfTotal[];
  alignRightFromColumn?: number;
  /** When provided, PDF button opens a custom preview instead of printing immediately */
  onPdfClick?: () => void;
  /** Disables PDF and CSV export actions (e.g. when required filters are missing). */
  disableActions?: boolean;
};

export default function ReportSection({
  id,
  title,
  description,
  controls,
  columnOptions = [],
  visibleColumns,
  onToggleColumn,
  onExportCsv,
  loading,
  empty,
  emptyMessage = 'No data for the selected filters.',
  children,
  pdfTitle,
  pdfReference,
  pdfPeriodLabel,
  pdfFilterLabel,
  pdfStats = [],
  pdfColumns,
  pdfRows,
  pdfTotals = [],
  alignRightFromColumn = 2,
  onPdfClick,
  disableActions = false,
}: Props) {
  const [open, setOpen] = useState(true);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Custom PDF preview (e.g. sheet) replaces the default print canvas — avoid printing both.
  const printNode = onPdfClick ? null : (
    <AdminPrintCanvas variant="full" reportId={id}>
      <AdminReportPdf
        reportTitle={pdfTitle}
        reference={pdfReference}
        filterLabel={pdfFilterLabel}
        periodLabel={pdfPeriodLabel}
        showPeriod={!!pdfPeriodLabel}
        showStats={pdfStats.length > 0}
        showTable
        stats={pdfStats}
        columns={pdfColumns}
        rows={pdfRows}
        alignRightFromColumn={alignRightFromColumn}
        totals={pdfTotals}
      />
    </AdminPrintCanvas>
  );

  return (
    <section className="card overflow-hidden mb-6 min-w-0 max-w-full">
      <div className="no-print p-4 sm:p-5 border-b border-navy-border flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className="text-left flex-1 min-w-0 sm:min-w-[220px]"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <ChevronDown
              size={18}
              className={`text-muted shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
            />
            <h3 className="font-semibold text-fg text-base break-words">{title}</h3>
          </div>
          <p className="text-muted text-xs mt-1 ml-6">{description}</p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => (onPdfClick ? onPdfClick() : printScopedAdminReport(id, 'full'))}
            disabled={disableActions}
            className="btn-outline px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Printer size={13} /> PDF
          </button>
          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              disabled={disableActions}
              className="btn-primary px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Download size={13} /> CSV
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="no-print min-w-0">
          {controls && (
            <div className="p-3 sm:p-4 border-b border-navy-border space-y-3 min-w-0 overflow-x-auto">
              {controls}
            </div>
          )}

          {columnOptions.length > 0 && (
            <div className="px-3 sm:px-4 py-3 min-w-0 bg-navy-light/30 border-b border-navy-border">
              <ReportOptionsBar
                options={columnOptions}
                values={visibleColumns}
                onChange={onToggleColumn}
              />
            </div>
          )}

          <div className="p-3 sm:p-4 min-w-0">
            {loading ? (
              <p className="text-muted text-sm py-8 text-center">Loading report…</p>
            ) : empty ? (
              <p className="text-muted text-sm py-8 text-center">{emptyMessage}</p>
            ) : (
              children
            )}
          </div>
        </div>
      )}

      {/* Portal to body so print content is never clipped by overflow/no-print ancestors */}
      {portalReady && printNode ? createPortal(printNode, document.body) : null}
    </section>
  );
}

export function ReportTable({
  columns,
  visibleColumns,
  children,
  footer,
}: {
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  visibleColumns: Record<string, boolean>;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const visible = columns.filter((c) => visibleColumns[c.key] !== false);
  return (
    <div className="admin-report-table-scroll min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-navy-border bg-navy-card -mx-0">
      <table className="w-full min-w-[640px] text-sm border-collapse">
        <thead>
          <tr className="bg-[#1e293b]">
            {visible.map((col) => (
              <th
                key={col.key}
                className={`px-3 sm:px-4 py-3 text-white text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-[#1e293b] ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                <span className="inline-block max-w-[9rem] sm:max-w-[12rem] leading-snug">
                  {col.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:nth-child(even)]:bg-navy-light/30 [&_tr:nth-child(odd)]:bg-navy-card [&_tr]:border-b [&_tr]:border-navy-border">
          {children}
        </tbody>
        {footer && (
          <tfoot className="border-t-[3px] border-fg bg-navy-light/40 [&_td]:px-3 [&_td]:sm:px-4 [&_td]:py-4 [&_td]:align-top [&_td]:text-fg">
            {footer}
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function ReportPagination({
  page,
  totalItems,
  pageSize = REPORT_PAGE_SIZE,
  onPageChange,
  label = 'rows',
}: {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalItems);
  const pageList = buildPageList(page, totalPages);

  if (totalItems <= pageSize) {
    return (
      <p className="admin-table-pagination__summary text-xs text-muted mt-3">
        Showing <span className="text-fg font-semibold tabular-nums">{totalItems}</span> {label}
      </p>
    );
  }

  return (
    <div className="admin-table-pagination mt-3">
      <p className="admin-table-pagination__summary text-xs text-muted">
        Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
        <span className="text-fg font-semibold tabular-nums">{totalItems}</span> {label}
      </p>
      <nav className="admin-table-pagination__nav" aria-label="Report pagination">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="admin-table-pagination__arrow"
          aria-label="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="admin-table-pagination__pages">
          {pageList.map((item, i) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${i}`} className="admin-table-pagination__ellipsis" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={`admin-table-pagination__page${item === page ? ' admin-table-pagination__page--active' : ''}`}
                aria-current={item === page ? 'page' : undefined}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="admin-table-pagination__arrow"
          aria-label="Next page"
        >
          <ChevronRight size={18} />
        </button>
      </nav>
    </div>
  );
}

/** Client-side pagination for report tables (10 rows/page). Resets to page 1 when row count changes. */
export function useReportPagination<T>(rows: T[], pageSize = REPORT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [totalItems]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return { page, setPage, pagedRows, totalItems, pageSize };
}

export function useColumnVisibility(keys: string[]) {
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => Object.fromEntries(keys.map((k) => [k, true])),
  );

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isVisible = (key: string) => visibleColumns[key] !== false;

  return { visibleColumns, toggleColumn, isVisible };
}
