'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminSession } from '@/lib/adminAuth';
import {
  cupStickerAgentHealth,
  fetchCupStickerPrinterSettings,
  isCupStickerPrintingEnabled,
  printCupStickerTest,
  saveCupStickerPrinterSettings,
  setCupStickerPrintingEnabled,
} from '@/lib/cupStickerPrint';

/** Cashier control for the local Xprinter cup-sticker agent (branch system setting). */
export default function CupStickerPrinterPanel({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [printerName, setPrinterName] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const isDesktopApp =
    typeof window !== 'undefined' && Boolean(window.bingchunCashier?.isDesktop);

  const refresh = useCallback(async () => {
    setEnabled(isCupStickerPrintingEnabled());
    const session = getAdminSession();
    setStoreId(session?.storeId ?? null);
    if (typeof window !== 'undefined' && window.bingchunCashier?.isDesktop) {
      try {
        const cfg = await window.bingchunCashier.getConfig();
        if (cfg.printerName) setPrinterName(cfg.printerName);
      } catch {
        // ignore
      }
    } else {
      try {
        const settings = await fetchCupStickerPrinterSettings(session?.storeId);
        setPrinterName(settings.printerName);
        setStoreId(settings.storeId);
      } catch {
        // Keep local field if settings API is briefly unavailable.
      }
    }
    const health = await cupStickerAgentHealth();
    setAgentOk(health.ok);
    setAgentError(health.ok ? null : health.error || 'Agent offline');
    if (health.printer) setPrinterName(health.printer);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function persistPrinterName(next: string) {
    const trimmed = next.trim();
    setSaving(true);
    try {
      if (window.bingchunCashier?.isDesktop) {
        await window.bingchunCashier.setConfig({ printerName: trimmed });
        setPrinterName(trimmed);
        toast.success('Desktop printer saved');
      } else {
        const saved = await saveCupStickerPrinterSettings(trimmed, storeId);
        setPrinterName(saved.printerName);
        setStoreId(saved.storeId);
        toast.success('Branch printer name saved');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save printer name';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onTestPrint() {
    setBusy(true);
    try {
      const trimmed = printerName.trim();
      if (trimmed) {
        if (window.bingchunCashier?.isDesktop) {
          await window.bingchunCashier.setConfig({ printerName: trimmed });
        } else {
          await saveCupStickerPrinterSettings(trimmed, storeId);
        }
      }
      await printCupStickerTest();
      toast.success(
        isDesktopApp ? 'Test sticker sent via Electron printer' : 'Test sticker sent to printer',
      );
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
          On Accept, prints one sticker per cup.{' '}
          {isDesktopApp ? (
            <>
              Uses the printer from <strong>Cashier → Printer &amp; Settings</strong> (direct Electron
              print).
            </>
          ) : (
            <>
              Run <code className="text-cream/80">tools/cup-sticker-agent/start.bat</code> on this PC.
            </>
          )}
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
          onBlur={() => void persistPrinterName(printerName)}
          className="mb-2 w-full rounded-lg border border-navy-border bg-navy px-2.5 py-1.5 text-xs text-cream"
          placeholder="Windows printer name for this branch"
        />
        <button
          type="button"
          disabled={busy || saving}
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
            {isDesktopApp ? (
              <>
                You are in the Bing Chun Cashier desktop app. Stickers print directly to the printer
                chosen under <strong>Cashier → Printer &amp; Settings</strong> — no agent redirect.
                Use <strong>Test print</strong> here or the menu <strong>Test sticker print</strong>.
              </>
            ) : (
              <>
                Printer name is a branch system setting (each store can use a different Windows queue
                name). Run <code className="text-cream/80">tools/cup-sticker-agent/start.bat</code> on
                this cashier PC (USB sticker printer). The online admin queues the job; the local agent
                pulls it and prints. Keep the bat window open.
              </>
            )}
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
        <label className="mb-1 block text-xs text-muted">Printer name (Windows printer point for this branch)</label>
        <input
          type="text"
          value={printerName}
          onChange={(e) => setPrinterName(e.target.value)}
          onBlur={() => void persistPrinterName(printerName)}
          className="input-field"
          placeholder="e.g. bingchun or Xprinter XP-D35B"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-2 text-[11px] text-muted">
          Saved on this branch in system settings. Must match the exact name in Windows Settings → Printers
          on the cashier PC. Run <code className="text-cream/80">Get-Printer</code> if unsure.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || saving}
          onClick={() => void onTestPrint()}
          className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
          Test print
        </button>
        <button
          type="button"
          disabled={busy || saving}
          onClick={() => void refresh()}
          className="btn-outline flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Refresh status
        </button>
      </div>
    </div>
  );
}
