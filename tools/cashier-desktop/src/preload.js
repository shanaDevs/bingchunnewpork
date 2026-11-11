'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bingchunCashier', {
  isDesktop: true,
  /** Stickers print via Electron → selected printer. Agent is not used. */
  printsDirect: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('cashier:get-version'),
  getConfig: () => ipcRenderer.invoke('cashier:get-config'),
  setConfig: (partial) => ipcRenderer.invoke('cashier:set-config', partial),
  listPrinters: () => ipcRenderer.invoke('cashier:list-printers'),
  printHtml: (html, options) => ipcRenderer.invoke('cashier:print-html', { html, options }),
  printHtmlPages: (pages, options) =>
    ipcRenderer.invoke('cashier:print-html-pages', { pages, options }),
  /** Print cup stickers directly (no agent / no cloud job). */
  printStickers: (stickers, options) =>
    ipcRenderer.invoke('cashier:print-stickers', { stickers, options }),
  openSettings: () => ipcRenderer.invoke('cashier:open-settings'),
  getAgentStatus: () => ipcRenderer.invoke('cashier:agent-status'),
  ensureAgent: () => ipcRenderer.invoke('cashier:ensure-agent'),
  reloadPos: () => ipcRenderer.invoke('cashier:reload-pos'),
  getSavedLogin: () => ipcRenderer.invoke('cashier:get-saved-login'),
  saveLogin: (payload) => ipcRenderer.invoke('cashier:save-login', payload),
});
