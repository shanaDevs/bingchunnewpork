# Cup sticker agent (cashier PC)

Prints one Bing Chun cup sticker per cup on the local **Xprinter** when the cashier accepts an order.

Blank rolls already have the Bing Chun logo — the agent only prints:

- `POS-17` (counter) or the online order number (web/app/chat)
- Cup index `1/5` … `5/5`
- Item name + time
- English + Sinhala sweetener advisory

## Setup (once per cashier PC)

1. Plug in the Xprinter USB and confirm Windows shows **Xprinter XP-D35B** (or your model) on port **USB001**.
2. On **this same PC** (not the cloud server), double-click `start.bat`.
3. Keep that window open while using the cashier browser on this PC.
4. Open admin in the browser **on this PC** → sidebar → **Cup stickers** → **Test print**.

The admin site (even when hosted remotely) talks directly to `http://127.0.0.1:9177` on the cashier machine. Do **not** run `start.bat` only on the server — the USB printer is on the matching local PC.

Default label size is **40×30 mm**. Override if your roll differs:

```bat
set BC_STICKER_WIDTH_MM=40
set BC_STICKER_HEIGHT_MM=30
set BC_STICKER_PRINTER=Xprinter XP-D35B
start.bat
```

## API (cashier PC localhost)

Admin browser → `http://127.0.0.1:9177` (this PC):

- `GET  /health`
- `POST /test`
- `POST /print` with `{ "stickers": [ { orderLabel, cupLabel, itemName, printedAt, advisoryEn, advisorySi } ] }`
