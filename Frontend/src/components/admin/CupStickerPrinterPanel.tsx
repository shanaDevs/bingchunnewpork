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

/** Cashier control for the local Xprinter cup-sticker agent (this PC only). */
export default function CupStickerPrinterPanel({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [printerName, setPrinterName] = useState('Xprinter XP-D35B');
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setEnabled(isCupStickerPrintingEnabled());
    setPrinterName(getCupStickerPrinterName());
    const health = await cupStickerAgentHealth();
    setAgentOk(health.ok);
    setAgentError(health.ok ? null : health.error || 'Agent offline');
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
      setAgentError(null);
    } catch (e: unknown) {
      setAgentOk(false);
      const msg = e instanceof Error ? e.message : 'Test print failed';
      setAgentError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="rounded-xl border border-navy-border bg-navy-card/80 p-3">
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
          On Accept, prints one sticker per cup. Run{' '}
          <code className="text-cream/80">tools/cup-sticker-agent/start.bat</code> on this PC.
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Printer size={18} className="text-brand" />
            Cup sticker printer
          </h2>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">
            On Accept, prints one sticker per cup (POS-#, OP-1001 pickup, OD-1001 delivery — last 4 of order #).
            Run <code className="text-cream/80">tools/cup-sticker-agent/start.bat</code> on this cashier PC
            (USB Xprinter). The online admin queues the job; the local agent pulls it and prints.
            Keep the bat window open. Settings are stored in this browser.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-navy-border bg-navy px-3 py-1.5 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${agentOk ? 'bg-emerald-400' : agentOk === false ? 'bg-rose-400' : 'bg-amber-400'}`}
          />
          <span className="text-cream">
            {agentOk ? 'Agent online' : agentOk === false ? 'Agent offline' : 'Checking…'}
          </span>
        </div>
      </div>

      {agentError && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {agentError}
        </p>
      )}

      <label className="flex items-start justify-between gap-4 rounded-xl border border-navy-border p-4 cursor-pointer">
        <div>
          <p className="text-sm font-medium text-white">Print on Accept</p>
          <p className="text-xs text-muted mt-1">
            When an order is accepted into Preparing, send cup stickers to the local printer.
          </p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setCupStickerPrintingEnabled(e.target.checked);
            setEnabled(e.target.checked);
          }}
          className="mt-0.5 h-5 w-5 accent-brand shrink-0"
        />
      </label>

      <div>
        <label className="mb-1 block text-xs text-muted">Printer name (Windows printer point)</label>
        <input
          type="text"
          value={printerName}
          onChange={(e) => setPrinterName(e.target.value)}
          onBlur={() => setCupStickerPrinterName(printerName)}
          className="input-field"
          placeholder="Xprinter XP-D35B"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-2 text-[11px] text-muted">
          Must match the exact printer name in Windows Settings → Printers (e.g. Xprinter XP-D35B on USB001).
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onTestPrint()}
          className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
          Test print
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="btn-outline flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Refresh status
        </button>
      </div>
    </div>
  );
}
