'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { GripVertical, Trash2 } from 'lucide-react';
import type { CardElement, PromotionCardDesign } from '@/lib/promotionCardDesign';
import {
  CANVAS_SELECTION_ID,
  getCanvasSize,
  getElementPosition,
} from '@/lib/promotionCardDesign';

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface PromotionCardPreviewProps {
  design: PromotionCardDesign;
  orientation: 'landscape' | 'portrait';
  themeMode?: 'dark' | 'light';
  interactive?: boolean;
  /** Full editor: resize, inline text, drag handle, in-card delete */
  editorMode?: boolean;
  /** fixed = exact px size (editor); responsive = scale to fit container (previews) */
  sizeMode?: 'fixed' | 'responsive';
  /** Max height when sizeMode is responsive — keeps aspect ratio via scale transform */
  previewMaxHeight?: number;
  selectedElementId?: string | null;
  editingElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onEditingElementId?: (id: string | null) => void;
  onDragElement?: (id: string, x: number, y: number, orientation: 'landscape' | 'portrait') => void;
  onResizeElement?: (
    id: string,
    patch: Partial<Pick<CardElement, 'x' | 'y' | 'width' | 'height'>>,
    orientation: 'landscape' | 'portrait',
  ) => void;
  onUpdateElement?: (id: string, patch: Partial<CardElement>) => void;
  onDeleteElement?: (id: string) => void;
  onResizeCanvas?: (
    patch: { width?: number; height?: number },
    orientation: 'landscape' | 'portrait',
  ) => void;
  className?: string;
}

function textStyleFor(el: CardElement): React.CSSProperties {
  return {
    fontSize: el.fontSize ? `${el.fontSize}px` : undefined,
    fontWeight: el.fontWeight === 'bold' ? 700 : el.fontWeight === 'semibold' ? 600 : 400,
    color: el.color ?? '#fff',
    textAlign: el.textAlign ?? 'left',
  };
}

