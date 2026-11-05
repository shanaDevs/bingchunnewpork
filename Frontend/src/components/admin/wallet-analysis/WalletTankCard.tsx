'use client';

import type { ReactNode } from 'react';
import { ChevronRight, Layers, Monitor } from 'lucide-react';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import type { WalletAnalysisExcludedFees } from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import { formatMoney } from '@/lib/receipt';

type Props = {
  balance: number;
  onlineAvailableBalance?: number;
  capacity: number;
  healthPercent?: number;
  excludedFees?: WalletAnalysisExcludedFees;
  loading?: boolean;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function healthLabel(percent: number) {
  if (percent >= 70) return 'Healthy';
  if (percent >= 40) return 'Moderate';
  return 'Low';
}

const WHITE = '#ffffff';
const SECONDARY = 'rgba(255,255,255,0.72)';
const MUTED = 'rgba(220,235,255,0.7)';

function BlinkingStatusDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`wallet-tank-blink-dot h-1.5 w-1.5 shrink-0 rounded-full ${className}`.trim()}
      style={{ background: '#34d399' }}
      aria-hidden
    />
  );
}

function BalanceMetric({
  icon: Icon,
  label,
  amount,
  footer,
  loading,
  blinkLabelDot = false,
}: {
  icon: typeof Layers;
  label: string;
  amount: string;
  footer?: ReactNode;
  loading?: boolean;
  blinkLabelDot?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5">
        <Icon size={14} strokeWidth={2.25} aria-hidden style={{ color: WHITE, opacity: 0.92 }} />
        {blinkLabelDot ? <BlinkingStatusDot /> : null}
        <p className="m-0 text-[11px] font-medium leading-tight" style={{ color: MUTED }}>
          {label}
        </p>
      </div>
      {loading ? (
        <DashSkel className="branch-dash-skel--on-navy mt-2 h-7 w-full max-w-[9rem] rounded-md" />
      ) : (
        <p
          className="mt-1.5 mb-0 truncate text-[19px] font-bold tabular-nums leading-tight tracking-tight sm:text-[21px]"
          style={{ color: WHITE }}
          title={amount}
        >
          {amount}
        </p>
      )}
      {footer}
    </div>
  );
}

export default function WalletTankCard({
  balance,
  onlineAvailableBalance = 0,
  capacity,
  healthPercent,
  excludedFees,
  loading = false,
}: Props) {
  const fillPercent = clampPercent(capacity > 0 ? (balance / capacity) * 100 : 0);
  const healthScore = clampPercent(healthPercent ?? fillPercent);
  const roundedPercent = Math.round(fillPercent);
  const deliveryFee = excludedFees?.deliveryFee ?? 0;
  const convenienceFee = excludedFees?.convenienceFee ?? 0;

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
            {healthLabel(healthScore)}
            <ChevronRight size={12} strokeWidth={2.5} aria-hidden style={{ color: WHITE, opacity: 0.85 }} />
          </span>
        )}
      </div>

      <style>{`
        @keyframes wallet-tank-blink-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.92); }
        }
        .wallet-tank-blink-dot {
          animation: wallet-tank-blink-dot 1.15s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .wallet-tank-blink-dot {
            animation: none;
          }
        }
      `}</style>

      <div className="mt-[14px] flex min-h-[64px] items-stretch gap-3 pb-0">
        <BalanceMetric
          icon={Layers}
          label="Total Wallet Balance"
          amount={formatMoney(balance)}
          loading={loading}
        />
        <div
          className="w-px shrink-0 self-stretch"
          style={{ background: 'rgba(255,255,255,0.22)' }}
          aria-hidden
        />
        <BalanceMetric
          icon={Monitor}
          label="Online Available Balance"
          amount={formatMoney(onlineAvailableBalance)}
          loading={loading}
          blinkLabelDot
        />
      </div>

      <div className="mt-2 flex items-center gap-3">
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
        className="mt-2.5 grid grid-cols-2 gap-2"
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
            <DashSkel className="branch-dash-skel--on-navy h-10 w-full rounded-md" />
            <DashSkel className="branch-dash-skel--on-navy h-10 w-full rounded-md" />
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-medium leading-tight" style={{ color: MUTED }}>
                Delivery fee
              </p>
              <p
                className="mt-1 mb-0 truncate text-[14px] font-semibold tabular-nums leading-tight"
                style={{ color: WHITE }}
              >
                {formatMoney(deliveryFee)}
              </p>
              <p className="mt-0.5 mb-0 text-[10px] leading-tight" style={{ color: SECONDARY }}>
                All-time · excluded from balance
              </p>
            </div>
            <div className="min-w-0 border-l border-white/15 pl-3">
              <p className="m-0 text-[11px] font-medium leading-tight" style={{ color: MUTED }}>
                Convenience fee
              </p>
              <p
                className="mt-1 mb-0 truncate text-[14px] font-semibold tabular-nums leading-tight"
                style={{ color: WHITE }}
              >
                {formatMoney(convenienceFee)}
              </p>
              <p className="mt-0.5 mb-0 text-[10px] leading-tight" style={{ color: SECONDARY }}>
                All-time · excluded from balance
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
