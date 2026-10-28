'use client';

import { useEffect, useState } from 'react';
import ReceiptBrandHeader from '@/components/admin/ReceiptBrandHeader';

export type ReportStatCard = {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'teal' | 'blue' | 'yellow' | 'purple' | 'brand';
};

export type ReportPdfRow = {
  key?: string;
  cells: React.ReactNode[];
};

export type ReportPdfTotal = {
  label: string;
  value: string;
  prefix?: string;
  tone?: 'green' | 'red' | 'blue' | 'neutral';
};

export type ReportPdfSection = {
  title: string;
  columns: string[];
  rows: ReportPdfRow[];
  alignRightFromColumn?: number;
  emptyMessage?: string;
};

type Props = {
  reportTitle: string;
  reference?: string;
  generatedAt?: string;
  filterLabel?: string;
  periodLabel?: string;
  showPeriod?: boolean;
  showStats?: boolean;
  showTable?: boolean;
  stats?: ReportStatCard[];
  tableTitle?: string;
  columns?: string[];
  rows?: ReportPdfRow[];
  alignRightFromColumn?: number;
  totals?: ReportPdfTotal[];
  sections?: ReportPdfSection[];
  footer?: string;
};

function ReportPdfTable({
  columns,
  rows,
  alignRightFromColumn,
  emptyMessage = 'No records for this scope.',
}: {
  columns: string[];
  rows: ReportPdfRow[];
  alignRightFromColumn: number;
  emptyMessage?: string;
}) {
  return (
    <div className="admin-report-pdf__table-wrap">
      <table className="admin-report-pdf__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="admin-report-pdf__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.key ?? i}>
                {row.cells.map((cell, ci) => (
                  <td
                    key={ci}
                    style={ci >= alignRightFromColumn ? { textAlign: 'right' } : undefined}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function formatReportGeneratedAt(iso?: string | Date) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function pdfToneColor(tone?: 'green' | 'red' | 'blue' | 'neutral') {
  switch (tone) {
    case 'green': return '#047857';
    case 'red': return '#9f1239';
    case 'blue': return '#1e3a8a';
    default: return '#0f172a';
  }
}

export default function AdminReportPdf({
  reportTitle,
  reference,
  generatedAt,
  filterLabel,
  periodLabel,
  showPeriod = true,
  showStats = true,
  showTable = true,
  stats = [],
  tableTitle,
  columns = [],
  rows = [],
  alignRightFromColumn = 2,
  totals = [],
  sections = [],
  footer = 'Bing Chun Admin · bingchun.lk',
}: Props) {
  const [generated, setGenerated] = useState(generatedAt ?? '');

  useEffect(() => {
    setGenerated(generatedAt ?? formatReportGeneratedAt());
  }, [generatedAt]);

  useEffect(() => {
    const refresh = () => {
      if (!generatedAt) setGenerated(formatReportGeneratedAt());
    };
    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, [generatedAt]);

  return (
    <article className="admin-report-pdf order-receipt admin-print-report__doc">
      <ReceiptBrandHeader badgeTitle="REPORT" badgeSub="Official Report" />

      <div className="order-receipt__summary admin-report-pdf__summary">
        <div>
          <p className="order-receipt__label">Report</p>
          <p className="order-receipt__number admin-report-pdf__report-name">{reportTitle}</p>
          <p className="order-receipt__date">Generated {generated}</p>
          {showPeriod && periodLabel && (
            <p className="order-receipt__period">{periodLabel}</p>
          )}
        </div>
        {reference && (
          <div className="order-receipt__meta-inline">
            <span>Ref: {reference}</span>
          </div>
        )}
      </div>

      {showPeriod && filterLabel && (
        <div className="admin-report-pdf__bars">
          <div className="admin-report-pdf__bar">
            <span className="admin-report-pdf__bar-label">Filters:</span> {filterLabel}
          </div>
        </div>
      )}

      {showStats && stats.length > 0 && (
        <div className="admin-report-pdf__stats">
          {stats.map((card) => (
            <div
              key={card.label}
              className={`admin-report-pdf__stat admin-report-pdf__stat--${card.tone ?? 'blue'}`}
            >
              <p className="admin-report-pdf__stat-label">{card.label}</p>
              <p className="admin-report-pdf__stat-value">{card.value}</p>
              {card.sub && <p className="admin-report-pdf__stat-sub">{card.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {showTable && columns.length > 0 && (
        <>
          {tableTitle ? <h3 className="admin-report-pdf__section-title">{tableTitle}</h3> : null}
          <div className="admin-report-pdf__table-wrap">
            <table className="admin-report-pdf__table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="admin-report-pdf__empty">
                      No records for this scope.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={row.key ?? i}>
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          style={ci >= alignRightFromColumn ? { textAlign: 'right' } : undefined}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              {totals.length > 0 && rows.length > 0 && (
                <tfoot style={{ display: 'table-row-group' }}>
                  <tr>
                    {columns.length > totals.length && (
                      <td colSpan={columns.length - totals.length} style={{ borderTop: '3px solid #1e3a8a' }} />
                    )}
                    {totals.map((t) => (
                      <td
                        key={t.label}
                        style={{
                          textAlign: 'right',
                          borderTop: '3px solid #1e3a8a',
                          padding: '10px 8px 8px',
                          color: pdfToneColor(t.tone),
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: '9px', color: '#475569', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t.label}
                        </span>
                        {t.prefix && <span style={{ fontSize: '9px', color: '#64748b', marginRight: 2 }}>{t.prefix}</span>}
                        {t.value}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {showTable &&
        sections.map((section) => (
          <section key={section.title} className="admin-report-pdf__section">
            <h3 className="admin-report-pdf__section-title">{section.title}</h3>
            <ReportPdfTable
              columns={section.columns}
              rows={section.rows}
              alignRightFromColumn={section.alignRightFromColumn ?? 2}
              emptyMessage={section.emptyMessage}
            />
          </section>
        ))}

      <footer className="admin-report-pdf__footer">
        <p>{footer}</p>
      </footer>
    </article>
  );
}
