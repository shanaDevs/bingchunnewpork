import type { ReportStatCard } from '@/components/admin/AdminReportPdf';

export type ReportPreviewFooterTotal = {
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'rose' | 'slate' | 'neutral';
  prefix?: string;
};

export type ReportPreviewMetaField = {
  label: string;
  value: string;
};

export function formatReportPreviewDateLabel(date: Date = new Date()) {
  return date.toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function buildReportPreviewMetaFields(args: {
  scopeLabel: string;
  dateLabel: string;
  reference: string;
  periodLabel: string;
  filterLabel?: string;
}): ReportPreviewMetaField[] {
  return [
    { label: 'Report For', value: args.scopeLabel },
    { label: 'Report Date', value: args.dateLabel },
    { label: 'Report No.', value: args.reference },
    { label: 'Statement Period', value: args.periodLabel },
    { label: 'Filters', value: args.filterLabel || '—' },
  ];
}

type PrintArgs = {
  docTitle: string;
  reportTitle: string;
  reportDescription: string;
  scopeLabel: string;
  periodLabel: string;
  filterLabel?: string;
  statusLine: string;
  reference: string;
  dateLabel: string;
  stats: ReportStatCard[];
  columns: string[];
  rows: string[][];
  alignRightFromColumn: number;
  footerTotals: ReportPreviewFooterTotal[];
  badgeColumnIndexes?: number[];
  logoSrc: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReportPreviewPrintHtml({
  reportTitle,
  reportDescription,
  scopeLabel,
  periodLabel,
  filterLabel,
  statusLine,
  reference,
  dateLabel,
  stats,
  columns,
  rows,
  alignRightFromColumn,
  footerTotals,
  badgeColumnIndexes = [],
  logoSrc,
}: PrintArgs) {
  const badgeSet = new Set(badgeColumnIndexes);
  const statsHtml = stats
    .map(
      (stat, index) =>
        `<div class="stat${index > 0 ? ' stat-divider' : ''}">
          <p class="stat-value">${escapeHtml(stat.value)}</p>
          <p class="stat-label">${escapeHtml(stat.label)}</p>
        </div>`,
    )
    .join('');

  const metaItems = buildReportPreviewMetaFields({
    scopeLabel,
    dateLabel,
    reference,
    periodLabel,
    filterLabel,
  });
  const metaHtml = metaItems
    .map(
      (item, index) =>
        `<div class="meta-cell${index > 0 ? ' meta-divider' : ''}">
          <p class="meta-label">${escapeHtml(item.label)}</p>
          <p class="meta-value">${escapeHtml(item.value)}</p>
        </div>`,
    )
    .join('');

  const headerCells = columns
    .map(
      (col, index) =>
        `<th class="${index >= alignRightFromColumn ? 'num' : ''}">${escapeHtml(col)}</th>`,
    )
    .join('');

  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, cellIndex) => {
            const numClass = cellIndex >= alignRightFromColumn ? 'num' : '';
            if (badgeSet.has(cellIndex) && cell !== '—') {
              return `<td class="${numClass}"><span class="pill">${escapeHtml(cell)}</span></td>`;
            }
            return `<td class="${numClass}">${escapeHtml(cell)}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');

  const labelColSpan = Math.max(columns.length - footerTotals.length, 1);
  const footerHtml =
    footerTotals.length > 0
      ? `<tfoot><tr>
          <td colspan="${labelColSpan}" class="total-label">Total</td>
          ${footerTotals
            .map((total) => {
              const prefix = total.prefix ? `${escapeHtml(total.prefix)} ` : '';
              return `<td class="num total-value">${prefix}${escapeHtml(total.value)}</td>`;
            })
            .join('')}
        </tr></tfoot>`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; font-family: Helvetica, Arial, sans-serif; }
    .print-root { width: 100%; background: #fff; }
    .letterhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; padding: 1.35rem 1.5rem 1rem; }
    .brand-row { display: flex; align-items: center; gap: 0.7rem; }
    .brand-row img { width: 42px; height: 42px; object-fit: contain; }
    .brand-name { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
    .brand-loc { margin: 0.15rem 0 0; font-size: 9px; color: #64748b; }
    .doc-title-block { text-align: right; max-width: 22rem; }
    .doc-title { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.2; }
    .doc-period { margin: 0.4rem 0 0; font-size: 10.5px; font-weight: 700; color: #0f172a; }
    .doc-desc { margin: 0.3rem 0 0; font-size: 9.5px; color: #64748b; line-height: 1.45; }
    .meta-row { display: flex; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
    .meta-cell { flex: 1; padding: 0.7rem 0.85rem; min-width: 0; }
    .meta-divider { border-left: 1px solid #e2e8f0; }
    .meta-label { margin: 0; font-size: 8px; color: #94a3b8; }
    .meta-value { margin: 0.3rem 0 0; font-size: 10px; font-weight: 700; color: #0f172a; word-break: break-word; }
    .stats { display: flex; margin-top: 0.75rem; background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
    .stat { flex: 1; text-align: center; padding: 0.8rem 0.5rem; }
    .stat-divider { border-left: 1px solid #e2e8f0; }
    .stat-value { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
    .stat-label { margin: 0.25rem 0 0; font-size: 8.5px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    th { background: #1e293b; color: #fff; font-weight: 700; padding: 0.55rem 0.7rem; text-align: left; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    td { padding: 0.45rem 0.7rem; border-bottom: 1px solid #e2e8f0; color: #0f172a; vertical-align: middle; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .pill { display: inline-block; background: #eef4fb; color: #334e68; border-radius: 999px; padding: 0.1rem 0.45rem; font-size: 8.5px; font-weight: 600; }
    tfoot td { border-top: 1px solid #cbd5e1; border-bottom: 0; background: #fff; }
    .total-label, .total-value { font-weight: 700; color: #0f172a; }
    footer.report-footer { padding: 1rem 1.5rem 0.75rem; }
    .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding-bottom: 0.85rem; }
    .footer-h { margin: 0 0 0.55rem; font-size: 10.5px; font-weight: 700; color: #0f172a; }
    .info-row { display: grid; grid-template-columns: 6.4rem 1fr; gap: 0.35rem; margin: 0 0 0.28rem; font-size: 9px; }
    .info-k { color: #64748b; }
    .info-v { color: #0f172a; }
    .info-colon { color: #94a3b8; margin-right: 0.35rem; }
    .status-dot { display: inline-block; width: 5px; height: 5px; border-radius: 999px; background: #2563eb; margin-right: 0.3rem; vertical-align: middle; }
    .contact-wrap { display: flex; justify-content: space-between; gap: 1rem; }
    .contact-line { margin: 0 0 0.35rem; font-size: 9px; color: #475569; display: flex; align-items: flex-start; gap: 0.35rem; }
    .contact-ico { width: 10px; height: 10px; margin-top: 1px; flex-shrink: 0; }
    .contact-brand { text-align: right; }
    .contact-brand img { width: 40px; height: 40px; object-fit: contain; }
    .contact-wordmark { margin: 0.3rem 0 0; font-size: 10px; font-weight: 700; color: #0f172a; }
    .contact-tag { margin: 0.15rem 0 0; font-size: 7px; letter-spacing: 0.12em; text-transform: uppercase; color: #94a3b8; }
    .page-bar { display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 0.5rem; font-size: 8px; color: #94a3b8; }
  </style>
</head>
<body>
  <article class="print-root">
    <header class="letterhead">
      <div class="brand-row">
        <img src="${logoSrc}" alt="Bing Chun" />
        <div>
          <p class="brand-name">Bing Chun Delivery</p>
          <p class="brand-loc">Sri Lanka</p>
        </div>
      </div>
      <div class="doc-title-block">
        <p class="doc-title">${escapeHtml(reportTitle)}</p>
        <p class="doc-period">Period: ${escapeHtml(periodLabel)}</p>
        <p class="doc-desc">${escapeHtml(reportDescription)}</p>
      </div>
    </header>
    <div class="meta-row">${metaHtml}</div>
    ${stats.length > 0 ? `<div class="stats">${statsHtml}</div>` : ''}
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${columns.length}" style="text-align:center;padding:2rem;color:#64748b;">No data</td></tr>`}</tbody>
      ${footerHtml}
    </table>
    <footer class="report-footer">
      <div class="footer-grid">
        <div>
          <p class="footer-h">Report Information</p>
          <div class="info-row"><span class="info-k">Report Type</span><span class="info-v"><span class="info-colon">:</span>${escapeHtml(reportTitle)}</span></div>
          <div class="info-row"><span class="info-k">Generated On</span><span class="info-v"><span class="info-colon">:</span>${escapeHtml(dateLabel)}</span></div>
          <div class="info-row"><span class="info-k">Period</span><span class="info-v"><span class="info-colon">:</span>${escapeHtml(periodLabel)}</span></div>
          <div class="info-row"><span class="info-k">Filters</span><span class="info-v"><span class="info-colon">:</span>${escapeHtml(filterLabel || '—')}</span></div>
          <div class="info-row"><span class="info-k">Status</span><span class="info-v"><span class="info-colon">:</span><span class="status-dot"></span>${escapeHtml(statusLine)}</span></div>
        </div>
        <div class="contact-wrap">
          <div>
            <p class="footer-h">Contact Information</p>
            <p class="contact-line">
              <svg class="contact-ico" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>
              <span>Bing Chun Delivery<br/>Head Office – Sri Lanka</span>
            </p>
            <p class="contact-line">
              <svg class="contact-ico" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              support@bingchun.lk
            </p>
            <p class="contact-line">
              <svg class="contact-ico" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
              www.bingchun.lk
            </p>
          </div>
          <div class="contact-brand">
            <img src="${logoSrc}" alt="Bing Chun" />
            <p class="contact-wordmark">Bingchun</p>
            <p class="contact-tag">Good drinks · brighter days</p>
          </div>
        </div>
      </div>
      <div class="page-bar">
        <span>This is a system generated report.</span>
        <span>Page 1 of 1</span>
      </div>
    </footer>
  </article>
</body>
</html>`;
}
