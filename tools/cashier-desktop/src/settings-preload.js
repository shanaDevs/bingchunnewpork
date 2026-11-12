'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cashierSettings', {
  getConfig: () => ipcRenderer.invoke('cashier:get-config'),
  setConfig: (partial) => ipcRenderer.invoke('cashier:set-config', partial),
  listPrinters: () => ipcRenderer.invoke('cashier:list-printers'),
  getAgentStatus: () => ipcRenderer.invoke('cashier:agent-status'),
  ensureAgent: () => ipcRenderer.invoke('cashier:ensure-agent'),
  getVersion: () => ipcRenderer.invoke('cashier:get-version'),
});
