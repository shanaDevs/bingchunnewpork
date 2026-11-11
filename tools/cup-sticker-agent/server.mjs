#!/usr/bin/env node
/**
 * Local cup-sticker print agent for the cashier PC.
 * Listens on http://127.0.0.1:9177 so the admin web app can print
 * one sticker per cup when an order is accepted.
 *
 * Start:  node tools/cup-sticker-agent/server.mjs
 *   or:   tools/cup-sticker-agent/start.bat
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

/** Folder next to server.mjs, or next to the packaged .exe when running under pkg. */
function resolveAgentDir() {
  if (typeof process.pkg !== 'undefined') {
    return path.dirname(process.execPath);
  }
  if (process.env.BC_STICKER_AGENT_DIR) {
    return path.resolve(process.env.BC_STICKER_AGENT_DIR);
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}
const AGENT_DIR = resolveAgentDir();

/** Load key=value pairs from local.env when the process env is unset. */
function loadLocalEnvFile() {
  const envPath = path.join(AGENT_DIR, 'local.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!key) continue;
      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore */
  }
}

function detectPrinterName() {
  const exe = path.join(AGENT_DIR, 'detect-printer.exe');
  try {
    if (fs.existsSync(exe)) {
      const out = execSync(`"${exe}"`, { encoding: 'utf8', windowsHide: true, timeout: 12000 })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (out) return out;
    }
  } catch {
    /* fall through */
  }
  // Windows 7-friendly: WMIC (no PowerShell)
  try {
    const raw = execSync('wmic printer get Name,DriverName /format:csv', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    const lines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/^Node,DriverName,Name$/i.test(s));
    const rows = lines.map((line) => {
      const parts = line.split(',');
      const name = (parts[parts.length - 1] || '').trim();
      const driver = (parts[parts.length - 2] || '').trim();
      return { name, driver };
    });
    const hit =
      rows.find((r) => /xprinter|xp-d35/i.test(r.driver) || /xprinter|xp-d35/i.test(r.name)) ||
      rows.find((r) => /^bingchun$/i.test(r.name));
    return hit?.name || '';
  } catch {
    return '';
  }
}

function listPrinterDetails() {
  try {
    const raw = execSync('wmic printer get Name,DriverName,PortName,PrinterStatus /format:csv', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    });
    const lines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/^Node,/i.test(s));
    const printers = [];
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 4) continue;
      const status = (parts[parts.length - 1] || '').trim();
      const portName = (parts[parts.length - 2] || '').trim();
      const name = (parts[parts.length - 3] || '').trim();
      const driverName = (parts[parts.length - 4] || '').trim();
      if (!name) continue;
      const stickerLikely = /xprinter|xp-d35|bingchun/i.test(`${driverName} ${name}`);
      printers.push({
        name,
        driverName,
        portName,
        hostAddress: '',
        tcpPort: null,
        portKind: /^USB\d+/i.test(portName) ? 'usb' : /^COM\d+/i.test(portName) ? 'com' : 'other',
        status,
        ready: true,
        stickerLikely,
      });
    }
    const suggested =
      printers.find((p) => p.stickerLikely)?.name || printers[0]?.name || '';
    return { printers, ports: [], suggested };
  } catch {
    return null;
  }
}

loadLocalEnvFile();

const HOST = process.env.BC_STICKER_HOST || '127.0.0.1';
const PORT = Number(process.env.BC_STICKER_PORT || 9177);
const WIDTH_MM = Number(process.env.BC_STICKER_WIDTH_MM || 40);
const HEIGHT_MM = Number(process.env.BC_STICKER_HEIGHT_MM || 30);
const PRINTER =
  (process.env.BC_STICKER_PRINTER || '').trim() || detectPrinterName() || 'Xprinter XP-D35B';
