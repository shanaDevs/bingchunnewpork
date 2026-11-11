import type { Order, OrderItem } from '@/types';
import { adminApiFetch } from '@/lib/adminApi';
import { getAdminSession } from '@/lib/adminAuth';

/**
 * Chrome blocks HTTPS admin pages from calling http://127.0.0.1 directly.
 * Print jobs are queued on the admin API; start.bat on the cashier PC polls and prints.
 */
export const LOCAL_CUP_STICKER_AGENT_URL = 'http://127.0.0.1:9177';
export const CUP_STICKER_AGENT_URL = LOCAL_CUP_STICKER_AGENT_URL;

export const CUP_STICKER_ENABLED_KEY = 'bc_cup_sticker_enabled';
export const CUP_STICKER_PRINTER_KEY = 'bc_cup_sticker_printer';
/** Placeholder only — real value comes from branch system settings. */
export const DEFAULT_CUP_STICKER_PRINTER = '';

/** Printed as two centered rows (split on the period) for readability on small labels. */
export const CUP_STICKER_ADVISORY_EN =
  'Contains a non nutritive sweetener. Not recommended for children under 3 years of age.';

export const CUP_STICKER_ADVISORY_SI =
  'මෙම නිෂ්පාදනයේ අඩංගු කෘතීම පැණිරසකාරක අඩංගු වේ. එමනිසා වයස අවුරුදු 3 ට අඩු දරුවන් සඳහා නිර්දේශ නොකෙරේ.';

export type CupSticker = {
  orderLabel: string;
  cupLabel: string;
  itemName: string;
  printedAt: string;
  advisoryEn: string;
  advisorySi: string;
};

function isBrowser() {
  return typeof window !== 'undefined';
}

export function isCupStickerPrintingEnabled(): boolean {
  if (!isBrowser()) return false;
  const raw = localStorage.getItem(CUP_STICKER_ENABLED_KEY);
  // Default ON for cashier PCs once the agent is available.
  if (raw == null) return true;
  return raw === '1' || raw === 'true';
}

export function setCupStickerPrintingEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  localStorage.setItem(CUP_STICKER_ENABLED_KEY, enabled ? '1' : '0');
}

export function getCupStickerPrinterName(): string {
  if (!isBrowser()) return '';
  return localStorage.getItem(CUP_STICKER_PRINTER_KEY)?.trim() || '';
}

export function setCupStickerPrinterName(name: string) {
  if (!isBrowser()) return;
  localStorage.setItem(CUP_STICKER_PRINTER_KEY, name.trim());
}

/** Load branch system-setting printer name (per store). */
export async function fetchCupStickerPrinterSettings(storeId?: string | null): Promise<{
  storeId: string;
  printerName: string;
}> {
  const session = getAdminSession();
  const sid = storeId || session?.storeId || '';
  const qs = sid ? `?storeId=${encodeURIComponent(sid)}` : '';
  const data = await adminApiFetch<{ storeId: string; printerName: string }>(
    `/admin/cup-sticker-settings${qs}`,
  );
  setCupStickerPrinterName(data.printerName || '');
  return { storeId: data.storeId, printerName: data.printerName || '' };
}

/** Save branch system-setting printer name (per store). */
export async function saveCupStickerPrinterSettings(
  printerName: string,
  storeId?: string | null,
): Promise<{ storeId: string; printerName: string }> {
  const session = getAdminSession();
  const sid = storeId || session?.storeId || '';
  const data = await adminApiFetch<{ storeId: string; printerName: string }>(
    '/admin/cup-sticker-settings',
    {
      method: 'PUT',
      body: JSON.stringify({
        storeId: sid || null,
        printerName: printerName.trim(),
      }),
    },
  );
  setCupStickerPrinterName(data.printerName || '');
  return { storeId: data.storeId, printerName: data.printerName || '' };
}

/**
 * Last 4 digits of the order number for OP/OD stickers.
 * e.g. BC261101-1001 → "1001", BC251107-000042 → "0042"
 */
export function stickerSequence(order: Pick<Order, 'orderNumber'>): string {
  const orderNumber = String(order.orderNumber || '').trim();
  const hyphenTail = orderNumber.match(/-(\d+)\s*$/);
  const raw = hyphenTail?.[1] || orderNumber.match(/(\d+)(?!.*\d)/)?.[1] || '0';
  return raw.slice(-4).padStart(4, '0');
}

/**
 * Sticker order badge:
 * - Counter POS → POS-17 (queue position)
 * - Pickup (takeaway) → OP-1001 (order # last 4)
 * - Delivery → OD-1001 (order # last 4)
 */
