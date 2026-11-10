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
  'Cup sticker agent is not running. On this cashier PC start tools/cup-sticker-agent/start.bat and keep that window open.';

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
  const health = await cupStickerAgentHealth();
  if (!health.ok) throw new Error(health.error || AGENT_OFFLINE_MSG);

  const session = getAdminSession();
  // Server uses the branch system setting as the printer name source of truth.
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