// Keep process env in sync so child print script inherits the resolved name.
process.env.BC_STICKER_PRINTER = PRINTER;
const PRINT_EXE = path.join(AGENT_DIR, 'print-stickers.exe');
const PRINT_PS1 = path.join(AGENT_DIR, 'print-stickers.ps1');
/** Admin API base (browser cannot reach localhost from HTTPS — agent pulls jobs). */
const API_BASE = (process.env.BC_STICKER_API_URL || 'https://admin.bingchunsrilanka.com/api').replace(
  /\/$/,
  '',
);
const AGENT_SECRET =
  process.env.BC_STICKER_SECRET ||
  process.env.CUP_STICKER_AGENT_SECRET ||
  'bingchun-cup-sticker-local';
const STORE_ID = process.env.BC_STICKER_STORE_ID || '';
const POLL_MS = Number(process.env.BC_STICKER_POLL_MS || 1500);

const ADVISORY_EN =
  'Contains a non nutritive sweetener. Not recommended for children under 3 years of age.';
const ADVISORY_SI =
  'මෙම නිෂ්පාදනයේ අඩංගු කෘතීම පැණිරසකාරක අඩංගු වේ. එමනිසා වයස අවුරුදු 3 ට අඩු දරුවන් සඳහා නිර්දේශ නොකෙරේ.';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  // Chrome Private Network Access (LAN page → 127.0.0.1 agent)
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function sendJson(res, status, body) {
  cors(res);
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function formatPrintedAt(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function runPrint(payload) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `bc-cup-stickers-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    // UTF-8 BOM so Windows PowerShell 5.1 Get-Content -Encoding UTF8 keeps Sinhala intact.
    const json = JSON.stringify(payload);
    fs.writeFileSync(tmp, `\uFEFF${json}`, 'utf8');
    const useExe = fs.existsSync(PRINT_EXE);
    const ps = useExe
      ? spawn(PRINT_EXE, ['-JsonPath', tmp], {
          windowsHide: true,
          env: { ...process.env, BC_STICKER_PRINTER: process.env.BC_STICKER_PRINTER || PRINTER },
        })
      : spawn(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PRINT_PS1, '-JsonPath', tmp],
          { windowsHide: true },
        );
    let stdout = '';
    let stderr = '';
    ps.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    ps.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    ps.on('error', (err) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      reject(err);
    });
    ps.on('close', (code) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `print-stickers.ps1 exited ${code}`));
        return;
      }
      resolve({ stdout: stdout.trim(), printed: payload.stickers.length });
    });
  });
}

function buildTestStickers() {
  return [
    {
      orderLabel: 'OP-001',
      cupLabel: '1/1',
      itemName: 'Bobo',
      printedAt: formatPrintedAt(),
      advisoryEn: ADVISORY_EN,
      advisorySi: ADVISORY_SI,
    },
  ];
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      let installedPrinters = [];
      let printerReady = null;
      let printerPort = process.env.BC_STICKER_PRINTER_PORT || '';
      let printerHost = process.env.BC_STICKER_PRINTER_HOST || '';
      let printerTcpPort = process.env.BC_STICKER_PRINTER_TCP_PORT || '';
      let printersDetailed = null;
      try {
        const details = listPrinterDetails();
        if (details?.printers) {
          printersDetailed = details.printers;
          installedPrinters = details.printers.map((p) => p.name).filter(Boolean);
          const match = details.printers.find((p) => p.name === PRINTER);
          if (match) {
            printerReady = Boolean(match.ready);
            printerPort = match.portName || printerPort;
            printerHost = match.hostAddress || printerHost;
            if (match.tcpPort != null && match.tcpPort !== '') {
              printerTcpPort = String(match.tcpPort);
            }
          } else {
            printerReady = installedPrinters.includes(PRINTER);
          }
        } else {
          const raw = execSync(
            `powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { $_ }"`,
            { encoding: 'utf8', windowsHide: true, timeout: 8000 },
          );
          installedPrinters = raw
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          printerReady = installedPrinters.some((name) => name === PRINTER);
        }
      } catch {
        printerReady = null;
      }
      sendJson(res, 200, {
        ok: true,
        printer: PRINTER,
        printerReady,
        printerPort,
        printerHost,
        printerTcpPort,
        installedPrinters,
        printers: printersDetailed,
        widthMm: WIDTH_MM,
        heightMm: HEIGHT_MM,
        advisoryEn: ADVISORY_EN,
        advisorySi: ADVISORY_SI,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/test') {
      const body = await readBody(req);
      const result = await runPrint({
        printerName: body.printerName || PRINTER,
        widthMm: body.widthMm || WIDTH_MM,
        heightMm: body.heightMm || HEIGHT_MM,
        stickers: buildTestStickers(),
      });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/print') {
      const body = await readBody(req);
      const stickers = Array.isArray(body.stickers) ? body.stickers : [];
      if (stickers.length === 0) {
        sendJson(res, 400, { ok: false, error: 'stickers array required' });
        return;
      }
      const normalized = stickers.map((s) => ({
        orderLabel: String(s.orderLabel || ''),
        cupLabel: String(s.cupLabel || ''),
        itemName: String(s.itemName || ''),
        printedAt: String(s.printedAt || formatPrintedAt()),
        advisoryEn: String(s.advisoryEn || ADVISORY_EN),
        advisorySi: String(s.advisorySi || ADVISORY_SI),
      }));
      const result = await runPrint({
        printerName: body.printerName || PRINTER,
        widthMm: body.widthMm || WIDTH_MM,
        heightMm: body.heightMm || HEIGHT_MM,
        stickers: normalized,
      });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

function freePortIfBusy() {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano | findstr /R /C:":${PORT} .*LISTENING"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid) && Number(pid) !== process.pid) pids.add(pid);
    }
    for (const pid of pids) {
      console.log(`[cup-sticker-agent] Port ${PORT} in use — stopping PID ${pid}`);
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* findstr exit 1 = nothing listening */
  }
}

