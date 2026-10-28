'use client';

const TONE_CLASS: Record<string, string> = {
  blue: 'text-blue-500',
  green: 'text-emerald-500',
  rose: 'text-rose-500',
  red: 'text-rose-500',
};

type Props = {
  label: string;
  value: string;
  prefix?: string;
  tone?: string;
  toneClass?: string;
};

export function ReportFooterTotalCell({
  label,
  value,
  prefix,
  tone,
  toneClass,
}: Props) {
  const valueClass = toneClass ?? (tone ? TONE_CLASS[tone] ?? 'text-fg' : 'text-fg');
  const showPrefix = prefix != null && prefix !== '';

  return (
    <td className="text-right align-top">
      <div className="w-full min-w-[6rem] text-right">
        <div className="text-xs font-bold uppercase tracking-wide text-fg">{label}</div>
        <div className={`mt-1 text-lg font-extrabold whitespace-nowrap ${valueClass}`}>
          {showPrefix && (
            <span className="text-[10px] font-bold align-baseline text-muted opacity-90">{prefix} </span>
          )}
          {value}
        </div>
      </div>
    </td>
  );
}
