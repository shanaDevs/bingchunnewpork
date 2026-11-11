'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require('electron');
const { readConfig, writeConfig, allowedOrigins } = require('./config');
const { listPrinters, printHtml, printHtmlPages, resolvePrinterName } = require('./printer');
const { buildCupStickerHtml } = require('./stickerHtml');
const { FETCH_HOOK } = require('./injectPrintHook');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;

const isDev = process.argv.includes('--dev');
const PARTITION = 'persist:bingchun-cashier';

function preloadPath() {
  return path.join(__dirname, 'preload.js');
}

function createMenu() {
  const template = [
    {
      label: 'Cashier',
      submenu: [
        {
          label: 'Reload POS',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        {
          label: 'Open Orders',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const cfg = readConfig();
            try {
              const u = new URL(cfg.posUrl);
              loadPos(`${u.origin}/admin/orders`);
            } catch {
              loadPos('https://admin.bingchunsrilanka.com/admin/orders');
            }
          },
        },
        {
          label: 'Printer & Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettings(),
        },
        {
          label: 'Test sticker print',
          click: async () => {
            try {
              const cfg = readConfig();
              const deviceName = await resolvePrinterName(cfg.printerName);
              const html = buildTestStickerHtml();
              await printHtml(html, {
                deviceName,
                silent: true,
                pageSize: { width: 40000, height: 30000 },
              });
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Test print',
                message: `Sent test sticker to “${deviceName || 'Windows default'}”.`,
              });
            } catch (e) {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Test print failed',
                message: e instanceof Error ? e.message : String(e),
              });
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Bing Chun Cashier',
              message: `Bing Chun Cashier v${app.getVersion()}`,
              detail:
                'Cashier desktop with live orders (Socket.IO) and direct sticker print.\nNo start.bat / agent.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTestStickerHtml() {
  return buildCupStickerHtml({
    orderLabel: 'OP-001',
    cupLabel: '1/1',
    itemName: 'Bobo',
    printedAt: 'TEST PRINT',
    advisoryEn: 'Contains a non nutritive sweetener. Not recommended for children under 3 years of age.',
    advisorySi: '',
  });
}

function createMainWindow() {
  const cfg = readConfig();
  const bounds = cfg.windowBounds || { width: 1280, height: 800 };

  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 640,
    title: 'Bing Chun Cashier',
    backgroundColor: '#0f172a',
    autoHideMenuBar: false,
    backgroundThrottling: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      partition: PARTITION,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const origins = allowedOrigins(readConfig());
    try {
      const parsed = new URL(url);
      if (origins.has(parsed.origin)) {
        // Keep staff flows inside the app (orders, POS, payment return URLs on same host)
        mainWindow?.loadURL(url);
        return { action: 'deny' };
      }
    } catch {
      /* fall through */
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const origins = allowedOrigins(readConfig());
    try {
      const origin = new URL(url).origin;
      if (!origins.has(origin) && !url.startsWith('file://') && !url.startsWith('data:')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    writeConfig({ windowBounds: mainWindow.getBounds() });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const injectHook = () => {
    mainWindow?.webContents.executeJavaScript(FETCH_HOOK).catch(() => {});
  };
  mainWindow.webContents.on('did-finish-load', injectHook);
  mainWindow.webContents.on('did-navigate-in-page', injectHook);

  loadPos(cfg.posUrl);
}

function loadPos(posUrl) {
  if (!mainWindow) return;
  mainWindow.loadURL(posUrl).catch(() => {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'), {
      query: { url: posUrl },
    });
  });
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 520,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    resizable: false,
    title: 'Printer & Settings',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

async function printOptionsFromPayload(options) {
  const cfg = readConfig();
  const deviceName = await resolvePrinterName(options?.deviceName || cfg.printerName);
  return {
    deviceName,
    silent: options?.silent !== false,
    pageSize: options?.pageSize || { width: 40000, height: 30000 },
    margins: options?.margins || { marginType: 'none' },
  };
}

function registerIpc() {
  ipcMain.handle('cashier:get-version', () => app.getVersion());
  ipcMain.handle('cashier:get-config', () => readConfig());
  ipcMain.handle('cashier:set-config', (_e, partial) => {
    const next = writeConfig(partial || {});
    if (partial?.posUrl && mainWindow) {
      loadPos(next.posUrl);
    }
    return next;
  });
  ipcMain.handle('cashier:list-printers', () => listPrinters());
  ipcMain.handle('cashier:print-html', async (_e, payload) => {
    const { html, options } = payload || {};
    if (!html || typeof html !== 'string') throw new Error('html required');
    return printHtml(html, await printOptionsFromPayload(options));
  });
  ipcMain.handle('cashier:print-html-pages', async (_e, payload) => {
    const { pages, options } = payload || {};
    if (!Array.isArray(pages) || pages.length === 0) throw new Error('pages required');
    return printHtmlPages(pages, await printOptionsFromPayload(options));
  });
  ipcMain.handle('cashier:print-stickers', async (_e, payload) => {
    const stickers = payload?.stickers;
    if (!Array.isArray(stickers) || stickers.length === 0) {
      throw new Error('No stickers to print');
    }
    const options = await printOptionsFromPayload(payload?.options);
    const pages = stickers.map((s) => buildCupStickerHtml(s || {}));
    return printHtmlPages(pages, options);
  });
  ipcMain.handle('cashier:open-settings', () => {
    openSettings();
    return true;
  });
  ipcMain.handle('cashier:agent-status', async () => {
    const cfg = readConfig();
    const printer = await resolvePrinterName(cfg.printerName);
    return { ok: true, printer: printer || 'Windows default', path: 'electron-direct' };
  });
  ipcMain.handle('cashier:ensure-agent', async () => ({
    ok: true,
    started: false,
    path: 'electron-direct',
  }));
  ipcMain.handle('cashier:reload-pos', () => {
    loadPos(readConfig().posUrl);
    return true;
  });
  ipcMain.handle('cashier:get-saved-login', () => {
    const cfg = readConfig();
    return {
      email: cfg.savedEmail || '',
      password: cfg.savedPassword || '',
      remember: Boolean(cfg.rememberLogin),
    };
  });
  ipcMain.handle('cashier:save-login', (_e, payload) => {
    const remember = Boolean(payload?.remember);
    if (!remember) {
      return writeConfig({ rememberLogin: false, savedEmail: '', savedPassword: '' });
    }
    return writeConfig({
      rememberLogin: true,
      savedEmail: String(payload?.email || '').trim(),
      savedPassword: String(payload?.password || ''),
    });
  });
}

app.whenReady().then(() => {
  const ses = session.fromPartition(PARTITION);

  // Allow notifications + media so order alerts / sounds work; deny the rest.
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'notifications' || permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });

  registerIpc();
  createMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
