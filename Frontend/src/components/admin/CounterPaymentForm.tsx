'use client';

import { Banknote, CreditCard } from 'lucide-react';
import { formatMoney } from '@/lib/receipt';

export type CounterPaymentMethod = 'CASH' | 'CARD';

type Props = {
  amountDue: number;
  paymentMethod: CounterPaymentMethod;
  cashReceived: string;
  onPaymentMethodChange: (method: CounterPaymentMethod) => void;
  onCashReceivedChange: (value: string) => void;
  compact?: boolean;
  /** Extra-tight layout for sticky order drawer footer */
  drawer?: boolean;
};

export function counterPaymentValid(
  paymentMethod: CounterPaymentMethod,
  cashReceived: string,
  amountDue: number,
  options?: { requireCashAmount?: boolean },
): boolean {
  if (paymentMethod === 'CARD') return true;
  if (cashReceived === '') return options?.requireCashAmount === false;
  const cashIn = parseFloat(cashReceived) || 0;
  return cashIn >= amountDue;
}

export function toApiPaymentMethod(method: CounterPaymentMethod): 'CASH_AT_COUNTER' | 'CARD' {
  return method === 'CASH' ? 'CASH_AT_COUNTER' : 'CARD';
}

export default function CounterPaymentForm({
  amountDue,
  paymentMethod,
  cashReceived,
  onPaymentMethodChange,
  onCashReceivedChange,
  compact = false,
  drawer = false,
}: Props) {
  const cashIn = parseFloat(cashReceived || '0') || 0;
  const change = cashIn - amountDue;
  const shortfall = paymentMethod === 'CASH' && cashReceived !== '' && change < 0;
  const tight = compact || drawer;
  const btnPy = drawer ? 'py-2' : 'py-2.5';

  return (
    <div className={drawer ? 'space-y-2' : tight ? 'space-y-3' : 'space-y-4'}>
      <div>
        {!drawer && <p className="text-muted mb-2 text-xs">Payment method</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onPaymentMethodChange('CASH')}
            className={`flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${btnPy} ${
              paymentMethod === 'CASH'
                ? 'border-brand bg-brand text-white'
                : 'border-navy-border text-muted hover:text-fg'
            }`}
          >
            <Banknote size={15} />
            Cash
          </button>
          <button
            type="button"
            onClick={() => onPaymentMethodChange('CARD')}
            className={`flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${btnPy} ${
              paymentMethod === 'CARD'
                ? 'border-brand bg-brand text-white'
                : 'border-navy-border text-muted hover:text-fg'
            }`}
          >
            <CreditCard size={15} />
            Card
          </button>
        </div>
      </div>

      {paymentMethod === 'CASH' ? (
        <div className="grid grid-cols-2 gap-2 items-stretch">
          <div className="min-w-0">
            <label htmlFor="counter-cash-received" className="text-muted mb-1.5 block text-xs">
              Cash received
            </label>
            <input
              id="counter-cash-received"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={cashReceived}
              onChange={(e) => onCashReceivedChange(e.target.value)}
              className="input-field w-full h-[42px]"
            />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="text-muted mb-1.5 block text-xs">Change</span>
            <div
              className={`flex flex-1 min-h-[42px] items-center justify-between rounded-lg border px-3 ${
                cashReceived === ''
                  ? 'border-navy-border bg-navy-light/40'
                  : shortfall
                    ? 'border-red-500/30 bg-red-500/10'
                    : 'border-green-500/30 bg-green-500/10'
              }`}
            >
              <span className="sr-only">Change</span>
              <span
                className={`ml-auto font-bold tabular-nums ${
                  drawer ? 'text-lg' : compact ? 'text-xl' : 'text-2xl'
                } ${
                  cashReceived === ''
                    ? 'text-muted'
                    : shortfall
                      ? 'text-red-400'
                      : 'text-green-400'
                }`}
              >
                {cashReceived === '' ? '—' : formatMoney(Math.abs(change))}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