export default function PromotionCardPreview({
  design,
  orientation,
  themeMode = 'dark',
  interactive = false,
  editorMode = false,
  sizeMode,
  previewMaxHeight,
  selectedElementId,
  editingElementId,
  onSelectElement,
  onEditingElementId,
  onDragElement,
  onResizeElement,
  onUpdateElement,
  onDeleteElement,
  onResizeCanvas,
  className = '',
}: PromotionCardPreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const sorted = [...design.elements].sort((a, b) => a.zIndex - b.zIndex);
  const canvasSize = getCanvasSize(design, orientation);
  const isCanvasSelected = selectedElementId === CANVAS_SELECTION_ID;
  const useFixedSize = sizeMode === 'fixed' || (sizeMode == null && editorMode);
  const [previewScale, setPreviewScale] = useState(1);

  const bgImage =
    design.backgroundImage ||
    sorted.find((e) => e.type === 'image' && design.layoutPreset === 'background-image')?.content;

  const canEdit = interactive && editorMode;

  const maxPreviewHeight =
    previewMaxHeight ?? (orientation === 'portrait' ? 160 : 110);

  useEffect(() => {
    if (useFixedSize) return;

    const container = scalerRef.current;
    if (!container) return;

    function updateScale() {
      const maxW = container!.clientWidth || canvasSize.width;
      const scaleW = maxW / canvasSize.width;
      const scaleH = maxPreviewHeight / canvasSize.height;
      setPreviewScale(Math.min(scaleW, scaleH, 1));
    }

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(container);
    return () => ro.disconnect();
  }, [useFixedSize, canvasSize.width, canvasSize.height, maxPreviewHeight]);

  useEffect(() => {
    if (!canEdit || !selectedElementId || selectedElementId === CANVAS_SELECTION_ID) return;
    const elementId = selectedElementId;
    function onKeyDown(e: KeyboardEvent) {
      if (editingElementId) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteElement?.(elementId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit, selectedElementId, editingElementId, onDeleteElement]);

  function getCanvasRect() {
    return canvasRef.current?.getBoundingClientRect() ?? null;
  }

  function handleDragPointerDown(e: React.PointerEvent, el: CardElement) {
    if (!canEdit || !onDragElement || editingElementId === el.id) return;
    const dragElement = onDragElement;
    e.preventDefault();
    e.stopPropagation();
    onSelectElement?.(el.id);

    const rect = getCanvasRect();
    if (!rect) return;
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    const startX = e.clientX;
    const startY = e.clientY;
    const pos = getElementPosition(el, orientation);
    const originX = pos.x;
    const originY = pos.y;

    function onMove(ev: PointerEvent) {
      const dx = ((ev.clientX - startX) / canvasWidth) * 100;
      const dy = ((ev.clientY - startY) / canvasHeight) * 100;
      const nextX = Math.max(0, Math.min(100 - pos.width, originX + dx));
      const nextY = Math.max(0, Math.min(100 - pos.height, originY + dy));
      dragElement(el.id, nextX, nextY, orientation);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleResizePointerDown(e: React.PointerEvent, el: CardElement, corner: ResizeCorner) {
    if (!canEdit || !onResizeElement) return;
    const resizeElement = onResizeElement;
    e.preventDefault();
    e.stopPropagation();
    onSelectElement?.(el.id);

    const rect = getCanvasRect();
    if (!rect) return;
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    const startX = e.clientX;
    const startY = e.clientY;
    const pos = getElementPosition(el, orientation);
    const origin = { x: pos.x, y: pos.y, width: pos.width, height: pos.height };

    function onMove(ev: PointerEvent) {
      const dx = ((ev.clientX - startX) / canvasWidth) * 100;
      const dy = ((ev.clientY - startY) / canvasHeight) * 100;

      let { x, y, width, height } = origin;

      if (corner.includes('e')) width = Math.max(5, Math.min(100 - origin.x, origin.width + dx));
      if (corner.includes('w')) {
        const nextW = Math.max(5, origin.width - dx);
        x = Math.max(0, origin.x + origin.width - nextW);
        width = nextW;
      }
      if (corner.includes('s')) height = Math.max(5, Math.min(100 - origin.y, origin.height + dy));
      if (corner.includes('n')) {
        const nextH = Math.max(5, origin.height - dy);
        y = Math.max(0, origin.y + origin.height - nextH);
        height = nextH;
      }

      resizeElement(el.id, { x, y, width, height }, orientation);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleCanvasResizePointerDown(e: React.PointerEvent, corner: ResizeCorner) {
    if (!canEdit || !onResizeCanvas) return;
    const resizeCanvas = onResizeCanvas;
    e.preventDefault();
    e.stopPropagation();
    onSelectElement?.(CANVAS_SELECTION_ID);

    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { width: canvasSize.width, height: canvasSize.height };

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let width = origin.width;
      let height = origin.height;

      if (corner.includes('e')) width = Math.max(160, Math.min(900, origin.width + dx));
      if (corner.includes('w')) width = Math.max(160, Math.min(900, origin.width - dx));
      if (corner.includes('s')) height = Math.max(60, Math.min(500, origin.height + dy));
      if (corner.includes('n')) height = Math.max(60, Math.min(500, origin.height - dy));

      resizeCanvas({ width, height }, orientation);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function renderElementContent(el: CardElement) {
    const isEditing = editingElementId === el.id;
    const isTextLike = el.type === 'text' || el.type === 'badge' || el.type === 'code';

    if (el.type === 'image') {
      return el.content ? (
        <Image src={el.content} alt="" fill className="promo-card-preview__img" unoptimized sizes="400px" />
      ) : (
        <div className="promo-card-preview__img-placeholder">Image</div>
      );
    }

    if (isEditing && isTextLike && canEdit) {
      return (
        <textarea
          className="promo-card-preview__inline-edit"
          value={el.content}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onUpdateElement?.(el.id, { content: e.target.value })}
          onBlur={() => onEditingElementId?.(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onEditingElementId?.(null);
            }
            e.stopPropagation();
          }}
          style={textStyleFor(el)}
        />
      );
    }

    const textStyle = textStyleFor(el);

    if (el.type === 'badge') {
      return (
        <span
          className="promo-card-preview__badge-text"
          style={{
            ...textStyle,
            color: el.color ?? design.accentColor,
            borderColor: `${el.color ?? design.accentColor}55`,
          }}
          onDoubleClick={(e) => {
            if (!canEdit) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
            onEditingElementId?.(el.id);
          }}
        >
          {el.content}
        </span>
      );
    }

    if (el.type === 'code') {
      return (
        <span
          className="promo-card-preview__code"
          style={textStyle}
          onDoubleClick={(e) => {
            if (!canEdit) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
            onEditingElementId?.(el.id);
          }}
        >
          {el.content}
        </span>
      );
    }

    return (
      <span
        className="promo-card-preview__text"
        style={textStyle}
        onDoubleClick={(e) => {
          if (!canEdit) return;
          e.stopPropagation();
          onSelectElement?.(el.id);
          onEditingElementId?.(el.id);
        }}
      >
        {el.content}
      </span>
    );
  }

  function renderCanvas(wrapStyle: React.CSSProperties) {
    return (
      <div
        className={`promo-card-preview promo-card-preview--${orientation}${editorMode ? ' promo-card-preview--editor' : ''} ${className}`.trim()}
        onClick={() => interactive && onSelectElement?.(CANVAS_SELECTION_ID)}
      >
        <div
          className={[
            'promo-card-preview__canvas-wrap',
            editorMode ? 'promo-card-preview__canvas-wrap--editor' : '',
            isCanvasSelected ? 'promo-card-preview__canvas-wrap--selected' : '',
          ].filter(Boolean).join(' ')}
          style={wrapStyle}
          onClick={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            onSelectElement?.(CANVAS_SELECTION_ID);
          }}
        >
          {canEdit && isCanvasSelected && (
            <>
              {(['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => (
                <div
                  key={`canvas-${corner}`}
                  className={`promo-card-preview__resize-handle promo-card-preview__resize-handle--${corner}`}
                  onPointerDown={(e) => handleCanvasResizePointerDown(e, corner)}
                />
              ))}
            </>
          )}
          <div
            ref={canvasRef}
            className={`promo-card-preview__canvas${editorMode ? ' promo-card-preview__canvas--editor' : ''}`}
            style={{
              backgroundColor: design.backgroundColor,
              backgroundImage: design.layoutPreset === 'background-image' && bgImage ? `url(${bgImage})` : undefined,
              width: canvasSize.width,
              height: canvasSize.height,
            }}
          >
            {sorted.map((el) => {
              const pos = getElementPosition(el, orientation);
              const isSelected = selectedElementId === el.id;

              return (
                <div
                  key={`${el.id}-${orientation}-${themeMode}`}
                  className={[
                    'promo-card-preview__draggable',
                    interactive ? 'promo-card-preview__draggable--interactive' : '',
                    isSelected ? 'promo-card-preview__draggable--selected' : '',
                    editorMode && isSelected ? 'promo-card-preview__draggable--editor-selected' : '',
                    el.type === 'badge' ? 'promo-card-preview__draggable--badge' : '',
                    el.type === 'code' ? 'promo-card-preview__draggable--code' : '',
                    el.type === 'image' ? 'promo-card-preview__draggable--image' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${pos.width}%`,
                    height: `${pos.height}%`,
                    zIndex: el.zIndex + (isSelected ? 10 : 0),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectElement?.(el.id);
                  }}
                >
                  {canEdit && isSelected && (
                    <>
                      <div
                        className="promo-card-preview__drag-handle"
                        onPointerDown={(e) => handleDragPointerDown(e, el)}
                        title="Drag to move"
                      >
                        <GripVertical size={12} />
                      </div>
                      <button
                        type="button"
                        className="promo-card-preview__el-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteElement?.(el.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                      {(['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => (
                        <div
                          key={corner}
                          className={`promo-card-preview__resize-handle promo-card-preview__resize-handle--${corner}`}
                          onPointerDown={(e) => handleResizePointerDown(e, el, corner)}
                        />
                      ))}
                    </>
                  )}

                  <div className={`promo-card-preview__el promo-card-preview__el--${el.type}`}>
                    {renderElementContent(el)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const scaledWidth = canvasSize.width * previewScale;
  const scaledHeight = canvasSize.height * previewScale;

  return (
    <div
      className={[
        'promo-card-preview-frame',
        `promo-card-preview-frame--${themeMode}`,
        editorMode ? 'promo-card-preview-frame--editor' : '',
        useFixedSize ? 'promo-card-preview-frame--fit' : 'promo-card-preview-frame--responsive',
        `promo-card-preview-frame--${orientation}`,
      ].filter(Boolean).join(' ')}
      data-theme={themeMode}
      data-orientation={orientation}
    >
      <div className="promo-card-preview-frame__chrome">
        <span className={`promo-card-preview-frame__dot promo-card-preview-frame__dot--${themeMode}`} aria-hidden />
        {editorMode
          ? `${orientation === 'landscape' ? 'Landscape' : 'Portrait'} editor`
          : `${orientation === 'landscape' ? 'Landscape' : 'Portrait'} · ${themeMode === 'dark' ? 'Dark' : 'Light'}`}
        {editorMode && (
          <span className="promo-card-preview-frame__hint">
            Click card · Double-click text · Drag · Resize corners
          </span>
        )}
      </div>
      <div className="promo-card-preview-frame__body">
        {useFixedSize ? (
          renderCanvas({
            width: canvasSize.width,
            height: canvasSize.height,
          })
        ) : (
          <div
            ref={scalerRef}
            className="promo-card-preview-scaler"
            style={{ height: scaledHeight }}
          >
            <div
              className="promo-card-preview-scaler__slot"
              style={{ width: scaledWidth, height: scaledHeight }}
            >
              <div
                className="promo-card-preview-scaler__inner"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `scale(${previewScale})`,
                }}
              >
                {renderCanvas({
                  width: canvasSize.width,
                  height: canvasSize.height,
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
