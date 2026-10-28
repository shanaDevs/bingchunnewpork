import { formatPromotionBenefit, kindLabel, type PromotionKind, type PromotionRules } from '@/lib/promotionTypes';

export type CardLayoutPreset =
  | 'text-left-image-right'
  | 'text-right-image-left'
  | 'text-on-image'
  | 'background-image'
  | 'custom';

export type CardElementType = 'text' | 'image' | 'badge' | 'code';

export interface CardElement {
  id: string;
  type: CardElementType;
  content: string;
  /** Horizontal position as % of canvas width */
  x: number;
  /** Vertical position as % of canvas height */
  y: number;
  /** Width as % of canvas */
  width: number;
  /** Height as % of canvas (images) */
  height: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'semibold' | 'bold';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  zIndex: number;
  /** Portrait-specific overrides (optional) */
  portrait?: Partial<Pick<CardElement, 'x' | 'y' | 'width' | 'height'>>;
}

export interface CardCanvasSize {
  /** Landscape width in px */
  width: number;
  /** Landscape height in px */
  height: number;
  portrait?: { width?: number; height?: number };
}

export interface PromotionCardDesign {
  layoutPreset: CardLayoutPreset;
  backgroundColor: string;
  backgroundImage?: string;
  accentColor: string;
  elements: CardElement[];
  /** Custom card dimensions — editable by dragging canvas corners in the designer */
  canvasSize?: CardCanvasSize;
}

/** Special selection id when the card background (canvas) is selected in the designer */
export const CANVAS_SELECTION_ID = '__canvas__';

export const DEFAULT_LANDSCAPE_CANVAS = { width: 480, height: 180 } as const;
export const DEFAULT_PORTRAIT_CANVAS = { width: 200, height: 267 } as const;

export function getCanvasSize(
  design: PromotionCardDesign,
  orientation: 'landscape' | 'portrait',
): { width: number; height: number } {
  const cs = design.canvasSize;
  if (orientation === 'portrait') {
    return {
      width: cs?.portrait?.width ?? DEFAULT_PORTRAIT_CANVAS.width,
      height: cs?.portrait?.height ?? DEFAULT_PORTRAIT_CANVAS.height,
    };
  }
  return {
    width: cs?.width ?? DEFAULT_LANDSCAPE_CANVAS.width,
    height: cs?.height ?? DEFAULT_LANDSCAPE_CANVAS.height,
  };
}

/** Separate card designs for dark and light storefront themes */
export interface PromotionCardDesignSet {
  dark: PromotionCardDesign;
  light: PromotionCardDesign;
}

export const LAYOUT_PRESETS: { value: CardLayoutPreset; label: string; description: string }[] = [
  { value: 'text-left-image-right', label: 'Text Left · Image Right', description: 'Classic split layout' },
  { value: 'text-right-image-left', label: 'Image Left · Text Right', description: 'Reversed split layout' },
  { value: 'text-on-image', label: 'Text on Image', description: 'Overlay text on hero image' },
  { value: 'background-image', label: 'Background Image', description: 'Full-bleed background with text' },
  { value: 'custom', label: 'Custom', description: 'Free placement — drag elements anywhere' },
];

export function createElementId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultCardElements(code: string, theme: 'dark' | 'light'): CardElement[] {
  const isDark = theme === 'dark';
  return [
      {
        id: createElementId('badge'),
        type: 'badge',
        content: 'Limited Offer',
        x: 6,
        y: 8,
        width: 38,
        height: 8,
        fontSize: 11,
        fontWeight: 'semibold',
        color: isDark ? '#f5c518' : '#ca8a04',
        zIndex: 3,
      },
      {
        id: createElementId('title'),
        type: 'text',
        content: 'Your Promotion Title',
        x: 6,
        y: 22,
        width: 48,
        height: 18,
        fontSize: 22,
        fontWeight: 'bold',
        color: isDark ? '#ffffff' : '#111827',
        textAlign: 'left',
        zIndex: 2,
      },
      {
        id: createElementId('subtitle'),
        type: 'text',
        content: 'Describe the offer details here',
        x: 6,
        y: 42,
        width: 48,
        height: 14,
        fontSize: 13,
        fontWeight: 'normal',
        color: isDark ? '#94a3b8' : '#64748b',
        textAlign: 'left',
        zIndex: 2,
      },
      {
        id: createElementId('code'),
        type: 'code',
        content: code,
        x: 6,
        y: 62,
        width: 36,
        height: 12,
        fontSize: 14,
        fontWeight: 'bold',
        color: isDark ? '#ffffff' : '#1e293b',
        zIndex: 2,
      },
      {
        id: createElementId('image'),
        type: 'image',
        content: '/promos/promo-offer-bingchun50-removebg-preview.png',
        x: 58,
        y: 12,
        width: 36,
        height: 76,
        zIndex: 1,
      },
    ];
}

