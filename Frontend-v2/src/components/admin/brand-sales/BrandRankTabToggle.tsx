'use client';

type Props = {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
};

export default function BrandRankTabToggle({ options, value, onChange }: Props) {
  return (
    <div className="grid w-full grid-cols-2 gap-1">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-md px-2 py-2 text-xs font-medium ${
              active ? 'bg-[#307ef2] text-white' : 'bg-[#307ef2]/10 text-fg'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
