'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  ImagePlus,
  Trash2,
  Type,
} from 'lucide-react';
import type { CardElement } from '@/lib/promotionCardDesign';

interface PromotionCardFormatRibbonProps {
  element: CardElement;
  onUpdate: (patch: Partial<CardElement>) => void;
  onDelete: () => void;
  onReplaceImage?: () => void;
}

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48];

export default function PromotionCardFormatRibbon({
  element,
  onUpdate,
  onDelete,
  onReplaceImage,
}: PromotionCardFormatRibbonProps) {
  const isTextLike = element.type === 'text' || element.type === 'badge' || element.type === 'code';

  return (
    <div className="promo-format-ribbon" role="toolbar" aria-label="Element formatting">
      <div className="promo-format-ribbon__group">
        <span className="promo-format-ribbon__label capitalize">{element.type}</span>
      </div>

      {isTextLike && (
        <>
          <div className="promo-format-ribbon__divider" aria-hidden />

          <div className="promo-format-ribbon__group">
            <select
              className="promo-format-ribbon__select"
              value={element.fontSize ?? 14}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
              title="Font size"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <button
              type="button"
              className={`promo-format-ribbon__btn${element.fontWeight === 'bold' ? ' promo-format-ribbon__btn--active' : ''}`}
              onClick={() => onUpdate({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
              title="Bold"
            >
              <Bold size={15} />
            </button>
            <button
              type="button"
              className={`promo-format-ribbon__btn${element.fontWeight === 'semibold' ? ' promo-format-ribbon__btn--active' : ''}`}
              onClick={() => onUpdate({ fontWeight: element.fontWeight === 'semibold' ? 'normal' : 'semibold' })}
              title="Semibold"
            >
              <Type size={14} />
            </button>
            <label className="promo-format-ribbon__color" title="Text color">
              <input
                type="color"
                value={element.color ?? '#ffffff'}
                onChange={(e) => onUpdate({ color: e.target.value })}
              />
            </label>
          </div>

          <div className="promo-format-ribbon__divider" aria-hidden />

          <div className="promo-format-ribbon__group">
            {(['left', 'center', 'right'] as const).map((align) => {
              const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
              return (
                <button
                  key={align}
                  type="button"
                  className={`promo-format-ribbon__btn${(element.textAlign ?? 'left') === align ? ' promo-format-ribbon__btn--active' : ''}`}
                  onClick={() => onUpdate({ textAlign: align })}
                  title={`Align ${align}`}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {element.type === 'image' && onReplaceImage && (
        <>
          <div className="promo-format-ribbon__divider" aria-hidden />
          <div className="promo-format-ribbon__group">
            <button type="button" className="promo-format-ribbon__btn" onClick={onReplaceImage} title="Replace image">
              <ImagePlus size={15} />
            </button>
          </div>
        </>
      )}

      <div className="promo-format-ribbon__divider" aria-hidden />

      <div className="promo-format-ribbon__group">
        <button
          type="button"
          className="promo-format-ribbon__btn"
          onClick={() => onUpdate({ zIndex: element.zIndex + 1 })}
          title="Bring forward"
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          className="promo-format-ribbon__btn"
          onClick={() => onUpdate({ zIndex: Math.max(0, element.zIndex - 1) })}
          title="Send backward"
        >
          <ArrowDown size={15} />
        </button>
      </div>

      <div className="promo-format-ribbon__spacer" />

      <button
        type="button"
        className="promo-format-ribbon__delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete element"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
}
