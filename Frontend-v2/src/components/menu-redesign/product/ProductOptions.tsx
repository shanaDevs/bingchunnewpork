import { Check, Minus, Plus } from 'lucide-react';
import type { Topping } from '@/types';
import { formatLkr } from '@/components/menu-redesign/lib/formatMenuPrice';
import { cn } from '@/components/home-redesign/lib/cn';
import {
  ICE_LEVELS,
  ICE_LEVEL_LABELS,
  SUGAR_LEVELS,
  SUGAR_LEVEL_LABELS,
  type IceLevel,
  type SugarLevel,
} from '@/lib/drinkOptions';

const focusWithin =
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600';

type ChoiceFieldProps<T extends string> = {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

function ChoiceField<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
  disabled = false,
}: ChoiceFieldProps<T>) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-base font-semibold text-brand-950">{legend}</legend>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:mt-2 lg:gap-1.5" role="radiogroup" aria-label={legend}>
        {options.map((option) => {
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-xl px-2 py-2.5 text-center ring-1 ring-inset transition-[background-color,box-shadow] duration-150',
                focusWithin,
                checked ? 'bg-brand-50 ring-brand-600' : 'bg-white ring-brand-100 hover:bg-brand-50',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name={legend}
                checked={checked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              <span className="text-[0.8125rem] leading-snug font-semibold text-brand-950">
                {labels[option]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type IceLevelFieldProps = {
  value: IceLevel;
  onChange: (value: IceLevel) => void;
  disabled?: boolean;
};

export function IceLevelField({ value, onChange, disabled }: IceLevelFieldProps) {
  return (
    <ChoiceField
      legend="Ice"
      options={ICE_LEVELS}
      labels={ICE_LEVEL_LABELS}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

type SugarLevelFieldProps = {
  value: SugarLevel;
  onChange: (value: SugarLevel) => void;
  disabled?: boolean;
};

export function SugarLevelField({ value, onChange, disabled }: SugarLevelFieldProps) {
  return (
    <ChoiceField
      legend="Sugar"
      options={SUGAR_LEVELS}
      labels={SUGAR_LEVEL_LABELS}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

type ToppingsFieldProps = {
  toppings: Topping[];
  value: Topping[];
  onToggle: (topping: Topping) => void;
};

export function ToppingsField({ toppings, value, onToggle }: ToppingsFieldProps) {
  const selectedIds = new Set(value.map((t) => t.id));
  return (
    <fieldset>
      <legend className="flex w-full items-center justify-between gap-3">
        <span className="text-base font-semibold text-brand-950">Toppings</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-500">
          Optional
        </span>
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:mt-2 lg:gap-1.5">
        {toppings.map((topping) => {
          const checked = selectedIds.has(topping.id);
          return (
            <label
              key={topping.id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 ring-1 ring-inset transition-[background-color,box-shadow] duration-150',
                focusWithin,
                checked ? 'bg-brand-50 ring-brand-600' : 'bg-white ring-brand-100 hover:bg-brand-50',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(topping)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded ring-1 ring-inset transition-colors',
                  checked ? 'bg-brand-600 text-snow ring-brand-600' : 'bg-white ring-brand-300',
                )}
              >
                {checked && <Check className="size-3" strokeWidth={3.5} />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span className="text-[0.8125rem] leading-snug font-semibold text-brand-950">{topping.name}</span>
                <span className="font-numeric text-xs font-semibold whitespace-nowrap text-brand-600 sm:text-[0.8125rem]">
                  +{formatLkr(topping.extraPrice)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  max: number;
  disabled?: boolean;
};

export function QuantityStepper({ value, onChange, max, disabled = false }: QuantityStepperProps) {
  const step =
    'grid size-9 sm:size-10 place-items-center rounded-full text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-brand-600';
  return (
    <div role="group" aria-label="Quantity" className="flex shrink-0 items-center rounded-full bg-white p-1 ring-1 ring-brand-100 ring-inset">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        className={step}
      >
        <Minus className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="font-numeric w-7 text-center text-base font-bold text-brand-950 sm:w-8 sm:text-lg">
        {value}
      </output>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className={step}
      >
        <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
