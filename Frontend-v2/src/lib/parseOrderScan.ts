/** Extract order number from scanned QR text or manual entry */
export function parseOrderNumberFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    if (text.startsWith('http://') || text.startsWith('https://')) {
      const url = new URL(text);
      const parts = url.pathname.split('/').filter(Boolean);
      const orderIdx = parts.findIndex((p) => p === 'order' || p === 'track');
      if (orderIdx >= 0 && parts[orderIdx + 1]) {
        return decodeURIComponent(parts[orderIdx + 1]);
      }
    }
  } catch {
    /* not a URL */
  }

  const bcMatch = text.match(/BC\d{6}-\d{3,5}/i);
  if (bcMatch) return bcMatch[0].toUpperCase();

  const match = text.match(/BC[-_]?\d{4,}/i);
  if (match) return match[0].toUpperCase();

  if (text.length >= 4 && text.length <= 32) return text;

  return null;
}
