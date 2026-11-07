import type { Order, OrderItem } from '@/types';

/**
 * Browser calls same-origin Next proxy (`/cup-sticker-agent/...`) — not `/api/*`,
 * because next.config rewrites `/api` to the backend in dev.
 * Next then talks to the local Windows agent on 127.0.0.1:9177.
 */
export function getCupStickerAgentUrl(): string {
  if (typeof window !== 'undefined') {
    return '/cup-sticker-agent';
  }
  return (
    process.env.CUP_STICKER_AGENT_URL ||
    process.env.NEXT_PUBLIC_CUP_STICKER_AGENT_URL ||
    'http://127.0.0.1:9177'
  );
}

/** @deprecated use getCupStickerAgentUrl() */
export const CUP_STICKER_AGENT_URL = '/cup-sticker-agent';

export const CUP_STICKER_ENABLED_KEY = 'bc_cup_sticker_enabled';
export const CUP_STICKER_PRINTER_KEY = 'bc_cup_sticker_printer';

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
  if (!isBrowser()) return 'Xprinter XP-D35B';
  return localStorage.getItem(CUP_STICKER_PRINTER_KEY)?.trim() || 'Xprinter XP-D35B';
}

export function setCupStickerPrinterName(name: string) {
  if (!isBrowser()) return;
  localStorage.setItem(CUP_STICKER_PRINTER_KEY, name.trim());
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

function agentUnreachableMessage(raw?: string): string {
  const msg = (raw || '').toLowerCase();
  if (
    msg.includes('failed to fetch') ||
    msg.includes('abort') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('not reachable')
  ) {
    return 'Cup sticker agent is not running. Start tools/cup-sticker-agent/start.bat on this PC and keep that window open.';
  }
  return raw || 'Cup sticker agent unavailable';
}

export async function cupStickerAgentHealth(timeoutMs = 4000): Promise<{
  ok: boolean;
  printer?: string;
  error?: string;
}> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getCupStickerAgentUrl()}/health`, { signal: ctrl.signal, cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; printer?: string; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: agentUnreachableMessage(json.error || `Agent HTTP ${res.status}`) };
    }
    return { ok: true, printer: json.printer };
  } catch (e) {
    return {
      ok: false,
      error: agentUnreachableMessage(e instanceof Error ? e.message : undefined),
    };
  } finally {
    clearTimeout(t);
  }
}

export async function printCupStickers(stickers: CupSticker[]): Promise<{ printed: number }> {
  if (stickers.length === 0) throw new Error('No cups to print');
  let res: Response;
  try {
    res = await fetch(`${getCupStickerAgentUrl()}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerName: getCupStickerPrinterName(),
        stickers,
      }),
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(agentUnreachableMessage(e instanceof Error ? e.message : undefined));
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; printed?: number; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(agentUnreachableMessage(json.error) || `Sticker print failed (HTTP ${res.status})`);
  }
  return { printed: json.printed ?? stickers.length };
}

export async function printCupStickersForOrder(order: Order): Promise<{ printed: number }> {
  return printCupStickers(buildCupStickers(order));
}

export async function printCupStickerTest(): Promise<{ printed: number }> {
  let res: Response;
  try {
    res = await fetch(`${getCupStickerAgentUrl()}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName: getCupStickerPrinterName() }),
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(agentUnreachableMessage(e instanceof Error ? e.message : undefined));
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; printed?: number; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(agentUnreachableMessage(json.error) || `Test print failed (HTTP ${res.status})`);
  }
  return { printed: json.printed ?? 1 };
}

/** Fire-and-forget helper for Accept — never blocks status update failure handling. */
export async function tryPrintCupStickersForOrder(order: Order): Promise<void> {
  if (!isCupStickerPrintingEnabled()) return;
  const health = await cupStickerAgentHealth();
  if (!health.ok) {
    throw new Error(health.error || 'Cup sticker agent unavailable');
  }
  await printCupStickersForOrder(order);
}
