import {
  contributionSourceLabel,
  type BranchShareSplit,
  type ContributionSource,
} from '@/lib/promotionCriteria';

export type PromotionContributionRow = {
  branchLabel: string;
  split: BranchShareSplit;
};

export type PromotionContributionPrintArgs = {
  promotionTitle: string;
  promotionCode: string;
  contributionSource: ContributionSource;
  branchScope: 'all' | 'selected';
  rows: PromotionContributionRow[];
  reference: string;
  dateLabel: string;
  logoSrc: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contributionPartiesLabel(source: ContributionSource): string {
  return source === 'JASON' ? 'Branch + Jason' : 'Branch + Platform';
}

function branchScopeLabel(scope: 'all' | 'selected'): string {
  return scope === 'all' ? 'All branches' : 'Selected branches';
}

export function buildPromotionContributionReference(promotionCode: string): string {
  const code = promotionCode.trim();
  if (code) return code;
  return `DRAFT-${Date.now()}`;
}

export function buildPromotionContributionPrintHtml({
  promotionTitle,
  promotionCode,
  contributionSource,
  branchScope,
  rows,
  reference,
  dateLabel,
  logoSrc,
}: PromotionContributionPrintArgs): string {
  const secondParty = contributionSourceLabel(contributionSource);
  const displayTitle = promotionTitle.trim() || 'Untitled promotion';
  const displayCode = promotionCode.trim() || '—';

  const bodyRows = rows
    .map((row, rowIndex) => `<tr class="${rowIndex % 2 === 1 ? 'row-alt' : ''}">
        <td class="col-branch">${escapeHtml(row.branchLabel)}</td>
        <td class="num col-pct">${row.split.branchSharePct}%</td>
        <td class="num col-pct">${row.split.platformSharePct}%</td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Branch Contribution Report</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #faf9f6; color: #0f172a; font-family: Helvetica, Arial, sans-serif; }
    .print-root { width: 100%; background: #faf9f6; position: relative; padding-top: 3px; }
    .print-root::before { content: ''; position: absolute; left: 0; top: 0; right: 0; height: 3px; background: #307ef2; }
    .letterhead { display: flex; justify-content: space-between; gap: 1.5rem; padding: 1.35rem 1.5rem 0.75rem; }
    .brand-row { display: flex; align-items: center; gap: 0.75rem; }
    .brand-row img { width: 42px; height: 42px; object-fit: contain; }
    .brand-name { margin: 0; font-size: 14px; font-weight: 700; color: #0f1428; }
    .brand-loc { margin: 0.15rem 0 0; font-size: 8.5px; color: #64748b; letter-spacing: 0.04em; }
    .doc-title-block { text-align: right; min-width: 12rem; }
    .doc-title { margin: 0; font-family: "Times New Roman", Times, serif; font-size: 28px; font-weight: 400; color: #0f1428; line-height: 1.1; }
    .doc-meta-line { margin: 0.35rem 0 0; font-size: 9px; color: #64748b; }
    .scope { padding: 0.35rem 1.5rem 1rem; }
    .scope-label { margin: 0; font-size: 7.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
    .scope-line { margin: 0.35rem 0 0; font-size: 10px; color: #1e293b; }
    .scope-status { margin: 0.45rem 0 0; font-size: 9px; font-weight: 700; color: #307ef2; }
    .rule { height: 0; border: 0; border-top: 1px solid #a1a1aa; margin: 0 1.5rem 1rem; }
    .table-wrap { margin: 0 1.5rem 1rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; overflow: visible; background: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
    thead { display: table-header-group; }
    th { background: #1e293b; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.6rem 0.75rem; text-align: left; }
    th.col-branch, td.col-branch { width: 52%; text-align: left; word-wrap: break-word; }
    th.col-pct, td.col-pct { width: 24%; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #0f172a; vertical-align: top; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .row-alt { background: #f8fafc; }
    footer.report-footer { margin: 0.5rem 1.5rem 0; padding: 0.9rem 0 1.1rem; border-top: 1px solid #d4d4d8; position: relative; }
    footer.report-footer::after { content: ''; position: absolute; left: -1.5rem; right: -1.5rem; bottom: 0; height: 3px; background: #307ef2; }
    .footer-auto { margin: 0.85rem 0 0; font-size: 8.5px; font-style: italic; color: #94a3b8; }
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
        <p class="doc-title">Branch Contribution Report</p>
        <p class="doc-meta-line">Date  ${escapeHtml(dateLabel)}</p>
        <p class="doc-meta-line">Reference  ${escapeHtml(reference)}</p>
      </div>
    </header>
    <div class="scope">
      <p class="scope-label">Promotion</p>
      <p class="scope-line"><strong>${escapeHtml(displayTitle)}</strong></p>
      <p class="scope-line">Promo code  ${escapeHtml(displayCode)}</p>
      <p class="scope-line">Ownership  Shared Promotion</p>
      <p class="scope-line">Contribution parties  ${escapeHtml(contributionPartiesLabel(contributionSource))}</p>
      <p class="scope-line">Branch availability  ${escapeHtml(branchScopeLabel(branchScope))}</p>
      <p class="scope-status">Cost sharing by branch</p>
    </div>
    <hr class="rule" />
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-branch">Branch</th>
            <th class="num col-pct">Branch %</th>
            <th class="num col-pct">${escapeHtml(secondParty)} %</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || '<tr><td colspan="3" style="text-align:center;padding:2rem;color:#64748b;">No branches</td></tr>'}
        </tbody>
      </table>
    </div>
    <footer class="report-footer">
      <p class="footer-auto">This is a system generated document.</p>
    </footer>
  </article>
</body>
</html>`;
}

export function printPromotionContribution(args: Omit<PromotionContributionPrintArgs, 'logoSrc'> & { logoSrc?: string }) {
  if (typeof window === 'undefined') return;

  const logoSrc = args.logoSrc ?? `${window.location.origin}/brand/logo.avif`;
  const html = buildPromotionContributionPrintHtml({ ...args, logoSrc });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Branch Contribution Report Print');
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
  doc.write(html);
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
}
