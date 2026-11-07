'use client';

import { adminAuthHeaders, withAdminCredentials } from '@/lib/adminSession';
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface SettleInfo {
  lastSettledAt: string | null;
  minFromDate: string | null;
  suggestedFrom: string;
  suggestedTo: string;
  unsettledBalance: number;
  currentBalance: number;
}

interface SettlePreview {
  amount: number;
  orderCount: number;
}

function fmt(cents: number) {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function fmtDay(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-LK', { dateStyle: 'medium' });
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-navy-border, #334155)',
  background: 'var(--color-input-bg)',
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export default function WalletSettleModal({
  storeId,
  branchName,
  open,
  onClose,
  onSettled,
  apiBase,
}: {
  storeId: string;
  branchName: string;
  open: boolean;
  onClose: () => void;
  onSettled: () => void;
  apiBase: string;
}) {
  const [settleInfo, setSettleInfo] = useState<SettleInfo | null>(null);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [preview, setPreview] = useState<SettlePreview | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const loadInfo = useCallback(async () => {
    setInfoLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${apiBase}/admin/wallet/${storeId}/settle-info`,
        withAdminCredentials(),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load settlement info');
      const info = json.data as SettleInfo;
      setSettleInfo(info);
      setSettleFrom(info.suggestedFrom);
      setSettleTo(info.suggestedTo);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settlement info');
    } finally {
      setInfoLoading(false);
    }
  }, [apiBase, storeId]);

  const loadPreview = useCallback(async (from: string, to: string) => {
    if (!from || !to || from > to) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/admin/wallet/${storeId}/settle-preview?from=${from}&to=${to}`,
        withAdminCredentials(),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to preview settlement');
      setPreview(json.data as SettlePreview);
      setError('');
    } catch (e: unknown) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'Failed to preview settlement');
    } finally {
      setPreviewLoading(false);
    }
  }, [apiBase, storeId]);

  useEffect(() => {
    if (!open) return;
    setSettleInfo(null);
    setPreview(null);
    loadInfo();
  }, [open, loadInfo]);

  useEffect(() => {
    if (!open || !settleFrom || !settleTo) return;
    const timer = setTimeout(() => loadPreview(settleFrom, settleTo), 250);
    return () => clearTimeout(timer);
  }, [open, settleFrom, settleTo, loadPreview]);

  const confirmSettle = async () => {
    if (!settleFrom || !settleTo || !preview || preview.amount <= 0) return;

    setSettling(true);
    setError('');
    try {
      const res = await fetch(
        `${apiBase}/admin/wallet/${storeId}/settle`,
        withAdminCredentials({
          method: 'POST',
          headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
          from: settleFrom,
          to: settleTo,
          description: `Settlement ${settleFrom} to ${settleTo} — ${preview.orderCount} order(s)`,
          password: pin,
        }),
        }),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Settlement failed');
      onSettled();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Settlement failed');
    } finally {
      setSettling(false);
    }
  };

  if (!open) return null;

  const minFrom = settleInfo?.minFromDate ?? undefined;
  const canConfirm = !settling && !infoLoading && !previewLoading && !!preview && preview.amount > 0 && pin.trim().length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000080', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: 'var(--color-navy-card, #1e293b)', border: '1px solid var(--color-navy-border, #334155)', borderRadius: 18, padding: '1.5rem', width: '100%', maxWidth: 480, margin: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 17, margin: 0 }}>Settle Payables</h3>
          <button onClick={onClose} disabled={settling} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: settling ? 'not-allowed' : 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#7f1d1d30', border: '1px solid #7f1d1d', color: '#fca5a5', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Select a date range to settle online payments for <strong style={{ color: 'var(--color-text)' }}>{branchName}</strong>.
          </p>

          {settleInfo?.lastSettledAt && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--color-navy, #0f172a)', border: '1px solid var(--color-navy-border, #334155)' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: 0 }}>
                Last settled through: <strong style={{ color: 'var(--color-text)' }}>{fmtDay(settleInfo.lastSettledAt)}</strong>
              </p>
              {minFrom && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: '6px 0 0' }}>
                  Next range must start from: <strong style={{ color: '#4ade80' }}>{minFrom}</strong>
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input
                type="date"
                value={settleFrom}
                min={minFrom}
                max={settleTo || undefined}
                disabled={infoLoading || settling}
                onChange={(e) => setSettleFrom(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input
                type="date"
                value={settleTo}
                min={settleFrom || minFrom}
                disabled={infoLoading || settling}
                onChange={(e) => setSettleTo(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ padding: '14px 16px', borderRadius: 12, background: '#22c55e15', border: '1px solid #22c55e40' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Amount in selected range
            </p>
            <p style={{ color: '#4ade80', fontSize: 24, fontWeight: 700, margin: 0 }}>
              {infoLoading || previewLoading ? '—' : preview ? fmt(preview.amount) : fmt(0)}
            </p>
            {preview && preview.orderCount > 0 && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: '8px 0 0' }}>
                {preview.orderCount} unsettled order{preview.orderCount !== 1 ? 's' : ''} in range
              </p>
            )}
            {preview && preview.orderCount === 0 && !previewLoading && (
              <p style={{ color: '#f59e0b', fontSize: 12, margin: '8px 0 0' }}>
                No unsettled payments in this date range
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Admin PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={settling}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--color-navy-border, #334155)', background: 'transparent', color: 'var(--color-text-muted)', cursor: settling ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={confirmSettle}
            disabled={!canConfirm}
            style={{ flex: 2, padding: '10px', borderRadius: 10, background: '#22c55e', color: '#fff', border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: canConfirm ? 1 : 0.5 }}
          >
            {settling ? 'Settling...' : 'Confirm Settlement'}
          </button>
        </div>
      </div>
    </div>
  );
}