export function defaultCardDesign(code = 'PROMO'): PromotionCardDesign {
  return {
    layoutPreset: 'text-left-image-right',
    backgroundColor: '#1a2744',
    accentColor: '#f5c518',
    canvasSize: {
      width: DEFAULT_LANDSCAPE_CANVAS.width,
      height: DEFAULT_LANDSCAPE_CANVAS.height,
      portrait: { ...DEFAULT_PORTRAIT_CANVAS },
    },
    elements: defaultCardElements(code, 'dark'),
  };
}

export function defaultLightCardDesign(code = 'PROMO'): PromotionCardDesign {
  return {
    layoutPreset: 'text-left-image-right',
    backgroundColor: '#ffffff',
    accentColor: '#ca8a04',
    canvasSize: {
      width: DEFAULT_LANDSCAPE_CANVAS.width,
      height: DEFAULT_LANDSCAPE_CANVAS.height,
      portrait: { ...DEFAULT_PORTRAIT_CANVAS },
    },
    elements: defaultCardElements(code, 'light'),
  };
}

export function defaultCardDesignSet(code = 'PROMO'): PromotionCardDesignSet {
  return {
    dark: defaultCardDesign(code),
    light: defaultLightCardDesign(code),
  };
}

export function isCardDesignSet(value: unknown): value is PromotionCardDesignSet {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.dark === 'object' &&
    v.dark !== null &&
    typeof v.light === 'object' &&
    v.light !== null &&
    'layoutPreset' in (v.dark as object) &&
    'layoutPreset' in (v.light as object)
  );
}

/** Convert legacy single-design promos into a dark/light set */
function deriveLightFromDark(dark: PromotionCardDesign): PromotionCardDesign {
  return {
    ...dark,
    backgroundColor: '#ffffff',
    accentColor: dark.accentColor === '#f5c518' ? '#ca8a04' : dark.accentColor,
    elements: dark.elements.map((el) => {
      if (el.type !== 'text' && el.type !== 'badge' && el.type !== 'code') return el;
      let color = el.color;
      if (color === '#ffffff') color = '#111827';
      else if (color === '#94a3b8') color = '#64748b';
      else if (color === '#f5c518') color = '#ca8a04';
      else if (color === '#e2e8f0') color = '#475569';
      return { ...el, color };
    }),
  };
}

export function normalizeCardDesignSet(
  input: unknown,
  code = 'PROMO',
): PromotionCardDesignSet {
  if (!input) return defaultCardDesignSet(code);
  if (isCardDesignSet(input)) return input;
  const design = input as PromotionCardDesign;
  return { dark: design, light: deriveLightFromDark(design) };
}

export function getCardDesignForTheme(
  set: PromotionCardDesignSet,
  theme: 'dark' | 'light',
): PromotionCardDesign {
  return set[theme];
}

export function applyLayoutPreset(design: PromotionCardDesign, preset: CardLayoutPreset): PromotionCardDesign {
  const elements = design.elements.map((el) => ({ ...el }));
  const title = elements.find((e) => e.type === 'text' && e.id.includes('title')) ?? elements.find((e) => e.type === 'text');
  const subtitle = elements.find((e) => e.type === 'text' && e.id.includes('subtitle'));
  const image = elements.find((e) => e.type === 'image');
  const badge = elements.find((e) => e.type === 'badge');
  const codeEl = elements.find((e) => e.type === 'code');

  switch (preset) {
    case 'text-left-image-right':
      if (badge) Object.assign(badge, { x: 6, y: 8, width: 38 });
      if (title) Object.assign(title, { x: 6, y: 22, width: 48, textAlign: 'left' as const });
      if (subtitle) Object.assign(subtitle, { x: 6, y: 42, width: 48, textAlign: 'left' as const });
      if (codeEl) Object.assign(codeEl, { x: 6, y: 62, width: 36 });
      if (image) Object.assign(image, { x: 58, y: 12, width: 36, height: 76 });
      break;
    case 'text-right-image-left':
      if (badge) Object.assign(badge, { x: 52, y: 8, width: 38 });
      if (title) Object.assign(title, { x: 52, y: 22, width: 42, textAlign: 'left' as const });
      if (subtitle) Object.assign(subtitle, { x: 52, y: 42, width: 42, textAlign: 'left' as const });
      if (codeEl) Object.assign(codeEl, { x: 52, y: 62, width: 36 });
      if (image) Object.assign(image, { x: 6, y: 12, width: 36, height: 76 });
      break;
    case 'text-on-image':
      if (image) Object.assign(image, { x: 0, y: 0, width: 100, height: 100, zIndex: 0 });
      if (badge) Object.assign(badge, { x: 6, y: 10, width: 40, zIndex: 3 });
      if (title) Object.assign(title, { x: 6, y: 28, width: 88, color: '#ffffff', zIndex: 3 });
      if (subtitle) Object.assign(subtitle, { x: 6, y: 50, width: 88, color: '#e2e8f0', zIndex: 3 });
      if (codeEl) Object.assign(codeEl, { x: 6, y: 72, width: 40, zIndex: 3 });
      break;
    case 'background-image':
      if (image) Object.assign(image, { x: 0, y: 0, width: 100, height: 100, zIndex: 0 });
      if (badge) Object.assign(badge, { x: 8, y: 12, width: 40, zIndex: 2 });
      if (title) Object.assign(title, { x: 8, y: 30, width: 84, zIndex: 2 });
      if (subtitle) Object.assign(subtitle, { x: 8, y: 52, width: 84, zIndex: 2 });
      if (codeEl) Object.assign(codeEl, { x: 8, y: 74, width: 44, zIndex: 2 });
      break;
    default:
      break;
  }

  return { ...design, layoutPreset: preset, elements };
}

