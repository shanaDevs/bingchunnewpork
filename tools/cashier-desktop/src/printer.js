'use strict';

const { BrowserWindow, webContents } = require('electron');

/** One hidden print window reused across stickers (avoids create/destroy per cup). */
let printWin = null;
let printChain = Promise.resolve();

function getPrintWindow() {
  if (printWin && !printWin.isDestroyed()) return printWin;
  printWin = new BrowserWindow({
    show: false,
    width: 420,
    height: 320,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  printWin.on('closed', () => {
    printWin = null;
  });
  return printWin;
}

async function listPrinters() {
  const all = webContents.getAllWebContents();
  const wc = all.find((c) => !c.isDestroyed()) || null;
  if (!wc) return [];
  try {
    // Electron 16+ prefers getPrintersAsync; Electron 22 (Win7 ia32) still has sync getPrinters.
    const printers =
      typeof wc.getPrintersAsync === 'function'
        ? await wc.getPrintersAsync()
        : typeof wc.getPrinters === 'function'
          ? wc.getPrinters()
          : [];
    return (printers || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: Boolean(p.isDefault),
      status: p.status,
    }));
  } catch {
    return [];
  }
}

/** Prefer configured name; otherwise Windows default printer. */
async function resolvePrinterName(preferred) {
  const name = String(preferred || '').trim();
  const printers = await listPrinters();
  if (name) {
    const match = printers.find((p) => p.name === name || p.displayName === name);
    if (match) return match.name;
    return name; // still try exact Windows name
  }
  const def = printers.find((p) => p.isDefault);
  return def?.name || undefined;
}

/**
 * Silent-print HTML to the cashier-selected Windows printer (or OS default).
 * pageSize may be { width, height } in microns (40mm×30mm → 40000×30000).
 * Reuses one BrowserWindow; jobs are serialized.
 */
function printHtml(html, { deviceName, silent = true, pageSize, margins } = {}) {
  const job = printChain.then(
    () =>
      new Promise((resolve, reject) => {
        const win = getPrintWindow();
        let settled = false;

        const finish = (err, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          win.webContents.removeListener('did-fail-load', onFail);
          win.webContents.removeListener('did-finish-load', onReady);
          if (err) reject(err);
          else resolve(result);
        };

        const timer = setTimeout(() => {
          finish(new Error('Print timed out'));
        }, 45000);

        const onFail = (_e, code, desc) => {
          finish(new Error(`Print load failed: ${desc || code}`));
        };

        const onReady = () => {
          setTimeout(() => {
            if (settled || win.isDestroyed()) return;
            const opts = {
              silent: Boolean(silent),
              printBackground: true,
              deviceName: deviceName || undefined,
              margins: margins || { marginType: 'none' },
            };
            if (pageSize) opts.pageSize = pageSize;

            win.webContents.print(opts, (success, failureReason) => {
              if (!success) {
                finish(new Error(failureReason || 'Print failed'));
                return;
              }
              finish(null, { ok: true });
            });
          }, 80);
        };

        win.webContents.once('did-fail-load', onFail);
        win.webContents.once('did-finish-load', onReady);
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      }),
  );

  // Keep the chain alive even when a job fails so later stickers still print.
  printChain = job.catch(() => {});
  return job;
}

async function printHtmlPages(pages, options = {}) {
  const deviceName = await resolvePrinterName(options.deviceName);
  let printed = 0;
  for (const html of pages) {
    await printHtml(html, { ...options, deviceName });
    printed += 1;
    // Brief gap so thermal printers flush without opening a new window.
    await new Promise((r) => setTimeout(r, 80));
  }
  return { ok: true, printed, printer: deviceName || '(Windows default)' };
}

module.exports = {
  listPrinters,
  resolvePrinterName,
  printHtml,
  printHtmlPages,
};
