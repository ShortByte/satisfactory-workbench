/**
 * Columnar binary codec for the map feature set. Instead of shipping a huge array
 * of feature objects across the Electron contextBridge (which deep-clones every
 * object and is very slow for 100k+ features), we pack the numeric fields into
 * typed arrays and dictionary-encode the repeated strings. The whole set then
 * clones as a few ArrayBuffers (memcpy) plus small dictionaries — no JSON parse.
 */
import type {
  FeatureCategory,
  FeatureCategoryCounts,
  MapFeature,
  MapFeatureSet,
} from './ipc-types';

/** Fixed category order — the index into this array is stored per feature. */
const CAT_ORDER: FeatureCategory[] = [
  'resourceNode',
  'geyser',
  'fracking',
  'resourceDeposit',
  'extractor',
  'production',
  'power',
  'logistics',
  'storage',
  'foundation',
  'wall',
  'ramp',
  'support',
  'vehicle',
  'creature',
  'flora',
  'player',
  'other',
];
const CAT_INDEX = new Map<FeatureCategory, number>(CAT_ORDER.map((c, i) => [c, i]));
const PURITIES = ['pure', 'normal', 'impure'] as const;
const PURITY_INDEX: Record<string, number> = { pure: 0, normal: 1, impure: 2 };

/** Wire format: typed columns + string dictionaries. All arrays have `count` items. */
export interface EncodedFeatures {
  count: number;
  cats: Uint8Array;
  typeIdx: Uint16Array;
  types: string[];
  x: Int32Array;
  y: Int32Array;
  z: Int32Array;
  rot: Int16Array;
  sizeX: Int16Array;
  sizeY: Int16Array;
  clock: Float32Array;
  resIdx: Int16Array;
  resources: string[];
  purity: Int8Array;
  extractsIdx: Int16Array;
  extracts: string[];
  /** Instance ids joined by "\n" (Satisfactory ids never contain newlines). */
  ids: string;
  counts: FeatureCategoryCounts;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Pack a feature set into the columnar wire format. */
export function encodeFeatures(set: MapFeatureSet): EncodedFeatures {
  const n = set.features.length;
  const cats = new Uint8Array(n);
  const typeIdx = new Uint16Array(n);
  const x = new Int32Array(n);
  const y = new Int32Array(n);
  const z = new Int32Array(n);
  const rot = new Int16Array(n);
  const sizeX = new Int16Array(n);
  const sizeY = new Int16Array(n);
  const clock = new Float32Array(n);
  const resIdx = new Int16Array(n);
  const purity = new Int8Array(n);
  const extractsIdx = new Int16Array(n);

  const types: string[] = [];
  const typeDict = new Map<string, number>();
  const resources: string[] = [];
  const resDict = new Map<string, number>();
  const extracts: string[] = [];
  const exDict = new Map<string, number>();
  const intern = (value: string, dict: Map<string, number>, list: string[]): number => {
    let i = dict.get(value);
    if (i === undefined) {
      i = list.length;
      list.push(value);
      dict.set(value, i);
    }
    return i;
  };

  const ids = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    const f = set.features[i];
    cats[i] = CAT_INDEX.get(f.category) ?? CAT_ORDER.length - 1; // fall back to "other"
    typeIdx[i] = intern(f.type, typeDict, types);
    x[i] = f.x;
    y[i] = f.y;
    z[i] = f.z;
    rot[i] = f.rot ?? 0;
    sizeX[i] = f.sizeX ?? 0;
    sizeY[i] = f.sizeY ?? 0;
    clock[i] = f.clock ?? NaN;
    resIdx[i] = f.resource != null ? intern(f.resource, resDict, resources) : -1;
    purity[i] = f.purity != null ? PURITY_INDEX[f.purity] : -1;
    extractsIdx[i] = f.extracts != null ? intern(f.extracts, exDict, extracts) : -1;
    ids[i] = f.id ?? '';
  }

  return {
    count: n,
    cats,
    typeIdx,
    types,
    x,
    y,
    z,
    rot,
    sizeX,
    sizeY,
    clock,
    resIdx,
    resources,
    purity,
    extractsIdx,
    extracts,
    ids: ids.join('\n'),
    counts: set.counts,
    bounds: set.bounds,
  };
}

/** Rebuild the feature set from the columnar wire format. */
export function decodeFeatures(e: EncodedFeatures): MapFeatureSet {
  const n = e.count;
  const ids = n > 0 ? e.ids.split('\n') : [];
  const features = new Array<MapFeature>(n);
  for (let i = 0; i < n; i++) {
    const f: MapFeature = {
      id: ids[i] ?? '',
      category: CAT_ORDER[e.cats[i]] ?? 'other',
      type: e.types[e.typeIdx[i]] ?? '',
      x: e.x[i],
      y: e.y[i],
      z: e.z[i],
    };
    if (e.rot[i] !== 0) f.rot = e.rot[i];
    if (e.sizeX[i] && e.sizeY[i]) {
      f.sizeX = e.sizeX[i];
      f.sizeY = e.sizeY[i];
    }
    if (!Number.isNaN(e.clock[i])) f.clock = e.clock[i];
    if (e.resIdx[i] >= 0) f.resource = e.resources[e.resIdx[i]];
    if (e.purity[i] >= 0) f.purity = PURITIES[e.purity[i]];
    if (e.extractsIdx[i] >= 0) f.extracts = e.extracts[e.extractsIdx[i]];
    features[i] = f;
  }
  return { features, counts: e.counts, bounds: e.bounds };
}