export function getElementPosition(
  element: CardElement,
  orientation: 'landscape' | 'portrait',
): Pick<CardElement, 'x' | 'y' | 'width' | 'height'> {
  if (orientation === 'portrait' && element.portrait) {
    return {
      x: element.portrait.x ?? element.x,
      y: element.portrait.y ?? element.y,
      width: element.portrait.width ?? element.width,
      height: element.portrait.height ?? element.height,
    };
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/** Source data from the Type & Rules step used to pre-fill the card designer */
export interface PromotionCardSource {
  code: string;
  title: string;
  description: string;
  promotionKind: string;
  promotionRules: PromotionRules;
}

function findTextElement(elements: CardElement[], role: 'title' | 'subtitle'): CardElement | undefined {
  const byId = elements.find((e) => e.type === 'text' && e.id.includes(role));
  if (byId) return byId;
  const texts = elements.filter((e) => e.type === 'text').sort((a, b) => a.y - b.y);
  return role === 'title' ? texts[0] : texts[1];
}

function pickProductImageUrl(rules: PromotionCardSource['promotionRules']): string | undefined {
  const product =
    rules.selectedProducts?.[0] ??
    rules.giftProduct ??
    rules.comboProducts?.[0];
  if (!product?.imageUrl) return undefined;
  // Keep relative /products paths; full URLs pass through
  return product.imageUrl;
}

/** Merge Type & Rules into both theme variants (keeps each theme's colors & layout) */
export function syncCardDesignSetFromPromotion(
  set: PromotionCardDesignSet,
  source: PromotionCardSource,
): PromotionCardDesignSet {
  return {
    dark: syncCardDesignFromPromotion(set.dark, source),
    light: syncCardDesignFromPromotion(set.light, source),
  };
}

/** Merge Type & Rules fields into an existing card layout (keeps positions & styling) */
export function syncCardDesignFromPromotion(
  design: PromotionCardDesign,
  source: PromotionCardSource,
): PromotionCardDesign {
  const kind = source.promotionKind as PromotionKind;

  const badgeText = kind ? kindLabel(kind) : 'Limited Offer';
  const titleText = source.title.trim() || (kind ? kindLabel(kind) : 'Promotion Title');
  const benefitText =
    source.description.trim() ||
    (kind ? formatPromotionBenefit(kind, source.promotionRules) : 'Offer details');
  const codeText = source.code.trim().toUpperCase() || 'PROMO';
  const productImage = pickProductImageUrl(source.promotionRules);
  const bannerImage = source.promotionRules.bannerImageUrl;

  const titleId = findTextElement(design.elements, 'title')?.id;
  const subtitleId = findTextElement(design.elements, 'subtitle')?.id;

  return {
    ...design,
    ...(kind === 'UPLOAD_BANNER' && bannerImage
      ? { backgroundImage: bannerImage, layoutPreset: 'background-image' as const }
      : {}),
    elements: design.elements.map((el) => {
      if (el.type === 'badge') return { ...el, content: badgeText };
      if (el.type === 'code') return { ...el, content: codeText };
      if (el.type === 'text' && el.id === titleId) return { ...el, content: titleText };
      if (el.type === 'text' && el.id === subtitleId) return { ...el, content: benefitText };
      if (el.type === 'image') {
        if (kind === 'UPLOAD_BANNER' && bannerImage) return { ...el, content: bannerImage };
        if (productImage) return { ...el, content: productImage };
      }
      return el;
    }),
  };
}
