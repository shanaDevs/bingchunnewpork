# Bing Chun Cashier (Electron)

Live Orders + POS in a desktop window. **Direct sticker print** (no start.bat / agent).

## Install

1. Run `dist\BingChunCashier-Setup-1.2.0.exe` as Admin  
2. Folder: **`C:\BingChunCashier`**  
3. Tick **Create a desktop shortcut** if you want the desktop icon  
4. Sign in (check **Remember email & password**)  
5. **Cashier → Printer & Settings** → pick printer  

Online orders update live via Socket.IO. POS place-order opens **Orders**.

## Build

```bash
cd tools/cashier-desktop
npm install
npm run dist
```
