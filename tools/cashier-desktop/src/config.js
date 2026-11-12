'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** Production cashier opens Orders (live queue). Override via Settings or BINGCHUN_POS_URL. */
const DEFAULT_POS_URL = 'https://admin.bingchunsrilanka.com/admin/orders';
const DEFAULT_API_URL = 'https://admin.bingchunsrilanka.com/api';

const DEFAULTS = {
  posUrl: process.env.BINGCHUN_POS_URL || DEFAULT_POS_URL,
  apiUrl: process.env.BINGCHUN_API_URL || DEFAULT_API_URL,
  printerName: '',
  agentPort: 9177,
  /** Agent is optional now — Electron prints stickers directly. */
  autoStartAgent: false,
  windowBounds: null,
  rememberLogin: false,
  savedEmail: '',
  savedPassword: '',
};

function configPath() {
  return path.join(app.getPath('userData'), 'cashier-config.json');
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...parsed };
    // Older builds opened /admin — cashiers need the live Orders board.
    if (
      typeof merged.posUrl === 'string' &&
      /\/admin\/?$/.test(merged.posUrl.replace(/\/+$/, '') + '/')
    ) {
      merged.posUrl = DEFAULT_POS_URL;
    }
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(next) {
  const merged = { ...DEFAULTS, ...readConfig(), ...next };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function allowedOrigins(cfg) {
  const origins = new Set();
  for (const url of [cfg.posUrl, cfg.apiUrl, DEFAULT_POS_URL, DEFAULT_API_URL]) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      /* ignore bad url */
    }
  }
  // Packaged POS / DigitalOcean fallbacks used in split deploys
  origins.add('https://bingchun-pos-i8pq3.ondigitalocean.app');
  origins.add('https://bingchun-admin-a4ndy.ondigitalocean.app');
  origins.add('https://admin.bingchunsrilanka.com');
  return origins;
}

module.exports = {
  DEFAULT_POS_URL,
  DEFAULT_API_URL,
  DEFAULTS,
  readConfig,
  writeConfig,
  allowedOrigins,
};
