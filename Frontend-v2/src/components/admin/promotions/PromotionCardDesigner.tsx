'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  LayoutTemplate,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadPromoImage } from '@/lib/promoImageUpload';
import type {
  CardElement,
  CardLayoutPreset,
  PromotionCardDesign,
  PromotionCardDesignSet,
  PromotionCardSource,
} from '@/lib/promotionCardDesign';
import {
  CANVAS_SELECTION_ID,
  DEFAULT_LANDSCAPE_CANVAS,
  DEFAULT_PORTRAIT_CANVAS,
  LAYOUT_PRESETS,
  applyLayoutPreset,
  createElementId,
  defaultCardDesignSet,
  getCanvasSize,
  getElementPosition,
  syncCardDesignSetFromPromotion,
} from '@/lib/promotionCardDesign';
import PromotionCardPreview from '@/components/admin/promotions/PromotionCardPreview';
import PromotionCardFormatRibbon from '@/components/admin/promotions/PromotionCardFormatRibbon';

type ThemeMode = 'dark' | 'light';

interface PromotionCardDesignerProps {
  designSet: PromotionCardDesignSet;
  promoCode: string;
  promotionSource?: PromotionCardSource;
  onChange: (
    next: PromotionCardDesignSet | ((prev: PromotionCardDesignSet) => PromotionCardDesignSet),
  ) => void;
  onSyncFromSetup?: () => void;
}

