# Cup sticker agent (Windows 7 / 10 / 11)

**No Node.js.** Uses a native **.NET 4** agent (`BingChunCupStickerAgent.exe`) so Windows 7 does not hit `EventSetInformation` / `ADVAPI32.dll` errors from Node 16/18/20.

## Cashier PC (including Windows 7)

**Full manual steps:** see **`MANUAL-COPY-GUIDE.txt`** in this folder.

1. Copy the whole `cup-sticker-agent` folder (EXE files + optional `runtime\node`)  
2. Run **`BingChunCupStickerSetup.exe`**  
3. Select the sticker printer  
4. Click **Save && Install agent**  

Needs **.NET Framework 4** (setup can download/install it).  
Normal run uses **native agent** (no Node). `runtime\node` is Node **16** backup only.

## Files that must be on the Win7 PC

- `BingChunCupStickerSetup.exe` — printer picker GUI  
- `BingChunCupStickerAgent.exe` — agent (poll + health HTTP)  
- `print-stickers.exe` — prints labels  
- `detect-printer.exe`  
- `start.bat` / `install.bat` / `local.env` (created by setup)  
- `MANUAL-COPY-GUIDE.txt` — copy instructions  
- `runtime\node\` — optional portable **Node 16** (for backup / manual copy)  

Do **not** put Node 18/20 on Windows 7 (ADVAPI32 / EventSetInformation error).

## Build on a modern PC

```bat
build-helpers.bat
```

## Health

`http://127.0.0.1:9177/health` — includes `"native":true`
