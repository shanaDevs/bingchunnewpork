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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.BC_STICKER_HOST || '127.0.0.1';
const PORT = Number(process.env.BC_STICKER_PORT || 9177);
const PRINTER = process.env.BC_STICKER_PRINTER || 'Xprinter XP-D35B';
const WIDTH_MM = Number(process.env.BC_STICKER_WIDTH_MM || 40);
const HEIGHT_MM = Number(process.env.BC_STICKER_HEIGHT_MM || 30);
const PRINT_PS1 = path.join(__dirname, 'print-stickers.ps1');

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
    const ps = spawn(
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
      sendJson(res, 200, {
        ok: true,
        printer: PRINTER,
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

freePortIfBusy();
server.listen(PORT, HOST, () => {
  console.log(`[cup-sticker-agent] listening on http://${HOST}:${PORT}`);
  console.log(`[cup-sticker-agent] printer=${PRINTER} label=${WIDTH_MM}x${HEIGHT_MM}mm`);
});