export default function PromotionCardDesigner({
  designSet,
  promoCode,
  promotionSource,
  onChange,
  onSyncFromSetup,
}: PromotionCardDesignerProps) {
  const [activeTheme, setActiveTheme] = useState<ThemeMode>('dark');
  const [activeEditOrientation, setActiveEditOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const design = designSet[activeTheme];
  const selected = selectedId && selectedId !== CANVAS_SELECTION_ID
    ? design.elements.find((e) => e.id === selectedId) ?? null
    : null;
  const landscapeCanvas = getCanvasSize(design, 'landscape');
  const portraitCanvas = getCanvasSize(design, 'portrait');
  const selectedPos = selected ? getElementPosition(selected, activeEditOrientation) : null;

  function switchTheme(theme: ThemeMode) {
    setActiveTheme(theme);
    if (theme !== activeTheme) {
      setSelectedId(null);
      setEditingId(null);
    }
  }

  useEffect(() => {
    if (selectedId && !design.elements.some((e) => e.id === selectedId)) {
      setSelectedId(null);
      setEditingId(null);
    }
  }, [design.elements, selectedId]);

  function applyChange(
    updater: PromotionCardDesignSet | ((prev: PromotionCardDesignSet) => PromotionCardDesignSet),
  ) {
    onChange(updater);
  }

  function updateThemeDesign(
    theme: ThemeMode,
    updater: PromotionCardDesign | ((prev: PromotionCardDesign) => PromotionCardDesign),
  ) {
    applyChange((prevSet) => ({
      ...prevSet,
      [theme]: typeof updater === 'function' ? updater(prevSet[theme]) : updater,
    }));
  }

  function updateDesign(updater: PromotionCardDesign | ((prev: PromotionCardDesign) => PromotionCardDesign)) {
    updateThemeDesign(activeTheme, updater);
  }

  function updateElement(id: string, patch: Partial<CardElement>) {
    updateDesign((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
  }

  function handlePreset(preset: CardLayoutPreset) {
    updateDesign((prev) => applyLayoutPreset(prev, preset));
  }

  function handleCanvasResize(
    patch: { width?: number; height?: number },
    orientation: 'landscape' | 'portrait',
    theme: ThemeMode = activeTheme,
  ) {
    updateThemeDesign(theme, (prev) => {
      const base = prev.canvasSize ?? {
        width: DEFAULT_LANDSCAPE_CANVAS.width,
        height: DEFAULT_LANDSCAPE_CANVAS.height,
        portrait: { ...DEFAULT_PORTRAIT_CANVAS },
      };
      if (orientation === 'portrait') {
        return {
          ...prev,
          canvasSize: {
            ...base,
            portrait: {
              width: patch.width ?? base.portrait?.width ?? DEFAULT_PORTRAIT_CANVAS.width,
              height: patch.height ?? base.portrait?.height ?? DEFAULT_PORTRAIT_CANVAS.height,
            },
          },
        };
      }
      return {
        ...prev,
        canvasSize: {
          ...base,
          width: patch.width ?? base.width,
          height: patch.height ?? base.height,
        },
      };
    });
  }

  function handleResize(
    id: string,
    patch: Partial<Pick<CardElement, 'x' | 'y' | 'width' | 'height'>>,
    orientation: 'landscape' | 'portrait',
    theme: ThemeMode = activeTheme,
  ) {
    updateThemeDesign(theme, (prev) => ({
      ...prev,
      layoutPreset: 'custom',
      elements: prev.elements.map((el) => {
        if (el.id !== id) return el;
        if (orientation === 'portrait') {
          const current = el.portrait ?? {};
          return {
            ...el,
            portrait: {
              x: patch.x ?? current.x ?? el.x,
              y: patch.y ?? current.y ?? el.y,
              width: patch.width ?? current.width ?? el.width,
              height: patch.height ?? current.height ?? el.height,
            },
          };
        }
        return {
          ...el,
          x: patch.x ?? el.x,
          y: patch.y ?? el.y,
          width: patch.width ?? el.width,
          height: patch.height ?? el.height,
        };
      }),
    }));
  }

  function handleDrag(
    id: string,
    x: number,
    y: number,
    orientation: 'landscape' | 'portrait',
    theme: ThemeMode,
  ) {
    updateThemeDesign(theme, (prev) => {
      if (orientation === 'portrait') {
        return {
          ...prev,
          layoutPreset: 'custom',
          elements: prev.elements.map((el) =>
            el.id === id ? { ...el, portrait: { ...(el.portrait ?? {}), x, y } } : el,
          ),
        };
      }
      return {
        ...prev,
        layoutPreset: 'custom',
        elements: prev.elements.map((el) => (el.id === id ? { ...el, x, y } : el)),
      };
    });
  }

  function selectElement(id: string | null, theme?: ThemeMode, orientation?: 'landscape' | 'portrait') {
    if (theme && theme !== activeTheme) setActiveTheme(theme);
    if (orientation) setActiveEditOrientation(orientation);
    setSelectedId(id);
    if (!id) setEditingId(null);
    if (id === CANVAS_SELECTION_ID && orientation) setActiveEditOrientation(orientation);
  }

  function addElement(type: CardElement['type']) {
    const el: CardElement = {
      id: createElementId(type),
      type,
      content: type === 'image' ? '/promos/promo-offer-boba100-v2.png' : type === 'code' ? promoCode : 'New text',
      x: 20,
      y: 20,
      width: type === 'image' ? 30 : 40,
      height: type === 'image' ? 40 : 10,
      fontSize: type === 'badge' ? 11 : 16,
      fontWeight: type === 'text' ? 'bold' : 'semibold',
      color: activeTheme === 'dark' ? '#ffffff' : '#111827',
      zIndex: 1,
    };
    updateDesign((prev) => {
      const nextEl = {
        ...el,
        color: type === 'badge' ? prev.accentColor : el.color,
        zIndex: prev.elements.length + 1,
      };
      return {
        ...prev,
        layoutPreset: 'custom',
        elements: [...prev.elements, nextEl],
      };
    });
    setSelectedId(el.id);
    if (type === 'text' || type === 'badge' || type === 'code') setEditingId(el.id);
  }

  function removeElement(elementId: string) {
    updateDesign((prev) => ({
      ...prev,
      elements: prev.elements.filter((e) => e.id !== elementId),
    }));
    setSelectedId(null);
    setEditingId(null);
  }

  async function handleImageUpload(file: File, target: 'background' | 'element') {
    try {
      const url = await uploadPromoImage(file);
      if (target === 'background') {
        updateDesign((prev) => ({ ...prev, backgroundImage: url, layoutPreset: 'background-image' }));
      } else if (selected?.type === 'image') {
        updateElement(selected.id, { content: url });
      } else {
        const imageEl = design.elements.find((e) => e.type === 'image');
        if (imageEl) updateElement(imageEl.id, { content: url });
      }
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function copyActiveToOtherTheme() {
    const other: ThemeMode = activeTheme === 'dark' ? 'light' : 'dark';
    applyChange((prevSet) => ({ ...prevSet, [other]: structuredClone(prevSet[activeTheme]) }));
    toast.success(`Copied ${activeTheme} design to ${other} mode`);
  }

  return (
    <div className="promo-card-designer">
      {(onSyncFromSetup || promotionSource) && (
        <div className="promo-card-designer__sync-row">
          <button
            type="button"
            className="promo-card-designer__sync-btn"
            onClick={() => {
              if (onSyncFromSetup) {
                onSyncFromSetup();
              } else if (promotionSource) {
                applyChange((prevSet) => syncCardDesignSetFromPromotion(prevSet, promotionSource));
              }
              toast.success('Card updated from Type & Rules');
            }}
          >
            <RefreshCw size={14} />
            Sync from Type &amp; Rules
          </button>
        </div>
      )}

      <div className="promo-card-designer__theme-tabs">
        {(['dark', 'light'] as const).map((theme) => (
          <button
            key={theme}
            type="button"
            className={`promo-card-designer__theme-tab${activeTheme === theme ? ' promo-card-designer__theme-tab--active' : ''}`}
            onClick={() => switchTheme(theme)}
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            Editing {theme === 'dark' ? 'Dark' : 'Light'} mode
          </button>
        ))}
        <button
          type="button"
          className="promo-card-designer__theme-copy"
          onClick={copyActiveToOtherTheme}
          title={`Copy ${activeTheme} design to the other theme`}
        >
          Copy to {activeTheme === 'dark' ? 'light' : 'dark'}
        </button>
      </div>

      <div className="promo-card-designer__toolbar">
        <div className="promo-card-designer__toolbar-group">
          <span className="promo-card-designer__toolbar-label"><LayoutTemplate size={14} /> Layout</span>
          <div className="promo-card-designer__preset-grid">
            {LAYOUT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`promo-card-designer__preset${design.layoutPreset === preset.value ? ' promo-card-designer__preset--active' : ''}`}
                onClick={() => handlePreset(preset.value)}
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="promo-card-designer__toolbar-group">
          <span className="promo-card-designer__toolbar-label"><Plus size={14} /> Add</span>
          <div className="promo-card-designer__add-row">
            <button type="button" className="promo-card-designer__add-btn" onClick={() => addElement('text')}><Type size={14} /> Text</button>
            <button type="button" className="promo-card-designer__add-btn" onClick={() => addElement('badge')}><Plus size={14} /> Badge</button>
            <button type="button" className="promo-card-designer__add-btn" onClick={() => addElement('code')}><Plus size={14} /> Code</button>
            <button type="button" className="promo-card-designer__add-btn" onClick={() => addElement('image')}><ImagePlus size={14} /> Image</button>
          </div>
        </div>

        <div className="promo-card-designer__toolbar-group">
          <span className="promo-card-designer__toolbar-label"><Palette size={14} /> Colors ({activeTheme})</span>
          <div className="promo-card-designer__color-row">
            <label className="promo-card-designer__color-field">
              Background
              <input
                type="color"
                value={design.backgroundColor}
                onChange={(e) => updateDesign((prev) => ({ ...prev, backgroundColor: e.target.value }))}
              />
            </label>
            <label className="promo-card-designer__color-field">
              Accent
              <input
                type="color"
                value={design.accentColor}
                onChange={(e) => updateDesign((prev) => ({ ...prev, accentColor: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="promo-card-designer__upload-btn"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} /> Upload image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file, selected?.type === 'image' ? 'element' : 'background');
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      <p className="promo-card-designer__theme-hint">
        Edit <strong>landscape</strong> and <strong>portrait</strong> cards separately below. Click the card background
        or any element to select · double-click text to edit · drag to move · pull corners to resize.
      </p>

      <div className="promo-card-designer__size-panel card p-4">
        <h4 className="text-sm font-bold text-white mb-3">Card dimensions ({activeTheme} mode)</h4>
        <div className="promo-card-designer__size-sections">
          <div className={`promo-card-designer__size-section${activeEditOrientation === 'landscape' ? ' promo-card-designer__size-section--active' : ''}`}>
            <p className="promo-card-designer__size-section-title">Landscape</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="promo-card-designer__field">
                Width (px)
                <input
                  className="input-field"
                  type="number"
                  min={160}
                  max={900}
                  value={Math.round(landscapeCanvas.width)}
                  onChange={(e) => handleCanvasResize({ width: Number(e.target.value) }, 'landscape')}
                />
              </label>
              <label className="promo-card-designer__field">
                Height (px)
                <input
                  className="input-field"
                  type="number"
                  min={60}
                  max={500}
                  value={Math.round(landscapeCanvas.height)}
                  onChange={(e) => handleCanvasResize({ height: Number(e.target.value) }, 'landscape')}
                />
              </label>
            </div>
          </div>
          <div className={`promo-card-designer__size-section${activeEditOrientation === 'portrait' ? ' promo-card-designer__size-section--active' : ''}`}>
            <p className="promo-card-designer__size-section-title">Portrait</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="promo-card-designer__field">
                Width (px)
                <input
                  className="input-field"
                  type="number"
                  min={120}
                  max={400}
                  value={Math.round(portraitCanvas.width)}
                  onChange={(e) => handleCanvasResize({ width: Number(e.target.value) }, 'portrait')}
                />
              </label>
              <label className="promo-card-designer__field">
                Height (px)
                <input
                  className="input-field"
                  type="number"
                  min={120}
                  max={600}
                  value={Math.round(portraitCanvas.height)}
                  onChange={(e) => handleCanvasResize({ height: Number(e.target.value) }, 'portrait')}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <PromotionCardFormatRibbon
          element={selected}
          onUpdate={(patch) => updateElement(selected.id, patch)}
          onDelete={() => removeElement(selected.id)}
          onReplaceImage={selected.type === 'image' ? () => fileRef.current?.click() : undefined}
        />
      )}

      {selected && (
        <div className="promo-card-designer__inspector card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-white capitalize">
              Advanced · {selected.type} · {activeEditOrientation} ({activeTheme} mode)
            </h4>
            <button
              type="button"
              className="promo-card-designer__delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                removeElement(selected.id);
              }}
              aria-label="Remove element"
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(selected.type === 'text' || selected.type === 'badge' || selected.type === 'code') && (
              <label className="promo-card-designer__field sm:col-span-2">
                Content
                <input
                  className="input-field"
                  value={selected.content}
                  onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                />
              </label>
            )}
            {selected.type === 'image' && (
              <>
                <label className="promo-card-designer__field sm:col-span-2">
                  Image URL
                  <input
                    className="input-field"
                    value={selected.content}
                    onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn-outline px-3 py-2 text-sm self-end"
                  onClick={() => fileRef.current?.click()}
                >
                  Replace image
                </button>
              </>
            )}
            <label className="promo-card-designer__field">
              Width %
              <input
                className="input-field"
                type="number"
                min={5}
                max={100}
                value={Math.round(selectedPos?.width ?? selected.width)}
                onChange={(e) => handleResize(selected.id, { width: Number(e.target.value) }, activeEditOrientation)}
              />
            </label>
            <label className="promo-card-designer__field">
              Height %
              <input
                className="input-field"
                type="number"
                min={5}
                max={100}
                value={Math.round(selectedPos?.height ?? selected.height)}
                onChange={(e) => handleResize(selected.id, { height: Number(e.target.value) }, activeEditOrientation)}
              />
            </label>
            <label className="promo-card-designer__field">
              X %
              <input
                className="input-field"
                type="number"
                min={0}
                max={100}
                value={Math.round(selectedPos?.x ?? selected.x)}
                onChange={(e) => handleResize(selected.id, { x: Number(e.target.value) }, activeEditOrientation)}
              />
            </label>
            <label className="promo-card-designer__field">
              Y %
              <input
                className="input-field"
                type="number"
                min={0}
                max={100}
                value={Math.round(selectedPos?.y ?? selected.y)}
                onChange={(e) => handleResize(selected.id, { y: Number(e.target.value) }, activeEditOrientation)}
              />
            </label>
            <label className="promo-card-designer__field">
              Layer (z-index)
              <input
                className="input-field"
                type="number"
                min={0}
                max={20}
                value={selected.zIndex}
                onChange={(e) => updateElement(selected.id, { zIndex: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      )}

      <div className="promo-card-designer__edit-stages">
        <div className="promo-card-designer__edit-stage">
          <PromotionCardPreview
            design={design}
            orientation="landscape"
            themeMode={activeTheme}
            interactive
            editorMode
            sizeMode="fixed"
            selectedElementId={activeEditOrientation === 'landscape' ? selectedId : null}
            editingElementId={activeEditOrientation === 'landscape' ? editingId : null}
            onSelectElement={(id) => selectElement(id, activeTheme, 'landscape')}
            onEditingElementId={setEditingId}
            onDragElement={(id, x, y, orientation) => handleDrag(id, x, y, orientation, activeTheme)}
            onResizeElement={(id, patch, orientation) => handleResize(id, patch, orientation, activeTheme)}
            onUpdateElement={(id, patch) => updateElement(id, patch)}
            onDeleteElement={removeElement}
            onResizeCanvas={(patch, orientation) => handleCanvasResize(patch, orientation, activeTheme)}
          />
        </div>

        <div className="promo-card-designer__edit-stage">
          <PromotionCardPreview
            design={design}
            orientation="portrait"
            themeMode={activeTheme}
            interactive
            editorMode
            sizeMode="fixed"
            selectedElementId={activeEditOrientation === 'portrait' ? selectedId : null}
            editingElementId={activeEditOrientation === 'portrait' ? editingId : null}
            onSelectElement={(id) => selectElement(id, activeTheme, 'portrait')}
            onEditingElementId={setEditingId}
            onDragElement={(id, x, y, orientation) => handleDrag(id, x, y, orientation, activeTheme)}
            onResizeElement={(id, patch, orientation) => handleResize(id, patch, orientation, activeTheme)}
            onUpdateElement={(id, patch) => updateElement(id, patch)}
            onDeleteElement={removeElement}
            onResizeCanvas={(patch, orientation) => handleCanvasResize(patch, orientation, activeTheme)}
          />
        </div>
      </div>

      <div className="promo-card-designer__previews">
        <p className="promo-card-designer__previews-heading">All previews — 2×2 grid (landscape &amp; portrait × dark &amp; light)</p>

        <div className="promo-card-designer__preview-grid">
          {(['landscape', 'portrait'] as const).map((orientation) =>
            (['dark', 'light'] as const).map((themeMode) => {
              const isActiveCell = themeMode === activeTheme;
              const previewDesign = designSet[themeMode];

              return (
                <div
                  key={`${orientation}-${themeMode}`}
                  className={`promo-card-designer__preview-grid-cell${isActiveCell ? ' promo-card-designer__preview-grid-cell--active' : ''}`}
                >
                  <p className="promo-card-designer__preview-label">
                    {orientation === 'landscape' ? 'Landscape' : 'Portrait'} · {themeMode === 'dark' ? 'Dark' : 'Light'}
                    {isActiveCell ? ' (editing theme)' : ''}
                  </p>
                  <PromotionCardPreview
                    design={previewDesign}
                    orientation={orientation}
                    themeMode={themeMode}
                    sizeMode="responsive"
                    previewMaxHeight={orientation === 'portrait' ? 160 : 110}
                  />
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

export { defaultCardDesignSet };