export function stickerOrderLabel(
  order: Pick<Order, 'channel' | 'queuePosition' | 'orderNumber' | 'orderMode'>,
): string {
  const channel = (order.channel || '').toUpperCase();
  if (channel === 'POS') {
    if (order.queuePosition != null) return `POS-${order.queuePosition}`;
    return `POS-${stickerSequence(order)}`;
  }

  const seq = stickerSequence(order);
  if (order.orderMode === 'DELIVERY') return `OD-${seq}`;
  return `OP-${seq}`;
}

/** Date + time only (no seconds), e.g. 07/11 13:25 */
export function formatStickerDateTime(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function toppingNames(item: OrderItem): string[] {
  return (item.toppings || [])
    .map((t) => (t.toppingName || '').trim())
    .filter(Boolean);
}

/**
 * One sticker per cup unit (quantity expanded), labeled 1/N … N/N.
 * Each addon/topping on that cup gets its own extra sticker with the same cup number
 * (e.g. Bobo 1/2, Pearl 1/2, Matcha 2/2).
 */
export function buildCupStickers(order: Order, printedAt = formatStickerDateTime()): CupSticker[] {
  const orderLabel = stickerOrderLabel(order);
  const units: { itemName: string; addons: string[] }[] = [];
  for (const item of order.items || []) {
    const qty = item.quantity < 1 ? 1 : item.quantity;
    const addons = toppingNames(item);
    for (let i = 0; i < qty; i++) {
      units.push({ itemName: item.productName, addons });
    }
  }
  const total = units.length;
  const stickers: CupSticker[] = [];
  units.forEach((u, idx) => {
    const cupLabel = `${idx + 1}/${total}`;
    const base = {
      orderLabel,
      cupLabel,
      printedAt,
      advisoryEn: CUP_STICKER_ADVISORY_EN,
      advisorySi: CUP_STICKER_ADVISORY_SI,
    };
    stickers.push({ ...base, itemName: u.itemName });
    for (const addon of u.addons) {
      stickers.push({ ...base, itemName: addon });
    }
  });
  return stickers;
}

const AGENT_OFFLINE_MSG =
  'Cup sticker agent is offline on the server. On the cashier PC run BingChunCupStickerAgent.exe (Setup → Save && Install). It must reach the internet to poll /api/cup-sticker-agent (local 9177 alone is not enough). Check http://127.0.0.1:9177/health for cloudOk.';

/** True inside Bing Chun Cashier Electron (prints locally — no agent redirect). */
export function isBingchunCashierDesktop(): boolean {
  return isBrowser() && Boolean(window.bingchunCashier?.isDesktop);
}

/** 40mm × 30mm cup sticker HTML for Electron silent print. */
export function buildCupStickerHtml(sticker: CupSticker): string {
  const esc = (v: string) =>
    String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const en = esc(sticker.advisoryEn);
  const si = esc(sticker.advisorySi);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
@page{size:40mm 30mm;margin:0}
html,body{margin:0;padding:0;width:40mm;height:30mm;background:#fff}
body{font-family:Arial,"Nirmala UI",sans-serif;box-sizing:border-box;padding:0.8mm 3.5mm;display:flex;flex-direction:column;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:9pt;line-height:1.1}
.name{font-weight:700;font-size:11pt;text-align:center;margin:0.6mm 0;flex:1;display:flex;align-items:center;justify-content:center;line-height:1.1;word-break:break-word}
.meta{font-size:5pt;text-align:center;line-height:1.1}
.adv{font-size:3.6pt;text-align:center;line-height:1.15;margin-top:auto}
.adv-si{font-family:"Nirmala UI",Arial,sans-serif;font-size:3.5pt;text-align:center;line-height:1.15;margin-top:0.3mm}
</style></head><body>
<div class="top"><span>${esc(sticker.orderLabel)}</span><span>${esc(sticker.cupLabel)}</span></div>
<div class="name">${esc(sticker.itemName)}</div>
<div class="meta">${esc(sticker.printedAt)}</div>
<div class="adv">${en}</div>
${si ? `<div class="adv-si">${si}</div>` : ''}
</body></html>`;
}

async function printCupStickersViaDesktop(stickers: CupSticker[]): Promise<{ printed: number }> {
  const bridge = window.bingchunCashier;
  if (!bridge?.printStickers && !bridge?.printHtmlPages && !bridge?.printHtml) {
    throw new Error('Desktop print bridge missing — reopen Bing Chun Cashier.');
  }
  const cfg = await bridge.getConfig();
  const deviceName = cfg.printerName?.trim() || undefined; // empty → Electron uses Windows default
  setCupStickerPrinterName(deviceName || '');
  // Preferred: Electron builds + prints stickers (no agent / start.bat).
  if (bridge.printStickers) {
    const result = await bridge.printStickers(stickers, { deviceName, silent: true });
    return { printed: result.printed ?? stickers.length };
  }
  const pages = stickers.map(buildCupStickerHtml);
  const pageSize = { width: 40000, height: 30000 }; // microns = 40mm × 30mm
  if (bridge.printHtmlPages) {
    const result = await bridge.printHtmlPages(pages, { deviceName, silent: true, pageSize });
    return { printed: result.printed ?? pages.length };
  }
  for (const html of pages) {
    await bridge.printHtml(html, { deviceName, silent: true, pageSize });
    await new Promise((r) => setTimeout(r, 200));
  }
  return { printed: pages.length };
}

async function waitForCupStickerJob(
  jobId: string,
  timeoutMs = 90_000,
): Promise<{ printed: number }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await adminApiFetch<{
      id: string;
      status: 'pending' | 'printing' | 'done' | 'failed';
      error?: string;
      printed?: number;
    }>(`/admin/cup-sticker-jobs/${jobId}`);
    if (status.status === 'done') {
      return { printed: status.printed ?? 0 };
    }
    if (status.status === 'failed') {
      throw new Error(status.error || 'Sticker print failed');
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('Print timed out — is start.bat running on the cashier PC?');
}

export async function cupStickerAgentHealth(): Promise<{
  ok: boolean;
  printer?: string;
  error?: string;
}> {
  // Electron cashier: printer is set in app Settings — no cloud agent needed.
  if (isBingchunCashierDesktop() && window.bingchunCashier) {
    try {
      const cfg = await window.bingchunCashier.getConfig();
      const printer = cfg.printerName?.trim() || 'Windows default';
      setCupStickerPrinterName(cfg.printerName?.trim() || '');
      return { ok: true, printer };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Desktop printer check failed',
      };
    }
  }

  try {
    const session = getAdminSession();
    const qs = session?.storeId ? `?storeId=${encodeURIComponent(session.storeId)}` : '';
    const status = await adminApiFetch<{
      online: boolean;
      lastSeenAt: number | null;
      printerName?: string;
      printerHint?: string;
    }>(`/admin/cup-sticker-agent/status${qs}`);
    if (status.printerName != null) {
      setCupStickerPrinterName(status.printerName);
    }
    if (!status.online) {
      return { ok: false, error: AGENT_OFFLINE_MSG, printer: status.printerName || getCupStickerPrinterName() };
    }
    return { ok: true, printer: status.printerName || getCupStickerPrinterName() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : AGENT_OFFLINE_MSG,
    };
  }
}

export async function printCupStickers(stickers: CupSticker[]): Promise<{ printed: number }> {
  if (stickers.length === 0) throw new Error('No cups to print');

  // Desktop app: print directly to the printer chosen in Electron Settings.
  if (isBingchunCashierDesktop()) {
    return printCupStickersViaDesktop(stickers);
  }

  const health = await cupStickerAgentHealth();
  if (!health.ok) throw new Error(health.error || AGENT_OFFLINE_MSG);

  const session = getAdminSession();
  // Browser path: queue via Admin API → local agent polls and prints.
  const job = await adminApiFetch<{ id: string }>('/admin/cup-sticker-jobs', {
    method: 'POST',
    body: JSON.stringify({
      storeId: session?.storeId ?? null,
      stickers,
    }),
  });
  return waitForCupStickerJob(job.id);
}

export async function printCupStickersForOrder(order: Order): Promise<{ printed: number }> {
  return printCupStickers(buildCupStickers(order));
}

export async function printCupStickerTest(): Promise<{ printed: number }> {
  return printCupStickers([
    {
      orderLabel: 'OP-001',
      cupLabel: '1/1',
      itemName: 'Bobo',
      printedAt: formatStickerDateTime(),
      advisoryEn: CUP_STICKER_ADVISORY_EN,
      advisorySi: CUP_STICKER_ADVISORY_SI,
    },
  ]);
}

/** Fire-and-forget helper for Accept — never blocks status update failure handling. */
export async function tryPrintCupStickersForOrder(order: Order): Promise<void> {
  if (!isCupStickerPrintingEnabled()) return;
  await printCupStickersForOrder(order);
}
