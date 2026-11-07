'use client';

export type CardDesignMode = 'standard' | 'banner';

const MODES: { id: CardDesignMode; label: string }[] = [
  { id: 'standard', label: 'Card Designer' },
  { id: 'banner', label: 'Upload Banner' },
];

export function cardDesignModeFromKind(kind: string): CardDesignMode {
  if (kind === 'UPLOAD_BANNER') return 'banner';
  return 'standard';
}

interface PromotionCardDesignModePickerProps {
  mode: CardDesignMode;
  onChange: (mode: CardDesignMode) => void;
}

export default function PromotionCardDesignModePicker({
  mode,
  onChange,
}: PromotionCardDesignModePickerProps) {
  return (
    <div className="promo-card-design-mode card p-4">
      <h4 className="promo-criteria__group-title">Display Based</h4>
      <div className="promo-type-selector__grid promo-type-selector__grid--compact promo-type-selector__grid--design">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`promo-type-selector__option promo-type-selector__option--compact${mode === item.id ? ' promo-type-selector__option--active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="promo-type-selector__option-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
