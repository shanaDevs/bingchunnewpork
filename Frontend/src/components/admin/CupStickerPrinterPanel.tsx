'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  cupStickerAgentHealth,
  getCupStickerPrinterName,
  isCupStickerPrintingEnabled,
  printCupStickerTest,
  setCupStickerPrinterName,
  setCupStickerPrintingEnabled,
} from '@/lib/cupStickerPrint';

/** Compact cashier control for the local Xprinter cup-sticker agent. */
export default function CupStickerPrinterPanel({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [printerName, setPrinterName] = useState('Xprinter XP-D35B');
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setEnabled(isCupStickerPrintingEnabled());
    setPrinterName(getCupStickerPrinterName());
    const health = await cupStickerAgentHealth();
    setAgentOk(health.ok);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function onTestPrint() {
    setBusy(true);
    try {
      setCupStickerPrinterName(printerName);
      await printCupStickerTest();
      toast.success('Test sticker sent to printer');
      setAgentOk(true);
    } catch (e: unknown) {
      setAgentOk(false);
      toast.error(e instanceof Error ? e.message : 'Test print failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        compact
          ? 'rounded-xl border border-navy-border bg-navy-card/80 p-3'
          : 'rounded-2xl border border-navy-border bg-navy-card p-4'
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-cream">
          <Printer size={16} className="text-brand" />
          Cup stickers
        </div>
        <span
          className={`h-2 w-2 rounded-full ${agentOk ? 'bg-emerald-400' : agentOk === false ? 'bg-rose-400' : 'bg-amber-400'}`}
          title={agentOk ? 'Agent online' : agentOk === false ? 'Agent offline' : 'Checking…'}
        />
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        On Accept, prints one sticker per cup (POS-#, OP-1001 pickup, OD-1001 delivery — last 4 of order #).
        Keep <code className="text-cream/80">tools/cup-sticker-agent/start.bat</code> running on this PC.
      </p>
      <label className="mb-2 flex items-center gap-2 text-xs text-cream">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setCupStickerPrintingEnabled(e.target.checked);
            setEnabled(e.target.checked);
          }}
        />
        Print on Accept
      </label>
      <input
        type="text"
        value={printerName}
        onChange={(e) => setPrinterName(e.target.value)}
        onBlur={() => setCupStickerPrinterName(printerName)}
        className="mb-2 w-full rounded-lg border border-navy-border bg-navy px-2.5 py-1.5 text-xs text-cream"
        placeholder="Windows printer name"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void onTestPrint()}
        className="btn-outline flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
        Test print
      </button>
    </div>
  );
}
