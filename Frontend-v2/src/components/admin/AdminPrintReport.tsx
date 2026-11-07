'use client';

import ReceiptBrandHeader from '@/components/admin/ReceiptBrandHeader';

export type PrintReportRow = {
  cells: React.ReactNode[];
  key?: string;
};

export type PrintReportTotal = {
  label: string;
  value: string;
  grand?: boolean;
  discount?: boolean;
};

type Props = {
  title: string;
  reference: string;
  dateLabel?: string;
  periodLabel?: string;
  /** Short stat lines shown under the header (tick-selected in filters) */
  summaryStats?: { label: string; value: string }[];
  columns: string[];
  rows: PrintReportRow[];
  totals?: PrintReportTotal[];
  footer?: string;
  alignRightFromColumn?: number;
};

export function formatPrintCents(cents: number) {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export function formatPrintMoney(amount: number) {
  return `LKR ${amount.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatPrintMoneyNoSymbol(amount: number) {
  return amount.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatPrintDate(iso?: string | Date) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-LK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminPrintReport({
  title,
  reference,
  dateLabel,
  periodLabel,
  summaryStats = [],
  columns,
  rows,
  totals = [],
  footer = 'Bing Chun Admin Report · bingchun.lk',
  alignRightFromColumn = 1,
}: Props) {
  return (
    <article className="order-receipt admin-print-report__doc">
      <ReceiptBrandHeader />

      <div className="order-receipt__summary">
        <div>
          <p className="order-receipt__label">Report</p>
          <p className="order-receipt__number">{title}</p>
          <p className="order-receipt__date">{dateLabel ?? formatPrintDate()}</p>
          {periodLabel && <p className="order-receipt__period">{periodLabel}</p>}
        </div>
        <div className="order-receipt__meta-inline">
          <span>Ref: {reference}</span>
        </div>
      </div>

      {summaryStats.length > 0 && (
        <div className="order-receipt__details order-receipt__stats">
          {summaryStats.map((s) => (
            <p key={s.label}>
              <strong>{s.label}:</strong> {s.value}
            </p>
          ))}
        </div>
      )}

      <table className="order-receipt__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key ?? i}>
              {row.cells.map((cell, ci) => (
                <td
                  key={ci}
                  style={ci >= alignRightFromColumn ? { textAlign: 'right', whiteSpace: 'nowrap' } : undefined}
                >
                  {typeof cell === 'string' || typeof cell === 'number' ? (
                    ci === 0 ? <span className="order-receipt__item-name">{cell}</span> : cell
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {totals.length > 0 && (
        <div className="order-receipt__totals">
          {totals.map((row) => (
            <div
              key={row.label}
              className={`order-receipt__total-row${row.grand ? ' order-receipt__total-row--grand' : ''}${row.discount ? ' order-receipt__total-row--discount' : ''}`}
            >
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="order-receipt__footer">
        <p>{footer}</p>
      </footer>
    </article>
  );
}
