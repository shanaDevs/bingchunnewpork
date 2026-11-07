'use client';

import { ChevronRight, Info } from 'lucide-react';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { formatMoney } from '@/lib/receipt';

type Props = {
  balance: number;
  capacity: number;
  healthPercent?: number;
  loading?: boolean;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function healthCopy(percent: number) {
  if (percent >= 70) {
    return {
      label: 'Healthy',
      title: 'Wallet is in a healthy state.',
      detail: 'Sufficient balance to cover upcoming payouts.',
    };
  }
  if (percent >= 40) {
    return {
      label: 'Moderate',
      title: 'Wallet is in a moderate state.',
      detail: 'Balance may need attention before larger payouts.',
    };
  }
  return {
    label: 'Low',
    title: 'Wallet balance is low.',
    detail: 'Inflow is not covering upcoming payouts.',
  };
}

const WHITE = '#ffffff';
const SECONDARY = 'rgba(255,255,255,0.72)';
const MUTED = 'rgba(220,235,255,0.7)';

export default function WalletTankCard({
  balance,
  capacity,
  healthPercent,
  loading = false,
}: Props) {
  const fillPercent = clampPercent(capacity > 0 ? (balance / capacity) * 100 : 0);
  const healthScore = clampPercent(healthPercent ?? fillPercent);
  const health = healthCopy(healthScore);
  const roundedPercent = Math.round(fillPercent);

  return (
    <div
      className="flex h-full min-h-[220px] flex-col overflow-hidden rounded-[12px] lg:min-h-0"
      aria-busy={loading}
      style={{
        padding: 22,
        color: WHITE,
        background: 'linear-gradient(135deg, #082b72 0%, #004fae 45%, #0066e8 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px rgba(8, 43, 114, 0.28)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="m-0 text-[14px] font-semibold leading-none tracking-tight"
            style={{ color: WHITE }}
          >
            Wallet Balance
          </p>
          <p
            className="mt-[3px] mb-0 text-[12px] leading-none"
            style={{ color: MUTED }}
          >
            Total all-time available across branches
          </p>
        </div>
        {loading ? (
          <DashSkel className="branch-dash-skel--on-navy h-5 w-16 rounded-full" />
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
            style={{
              color: WHITE,
              background: 'rgba(0, 0, 0, 0.18)',
              border: '1px solid rgba(125, 185, 255, 0.45)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: '#34d399' }}
              aria-hidden
            />
            {health.label}
            <ChevronRight size={12} strokeWidth={2.5} aria-hidden style={{ color: WHITE, opacity: 0.85 }} />
          </span>
        )}
      </div>

      {loading ? (
        <DashSkel className="branch-dash-skel--on-navy mt-[18px] h-8 w-48 rounded-md" />
      ) : (
        <p
          className="mt-[18px] mb-0 text-[32px] font-semibold tabular-nums tracking-tight"
          style={{ color: WHITE }}
        >
          {formatMoney(balance)}
        </p>
      )}

      <div className="mt-[14px] flex items-center gap-3">
        {loading ? (
          <>
            <DashSkel className="branch-dash-skel--on-navy h-5 min-w-0 flex-1 rounded-full" />
            <DashSkel className="branch-dash-skel--on-navy h-4 w-10 shrink-0 rounded" />
          </>
        ) : (
          <>
            <div
              className="min-w-0 flex-1 overflow-hidden rounded-full"
              style={{
                height: 20,
                background: 'rgba(210, 235, 255, 0.9)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.7)',
              }}
              role="progressbar"
              aria-valuenow={roundedPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Wallet filled to ${roundedPercent} percent`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${fillPercent}%`,
                  background: 'linear-gradient(90deg, #9bd6ff 0%, #3da5ff 45%, #0075ff 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
                }}
              />
            </div>
            <span
              className="shrink-0 text-[13px] font-semibold tabular-nums"
              style={{ color: WHITE }}
            >
              {roundedPercent}%
            </span>
          </>
        )}
      </div>

      <div
        className="mt-4 flex items-center gap-2.5"
        style={{
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(0, 45, 120, 0.35)',
          border: '1px solid rgba(140, 190, 255, 0.22)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {loading ? (
          <>
            <DashSkel className="branch-dash-skel--on-navy h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <DashSkel className="branch-dash-skel--on-navy h-3.5 w-40 max-w-full rounded" />
              <DashSkel className="branch-dash-skel--on-navy mt-1.5 h-3 w-52 max-w-full rounded" />
            </div>
          </>
        ) : (
          <>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: '#3da5ff' }}
            >
              <Info size={14} strokeWidth={2.4} aria-hidden style={{ color: WHITE }} />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-semibold leading-tight" style={{ color: WHITE }}>
                {health.title}
              </p>
              <p className="mt-0.5 mb-0 text-[12px] leading-tight" style={{ color: SECONDARY }}>
                {health.detail}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
