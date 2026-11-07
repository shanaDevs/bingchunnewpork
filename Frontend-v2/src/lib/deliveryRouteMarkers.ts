import type { DeliveryRouteStop } from '@/lib/deliveryRoute';
import { formatStopAddress } from '@/lib/deliveryRoute';
import { resolveProductImageUrl } from '@/lib/productImageUrl';

export const BRANCH_STOP_EMOJI = '🏪';

export function escapeRouteHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function customerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export function stopSecondaryDetail(stop: DeliveryRouteStop): string {
  if (stop.distanceFromPreviousKm != null && stop.etaMinutesFromPrevious != null) {
    return ` · ${stop.distanceFromPreviousKm.toFixed(1)} km · ~${stop.etaMinutesFromPrevious} min`;
  }
  if (stop.itemCount != null) {
    return ` · ${stop.itemCount} item${stop.itemCount === 1 ? '' : 's'}`;
  }
  const address = formatStopAddress(stop);
  return address ? ` · ${address}` : '';
}

const COMPACT_WIDTH = 44;
const COMPACT_HEIGHT = 72;
const EXPANDED_WIDTH = 220;
const EXPANDED_HEIGHT = 86;
const PIN_ANCHOR_X = 22;

export function routeMapPinMetrics(selected: boolean) {
  return {
    iconSize: selected
      ? ([EXPANDED_WIDTH, EXPANDED_HEIGHT] as [number, number])
      : ([COMPACT_WIDTH, COMPACT_HEIGHT] as [number, number]),
    iconAnchor: [PIN_ANCHOR_X, selected ? EXPANDED_HEIGHT : COMPACT_HEIGHT] as [number, number],
  };
}

function buildMoreBadge(extraItemCount?: number): string {
  if (!extraItemCount || extraItemCount <= 0) return '';
  return `<span class="route-map-pin__more">+${extraItemCount}</span>`;
}

function buildThumbInnerHtml(options: {
  imageUrl?: string | null;
  fallbackLabel: string;
  extraItemCount?: number;
  isStore?: boolean;
}): string {
  const { imageUrl, fallbackLabel, extraItemCount, isStore } = options;
  const badge = buildMoreBadge(extraItemCount);

  if (isStore) {
    return `<span class="route-map-pin__branch-emoji">${BRANCH_STOP_EMOJI}</span>`;
  }

  const resolved = resolveProductImageUrl(imageUrl);
  if (resolved) {
    return `<img src="${escapeRouteHtml(resolved)}" alt="" class="route-map-pin__img" />${badge}`;
  }

  return `<span class="route-map-pin__initial">${escapeRouteHtml(fallbackLabel)}</span>${badge}`;
}

export function buildRouteMapPinHtml(options: {
  imageUrl?: string | null;
  fallbackLabel: string;
  extraItemCount?: number;
  title?: string;
  primaryDetail?: string;
  secondaryDetail?: string;
  selected: boolean;
  isStore?: boolean;
  /** Order for this stop has already been successfully delivered — render the pin green. */
  delivered?: boolean;
}): string {
  const {
    imageUrl,
    fallbackLabel,
    extraItemCount,
    title,
    primaryDetail,
    secondaryDetail,
    selected,
    isStore,
    delivered,
  } = options;

  const thumbClass = isStore
    ? 'route-map-pin__thumb route-map-pin__thumb--store'
    : 'route-map-pin__thumb route-map-pin__thumb--image';
  const thumbInner = buildThumbInnerHtml({ imageUrl, fallbackLabel, extraItemCount, isStore });
  const safeTitle = title ? escapeRouteHtml(title) : '';
  const safePrimary = primaryDetail ? escapeRouteHtml(primaryDetail) : '';
  const safeSecondary = secondaryDetail ? escapeRouteHtml(secondaryDetail) : '';
  const pinClass = `route-map-pin${delivered ? ' route-map-pin--delivered' : ''}`;

  if (selected && title && primaryDetail) {
    return `
      <div class="${pinClass} route-map-pin--expanded">
        <div class="route-map-pin__card route-map-pin__card--expanded">
          <div class="${thumbClass}">${thumbInner}</div>
          <div class="route-map-pin__body">
            <p class="route-map-pin__title">${safeTitle}</p>
            <p class="route-map-pin__detail">
              <span class="route-map-pin__detail-primary">${safePrimary}</span>${safeSecondary ? `<span class="route-map-pin__detail-secondary">${safeSecondary}</span>` : ''}
            </p>
          </div>
        </div>
        <div class="route-map-pin__anchor route-map-pin__anchor--left">
          <span class="route-map-pin__halo"></span>
          <span class="route-map-pin__dot"></span>
        </div>
      </div>
    `;
  }

  return `
    <div class="${pinClass}">
      <div class="route-map-pin__card route-map-pin__card--compact">
        <div class="${thumbClass}">${thumbInner}</div>
      </div>
      <div class="route-map-pin__anchor">
        <span class="route-map-pin__halo"></span>
        <span class="route-map-pin__dot"></span>
      </div>
    </div>
  `;
}
