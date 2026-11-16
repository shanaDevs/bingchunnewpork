# Bing Chun Cashier (Electron)

Live Orders + POS in a desktop window. **Direct sticker print** (no start.bat / agent).

## Install

Pick the installer that matches the PC:

| PC | Installer |
|----|-----------|
| Windows 10/11 64-bit | `dist\BingChunCashier-Setup-*-win10-x64.exe` |
| **Windows 7 32-bit** | `dist-win7\BingChunCashier-Setup-*-win7-ia32.exe` |

1. Run the installer as Admin  
2. Folder: **`C:\BingChunCashier`**  
3. Tick **Create a desktop shortcut** if you want the desktop icon  
4. Sign in (check **Remember email & password**)  
5. **Cashier → Printer & Settings** → pick printer  

The Win10 x64 build (Electron 33) will install on Win7 but **will not start** — use the Win7 ia32 build (Electron 22) on those PCs.

Online orders update live via Socket.IO. POS place-order opens **Orders**.

## Build

```bash
cd tools/cashier-desktop
npm install
npm run dist          # Windows 10/11 x64
npm run dist:win7     # Windows 7 32-bit (ia32)
# or both:
npm run dist:all-win
```
