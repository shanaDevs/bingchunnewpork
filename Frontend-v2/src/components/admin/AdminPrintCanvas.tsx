'use client';

type Props = {
  children: React.ReactNode;
  /** receipt = 80mm thermal; full = A4 landscape report */
  variant?: 'receipt' | 'full';
  /** Optional id used to scope multi-report print selection */
  reportId?: string;
};

/** Print canvas — hidden on screen, shown when printing */
export default function AdminPrintCanvas({ children, variant = 'receipt', reportId }: Props) {
  return (
    <div
      data-report-id={reportId}
      className={`admin-print-report${variant === 'full' ? ' admin-print-report--full' : ''}`}
    >
      <div className="admin-print-report__canvas">{children}</div>
    </div>
  );
}

function pageSizeRule(layout: 'receipt' | 'full') {
  return layout === 'full'
    ? '@page { size: A4 landscape; margin: 8mm; }'
    : '@page { size: 80mm auto; margin: 4mm; }';
}

/**
 * Print a single report when multiple `.admin-print-report` nodes exist on the page.
 * Avoids repeating the same viewport on every sheet (fixed modals / stacked canvases).
 */
export function printScopedAdminReport(
  reportId: string,
  layout: 'receipt' | 'full' = 'full',
) {
  const styleId = 'admin-print-scoped-report';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    ${pageSizeRule(layout)}
    @media print {
      /* visibility:hidden leaves layout height — that produces blank sheets */
      body[data-print-report="${reportId}"] #__next,
      body[data-print-report="${reportId}"] > *:not(.admin-print-report[data-report-id="${reportId}"]) {
        display: none !important;
      }

      html,
      body[data-print-report="${reportId}"] {
        margin: 0 !important;
        padding: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        background: #fff !important;
      }

      body[data-print-report] .admin-print-report {
        display: none !important;
      }
      body[data-print-report="${reportId}"] .admin-print-report[data-report-id="${reportId}"] {
        display: block !important;
        visibility: visible !important;
        position: static !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        clip: auto !important;
        white-space: normal !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-after: avoid !important;
        break-after: avoid-page !important;
      }
      body[data-print-report="${reportId}"] .admin-print-report[data-report-id="${reportId}"] * {
        visibility: visible !important;
      }
      body[data-print-report="${reportId}"] .admin-print-report[data-report-id="${reportId}"] .admin-report-pdf {
        position: static !important;
        overflow: visible !important;
        page-break-after: avoid !important;
        break-after: avoid-page !important;
      }
      body[data-print-report="${reportId}"] .admin-report-pdf__footer {
        page-break-after: avoid !important;
        break-after: avoid-page !important;
      }
    }
  `;
  document.body.setAttribute('data-print-report', reportId);

  const cleanup = () => {
    document.body.removeAttribute('data-print-report');
    style?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

export function printAdminReport(layout: 'receipt' | 'full' = 'receipt') {
  const styleId = 'admin-print-page-size';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = pageSizeRule(layout);

  const cleanup = () => {
    style?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
