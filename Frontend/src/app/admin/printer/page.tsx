'use client';

import CupStickerPrinterPanel from '@/components/admin/CupStickerPrinterPanel';

/** Branch / cashier printer controls (cup stickers via local start.bat agent). */
export default function AdminPrinterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Printer</h1>
        <p className="mt-1 text-sm text-muted">
          Cup sticker printing for this branch PC. Run the local agent, then use Test print.
        </p>
      </div>
      <div className="card p-5">
        <CupStickerPrinterPanel />
      </div>
    </div>
  );
}
