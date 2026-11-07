#!/usr/bin/env node
/** Print 5 stickers: OP-001 (pickup) or OD-001 (delivery). */
const AGENT = process.env.BC_STICKER_AGENT_URL || 'http://127.0.0.1:9177';

const ADVISORY_EN =
  'Contains a non nutritive sweetener. Not recommended for children under 3 years of age.';
const ADVISORY_SI =
  'මෙම නිෂ්පාදනයේ අඩංගු කෘතීම පැණිරසකාරක අඩංගු වේ. එමනිසා වයස අවුරුදු 3 ට අඩු දරුවන් සඳහා නිර්දේශ නොකෙරේ.';

function formatPrintedAt(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}:${ss}`;
}

const mode = (process.argv[2] || 'pickup').toLowerCase();
const orderLabel = mode === 'delivery' ? 'OD-001' : 'OP-001';
const items = ['Bobo', 'Bobo', 'Matcha', 'Matcha', 'Matcha'];
const printedAt = formatPrintedAt();
const stickers = items.map((itemName, idx) => ({
  orderLabel,
  cupLabel: `${idx + 1}/5`,
  itemName,
  printedAt,
  advisoryEn: ADVISORY_EN,
  advisorySi: ADVISORY_SI,
}));

const health = await fetch(`${AGENT}/health`).then((r) => r.json());
if (!health.ok) {
  console.error('Agent not healthy', health);
  process.exit(1);
}

console.log(`Printing ${stickers.length} stickers as ${orderLabel}…`);
const res = await fetch(`${AGENT}/print`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ stickers }),
});
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
if (!res.ok || !json.ok || json.printed !== 5) process.exit(1);
console.log(`OK — look for ${orderLabel} + cup counts 1/5…5/5 + centered product name`);
