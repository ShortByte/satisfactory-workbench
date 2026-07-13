import * as L from 'leaflet';
import type { FeatureCategory } from '../../../shared/ipc-types';
import { CATEGORY_STYLES } from '../../core/map.service';

/**
 * Categories rendered as rich SVG badge markers (recognisable symbol per type).
 * The rest stay as lightweight canvas circles for performance (they are the
 * high-count ambient layers: flora, logistics, power, creatures, deposits, other).
 */
export const ICON_CATEGORIES: ReadonlySet<FeatureCategory> = new Set<FeatureCategory>([
  'resourceNode',
  'geyser',
  'fracking',
  'extractor',
  'production',
  'storage',
  'vehicle',
  'player',
]);

/** White inner glyph (SVG markup) per icon category, drawn on a 24×24 viewBox. */
const GLYPHS: Partial<Record<FeatureCategory, string>> = {
  resourceNode: '<circle cx="12" cy="12" r="4.3" fill="none" stroke="#fff" stroke-width="2.4"/>',
  geyser:
    '<path d="M12 6.4c2 2.9 3.3 4.5 3.3 6.7a3.3 3.3 0 1 1-6.6 0c0-2.2 1.3-3.8 3.3-6.7z" fill="#fff"/>',
  fracking:
    '<path d="M12 6.4c2 2.9 3.3 4.5 3.3 6.7a3.3 3.3 0 1 1-6.6 0c0-2.2 1.3-3.8 3.3-6.7z" fill="#fff"/>',
  extractor:
    '<rect x="10.6" y="5.2" width="2.8" height="4" fill="#fff"/><path d="M7.3 8.6h9.4L12 16.6z" fill="#fff"/>',
  production:
    '<path d="M5.6 16.8v-5.6l3.3 1.9v-1.9l3 1.9v-1.9l3.5 1.9v3.7z" fill="#fff"/>',
  storage: '<rect x="6.9" y="8" width="10.2" height="8.6" rx="1.2" fill="none" stroke="#fff" stroke-width="2.1"/>',
  vehicle:
    '<rect x="5.9" y="9.8" width="7.3" height="4.8" rx="1" fill="#fff"/><path d="M13.2 11h2.5l1.5 2.1v1.5h-4z" fill="#fff"/>',
  player:
    '<circle cx="12" cy="9.4" r="2.5" fill="#fff"/><path d="M7 17.2c0-3 10-3 10 0z" fill="#fff"/>',
};

/** Diameter (px) per icon category — a couple of categories read as "bigger". */
const SIZES: Partial<Record<FeatureCategory, number>> = {
  resourceNode: 25,
  geyser: 23,
  player: 25,
};
const DEFAULT_SIZE = 21;

/** Cache one shared Icon per (category, colour) key. */
const iconCache = new Map<string, L.Icon>();

/**
 * Build a lightweight `<img>`-backed marker icon (a data-URI SVG) for a category.
 * Using L.icon (a single shared image src) instead of L.divIcon keeps the DOM
 * cheap — the browser decodes each SVG once and reuses it for every marker — and
 * the shadow is baked into the image (no per-marker CSS filter).
 *
 * `colorOverride` tints the badge (e.g. extractors coloured by their resource).
 */
export function markerIcon(category: FeatureCategory, colorOverride?: string): L.Icon {
  const color = colorOverride ?? CATEGORY_STYLES[category].color;
  const key = `${category}:${color}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const size = SIZES[category] ?? DEFAULT_SIZE;
  const glyph = GLYPHS[category] ?? '';
  const svg =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="12" cy="12.7" r="9.9" fill="#000" opacity="0.4"/>` + // baked shadow
    `<circle cx="12" cy="12" r="9.9" fill="${color}" stroke="#0c1014" stroke-width="1.4"/>` +
    glyph +
    `</svg>`;

  const icon = L.icon({
    iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: 'sf-marker',
  });
  iconCache.set(key, icon);
  return icon;
}

/** Resource key ("OreIron") -> bundled item icon URL. */
export function resourceIconUrl(resourceKey: string): string {
  return `icons/items/desc-${resourceKey.toLowerCase()}-c.png`;
}

const imgIconCache = new Map<string, L.DivIcon>();

/**
 * Resource-node marker: the real resource icon in a badge whose ring colour
 * encodes purity (impure/normal/pure). Lightweight divIcon (one <img>), cached.
 */
export function nodeMarker(resourceKey: string, purity: string): L.DivIcon {
  const key = `node:${resourceKey}:${purity}`;
  const cached = imgIconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    html: `<img src="${resourceIconUrl(resourceKey)}" alt="" draggable="false">`,
    className: `sf-imgmk sf-node sf-node--${purity}`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
  imgIconCache.set(key, icon);
  return icon;
}

/** Extractor marker: resource icon in an "active" (accent) square badge. */
export function extractorMarker(resourceKey: string): L.DivIcon {
  const key = `ext:${resourceKey}`;
  const cached = imgIconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    html: `<img src="${resourceIconUrl(resourceKey)}" alt="" draggable="false">`,
    className: 'sf-imgmk sf-ext',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
  imgIconCache.set(key, icon);
  return icon;
}

/** White purity pips: impure = 1 dot, normal = 2, pure = 3. */
const PURITY_PIPS: Record<string, string> = {
  impure: '<circle cx="12" cy="12" r="1.8" fill="#fff"/>',
  normal: '<circle cx="9.4" cy="12" r="1.8" fill="#fff"/><circle cx="14.6" cy="12" r="1.8" fill="#fff"/>',
  pure: '<circle cx="7.9" cy="12" r="1.8" fill="#fff"/><circle cx="12" cy="12" r="1.8" fill="#fff"/><circle cx="16.1" cy="12" r="1.8" fill="#fff"/>',
};

const nodeIconCache = new Map<string, L.Icon>();

/**
 * Resource-node icon: badge in the resource colour with purity pips
 * (impure/normal/pure = 1/2/3 dots). Cached per (colour, purity).
 */
export function nodeIcon(color: string, purity: string): L.Icon {
  const key = `${color}:${purity}`;
  const cached = nodeIconCache.get(key);
  if (cached) return cached;

  const size = 24;
  const svg =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="12" cy="12.7" r="9.9" fill="#000" opacity="0.4"/>` +
    `<circle cx="12" cy="12" r="9.9" fill="${color}" stroke="#0c1014" stroke-width="1.4"/>` +
    (PURITY_PIPS[purity] ?? '') +
    `</svg>`;

  const icon = L.icon({
    iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: 'sf-marker',
  });
  nodeIconCache.set(key, icon);
  return icon;
}
