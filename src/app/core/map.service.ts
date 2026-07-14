import { Injectable, computed, inject, signal } from '@angular/core';
import { IpcErrorCode } from '../../shared/ipc-types';
import type { FeatureCategory, MapFeatureSet } from '../../shared/ipc-types';
import { decodeFeatures } from '../../shared/feature-codec';
import { I18nService } from '../i18n/i18n.service';

/** Renderer-only sentinel: the Electron bridge is absent (plain browser). */
const ERR_BRIDGE_UNAVAILABLE = 'ERR_BRIDGE_UNAVAILABLE';

/** Map a known error code/sentinel to an i18n key (unknown → shown verbatim). */
const ERROR_KEYS: Record<string, string> = {
  [IpcErrorCode.NoSaveLoaded]: 'err.noSaveLoaded',
  [ERR_BRIDGE_UNAVAILABLE]: 'err.bridgeUnavailable',
};

/** Presentation metadata per feature category (colour + default visibility). */
export interface CategoryStyle {
  color: string;
  /** Circle radius in pixels on the map. */
  radius: number;
  /** Whether the layer is shown by default (heavy/noisy layers start hidden). */
  visible: boolean;
}

/**
 * Ordered category styles — order also drives the legend/filter list. Labels are
 * translated at the point of use via the i18n key `cat.<category>`.
 */
export const CATEGORY_STYLES: Record<FeatureCategory, CategoryStyle> = {
  resourceNode: { color: '#ffd23f', radius: 5, visible: true },
  geyser: { color: '#00e5ff', radius: 5, visible: true },
  fracking: { color: '#b06bff', radius: 4, visible: true },
  resourceDeposit: { color: '#c9a227', radius: 2, visible: false },
  extractor: { color: '#ff5722', radius: 5, visible: true },
  production: { color: '#4caf50', radius: 3, visible: true },
  power: { color: '#ffeb3b', radius: 2, visible: false },
  logistics: { color: '#03a9f4', radius: 1.5, visible: false },
  storage: { color: '#8d6e63', radius: 3, visible: true },
  foundation: { color: '#9aa7b3', radius: 1.5, visible: false },
  wall: { color: '#7d8b99', radius: 1.5, visible: false },
  ramp: { color: '#8a99a6', radius: 1.5, visible: false },
  support: { color: '#6b7682', radius: 1.5, visible: false },
  vehicle: { color: '#ff9800', radius: 3, visible: true },
  creature: { color: '#e91e63', radius: 1.5, visible: false },
  flora: { color: '#7cb342', radius: 1.5, visible: false },
  player: { color: '#ffffff', radius: 5, visible: true },
  other: { color: '#607d8b', radius: 1.5, visible: false },
};

/**
 * Display info for an extractable resource (keyed by short class, e.g. "OreIron").
 * `labelKey` is an i18n key; resolve it via `I18nService.t(labelKey)`.
 */
export interface ResourceInfo {
  labelKey: string;
  color: string;
}

/** Resource registry: i18n label key + a recognisable colour per raw resource. */
export const RESOURCE_INFO: Record<string, ResourceInfo> = {
  OreIron: { labelKey: 'res.OreIron', color: '#c98a5e' },
  OreCopper: { labelKey: 'res.OreCopper', color: '#e07b39' },
  OreGold: { labelKey: 'res.OreGold', color: '#e6c200' },
  Coal: { labelKey: 'res.Coal', color: '#6b7280' },
  Stone: { labelKey: 'res.Stone', color: '#d9cba3' },
  RawQuartz: { labelKey: 'res.RawQuartz', color: '#e08ad0' },
  Sulfur: { labelKey: 'res.Sulfur', color: '#e6d23a' },
  OreBauxite: { labelKey: 'res.OreBauxite', color: '#c96f4a' },
  OreUranium: { labelKey: 'res.OreUranium', color: '#8dff5a' },
  SAM: { labelKey: 'res.SAM', color: '#b06bff' },
  LiquidOil: { labelKey: 'res.LiquidOil', color: '#9b59b6' },
  Water: { labelKey: 'res.Water', color: '#3a9bd6' },
  NitrogenGas: { labelKey: 'res.NitrogenGas', color: '#6fa8dc' },
};

const RESOURCE_FALLBACK: ResourceInfo = { labelKey: 'res.unknown', color: '#8b97a7' };

export function resourceInfo(key: string | undefined): ResourceInfo {
  return (key && RESOURCE_INFO[key]) || RESOURCE_FALLBACK;
}

/**
 * Renderer-side facade for map features. Fetches the categorised feature set for
 * the currently loaded save from the Electron main process.
 */
@Injectable({ providedIn: 'root' })
export class MapService {
  private readonly bridge = typeof window !== 'undefined' ? window.satisfactory : undefined;
  private readonly i18n = inject(I18nService);

  private readonly _data = signal<MapFeatureSet | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly data = this._data.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Translated error message; re-evaluates when the language changes. */
  readonly error = computed<string | null>(() => {
    const e = this._error();
    if (!e) return null;
    const key = ERROR_KEYS[e];
    return key ? this.i18n.t(key) : e;
  });
  readonly hasData = computed(() => this._data() !== null);

  /** Load features for the current save. Safe to call repeatedly; refetches. */
  async load(): Promise<void> {
    if (!this.bridge) {
      this._error.set(ERR_BRIDGE_UNAVAILABLE);
      return;
    }
    this._loading.set(true);
    this._error.set(null);
    try {
      const res = await this.bridge.getMapFeatures();
      if (!res.ok) throw new Error(res.error);
      this._data.set(decodeFeatures(res.data));
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this._loading.set(false);
    }
  }

  clear(): void {
    this._data.set(null);
    this._error.set(null);
  }
}
