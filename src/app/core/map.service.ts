import { Injectable, computed, signal } from '@angular/core';
import type { FeatureCategory, MapFeatureSet } from '../../shared/ipc-types';

/** Presentation metadata per feature category (label, colour, default visibility). */
export interface CategoryStyle {
  label: string;
  color: string;
  /** Circle radius in pixels on the map. */
  radius: number;
  /** Whether the layer is shown by default (heavy/noisy layers start hidden). */
  visible: boolean;
}

/** Ordered category styles — order also drives the legend/filter list. */
export const CATEGORY_STYLES: Record<FeatureCategory, CategoryStyle> = {
  resourceNode: { label: 'Ressourcen-Nodes', color: '#ffd23f', radius: 5, visible: true },
  geyser: { label: 'Geysire', color: '#00e5ff', radius: 5, visible: true },
  fracking: { label: 'Fracking (Öl/Gas)', color: '#b06bff', radius: 4, visible: true },
  resourceDeposit: { label: 'Vorkommen (begrenzt)', color: '#c9a227', radius: 2, visible: false },
  extractor: { label: 'Extraktoren', color: '#ff5722', radius: 5, visible: true },
  production: { label: 'Produktion', color: '#4caf50', radius: 3, visible: true },
  power: { label: 'Strom', color: '#ffeb3b', radius: 2, visible: false },
  logistics: { label: 'Logistik', color: '#03a9f4', radius: 1.5, visible: false },
  storage: { label: 'Lager', color: '#8d6e63', radius: 3, visible: true },
  vehicle: { label: 'Fahrzeuge', color: '#ff9800', radius: 3, visible: true },
  creature: { label: 'Kreaturen', color: '#e91e63', radius: 1.5, visible: false },
  flora: { label: 'Flora/Pickups', color: '#7cb342', radius: 1.5, visible: false },
  player: { label: 'Spieler', color: '#ffffff', radius: 5, visible: true },
  other: { label: 'Sonstiges/Struktur', color: '#607d8b', radius: 1.5, visible: false },
};

/** Display info for an extractable resource (keyed by short class, e.g. "OreIron"). */
export interface ResourceInfo {
  label: string;
  color: string;
}

/** Resource registry: German label + a recognisable colour per raw resource. */
export const RESOURCE_INFO: Record<string, ResourceInfo> = {
  OreIron: { label: 'Eisen', color: '#c98a5e' },
  OreCopper: { label: 'Kupfer', color: '#e07b39' },
  OreGold: { label: 'Caterium', color: '#e6c200' },
  Coal: { label: 'Kohle', color: '#6b7280' },
  Stone: { label: 'Kalkstein', color: '#d9cba3' },
  RawQuartz: { label: 'Roh-Quarz', color: '#e08ad0' },
  Sulfur: { label: 'Schwefel', color: '#e6d23a' },
  OreBauxite: { label: 'Bauxit', color: '#c96f4a' },
  OreUranium: { label: 'Uran', color: '#8dff5a' },
  SAM: { label: 'SAM', color: '#b06bff' },
  LiquidOil: { label: 'Rohöl', color: '#9b59b6' },
  Water: { label: 'Wasser', color: '#3a9bd6' },
  NitrogenGas: { label: 'Stickstoffgas', color: '#6fa8dc' },
};

const RESOURCE_FALLBACK: ResourceInfo = { label: 'Unbekannt', color: '#8b97a7' };

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

  private readonly _data = signal<MapFeatureSet | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly data = this._data.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly hasData = computed(() => this._data() !== null);

  /** Load features for the current save. Safe to call repeatedly; refetches. */
  async load(): Promise<void> {
    if (!this.bridge) {
      this._error.set('Electron-Bridge nicht verfügbar.');
      return;
    }
    this._loading.set(true);
    this._error.set(null);
    try {
      const res = await this.bridge.getMapFeatures();
      if (!res.ok) throw new Error(res.error);
      this._data.set(res.data);
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
