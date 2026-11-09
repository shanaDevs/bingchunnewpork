# Cup sticker agent (cashier PC)

Prints one Bing Chun cup sticker per cup on the local **Xprinter** when the cashier accepts an order.

Because the admin site is HTTPS, the browser cannot call `http://127.0.0.1` directly (Chrome blocks it).  
Instead:

1. Admin queues a print job on the server  
2. This agent (running on the cashier PC) **polls** the server and prints locally  

## Setup (once per cashier PC)

1. Plug in the Xprinter USB and note the **exact Windows printer name** (`Get-Printer`).
2. On **this same PC** (not the cloud server), double-click `start.bat`.
3. Leave that window open. It should log `polling .../cup-sticker-agent/claim`.
4. Open admin → **Printer** → set **Printer name** to that exact Windows name (saved per branch) → **Test print**.

## Environment (optional)

```bat
set BC_STICKER_API_URL=https://admin.bingchunsrilanka.com/api
set BC_STICKER_SECRET=bingchun-cup-sticker-local
set BC_STICKER_PRINTER=Xprinter XP-D35B
set BC_STICKER_WIDTH_MM=40
set BC_STICKER_HEIGHT_MM=30
set BC_STICKER_STORE_ID=
start.bat
```

`BC_STICKER_SECRET` must match the server `CUP_STICKER_AGENT_SECRET` (or the built-in default above).

## Local endpoints (optional debug)

- `GET  http://127.0.0.1:9177/health` — includes `printerReady` + `installedPrinters`
- `POST http://127.0.0.1:9177/test`
- `POST http://127.0.0.1:9177/print`

## “Agent connected” but print fails

Agent online only means cloud polling works. Printing still needs the **exact Windows printer name** on that cashier PC.

On the cashier PC:

```bat
powershell -NoProfile -Command "Get-Printer | Format-Table Name, PrinterStatus -AutoSize"
curl http://127.0.0.1:9177/health
```

If the name is not exactly `Xprinter XP-D35B` (extra space, different model, offline), either:

1. Install/rename the driver so Windows shows `Xprinter XP-D35B`, or  
2. Set the real name before start:

```bat
set BC_STICKER_PRINTER=Exact Name From Get-Printer
start.bat
```

Also set the same name in admin → Settings → Printer.
