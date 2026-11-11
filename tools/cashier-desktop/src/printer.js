'use strict';

const { BrowserWindow, webContents } = require('electron');

async function listPrinters() {
  const all = webContents.getAllWebContents();
  const wc = all.find((c) => !c.isDestroyed()) || null;
  if (!wc) return [];
  try {
    const printers = await wc.getPrintersAsync();
    return printers.map((p) => ({
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
 */
function printHtml(html, { deviceName, silent = true, pageSize, margins } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 420,
      height: 320,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const cleanup = () => {
      if (!win.isDestroyed()) win.destroy();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Print timed out'));
    }, 45000);

    win.webContents.on('did-fail-load', (_e, code, desc) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Print load failed: ${desc || code}`));
    });

    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        const opts = {
          silent: Boolean(silent),
          printBackground: true,
          deviceName: deviceName || undefined,
          margins: margins || { marginType: 'none' },
        };
        if (pageSize) opts.pageSize = pageSize;

        win.webContents.print(opts, (success, failureReason) => {
          clearTimeout(timer);
          cleanup();
          if (!success) {
            reject(new Error(failureReason || 'Print failed'));
            return;
          }
          resolve({ ok: true });
        });
      }, 120);
    });

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

async function printHtmlPages(pages, options = {}) {
  const deviceName = await resolvePrinterName(options.deviceName);
  let printed = 0;
  for (const html of pages) {
    await printHtml(html, { ...options, deviceName });
    printed += 1;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ok: true, printed, printer: deviceName || '(Windows default)' };
}

module.exports = {
  listPrinters,
  resolvePrinterName,
  printHtml,
  printHtmlPages,
};
