'use strict';

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 40mm × 30mm cup sticker HTML (matches POS layout). */
function buildCupStickerHtml(sticker) {
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

module.exports = { buildCupStickerHtml };