server.on('error', (err) => {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
    console.error(`[cup-sticker-agent] Port ${PORT} is already in use.`);
    console.error('Close the other cup-sticker window, or run start.bat again (it frees the port).');
    process.exit(1);
  }
  console.error('[cup-sticker-agent] failed to start:', err);
  process.exit(1);
});

async function claimRemoteJob() {
  const qs = STORE_ID ? `?storeId=${encodeURIComponent(STORE_ID)}` : '';
  const res = await fetch(`${API_BASE}/cup-sticker-agent/claim${qs}`, {
    headers: {
      Accept: 'application/json',
      'X-Cup-Sticker-Secret': AGENT_SECRET,
    },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.message || `Claim HTTP ${res.status}`);
  }
  return json.data || null;
}

async function completeRemoteJob(id, result) {
  await fetch(`${API_BASE}/cup-sticker-agent/jobs/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cup-Sticker-Secret': AGENT_SECRET,
    },
    body: JSON.stringify(result),
    cache: 'no-store',
  }).catch(() => undefined);
}

let pollBusy = false;
async function pollCloudJobs() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const job = await claimRemoteJob();
    if (!job?.id) return;
    console.log(`[cup-sticker-agent] claimed job ${job.id} (${(job.stickers || []).length} stickers)`);
    try {
      const result = await runPrint({
        printerName: job.printerName || PRINTER,
        widthMm: WIDTH_MM,
        heightMm: HEIGHT_MM,
        stickers: job.stickers || [],
      });
      await completeRemoteJob(job.id, { ok: true, printed: result.printed });
      console.log(`[cup-sticker-agent] job ${job.id} printed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await completeRemoteJob(job.id, { ok: false, error: message });
      console.error(`[cup-sticker-agent] job ${job.id} failed:`, message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Soft warn — network blips are normal
    if (!message.includes('fetch failed') && !message.includes('ECONNREFUSED')) {
      console.warn(`[cup-sticker-agent] poll:`, message);
    }
  } finally {
    pollBusy = false;
  }
}

freePortIfBusy();
server.listen(PORT, HOST, () => {
  console.log(`[cup-sticker-agent] listening on http://${HOST}:${PORT}`);
  console.log(`[cup-sticker-agent] printer=${PRINTER} label=${WIDTH_MM}x${HEIGHT_MM}mm`);
  console.log(`[cup-sticker-agent] polling ${API_BASE}/cup-sticker-agent/claim every ${POLL_MS}ms`);
  void pollCloudJobs();
  setInterval(() => void pollCloudJobs(), POLL_MS);
});
