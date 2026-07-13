/**
 * Shared IPC contract between the Electron main process and the Angular renderer.
 * Keep this file free of any Node- or browser-specific imports so both sides can use it.
 */

/** IPC channel names, centralised to avoid string drift between main and renderer. */
export const IpcChannels = {
  OpenSaveDialog: 'save:open-dialog',
  ParseSavePath: 'save:parse-path',
  ListBundledSaves: 'save:list-bundled',
  GetMapFeatures: 'map:get-features',
} as const;

/** High-level classification of a positioned world object, for map layers. */
export type FeatureCategory =
  | 'resourceNode'
  | 'geyser'
  | 'fracking'
  | 'resourceDeposit'
  | 'extractor'
  | 'production'
  | 'power'
  | 'logistics'
  | 'storage'
  | 'vehicle'
  | 'creature'
  | 'flora'
  | 'player'
  | 'other';

/** A single positioned object rendered on the map. Kept compact — one save can
 *  contain tens of thousands of these. */
export interface MapFeature {
  /** Short unique-ish id derived from the instance name. */
  id: string;
  category: FeatureCategory;
  /** Readable class name, e.g. "Build_MinerMk2" or "BP_ResourceNode". */
  type: string;
  /** World position in Unreal units (cm). */
  x: number;
  y: number;
  z: number;
  /** Yaw in degrees (rotation around Z), if derivable. */
  rot?: number;
  /** For extractors: pathName of the resource node/deposit being mined. */
  extracts?: string;
  /** The resource's short class, e.g. "OreIron". For extractors this comes from
   *  the save (OutputInventory); for resource nodes from the matched reference data. */
  resource?: string;
  /** Node purity from the reference dataset (nodes are not typed in the save). */
  purity?: 'pure' | 'normal' | 'impure';
  /** For extractors: clock multiplier (1 = 100 %, 2.5 = 250 %) from the save. */
  clock?: number;
}

/** Per-category counts, for building the layer toggle UI. */
export type FeatureCategoryCounts = Record<FeatureCategory, number>;

export interface MapFeatureSet {
  features: MapFeature[];
  counts: FeatureCategoryCounts;
  /** Axis-aligned bounds of all features (cm). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** A single 3D position in the game world (Unreal units, cm). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One aggregated bucket in the object-type histogram. */
export interface TypeCount {
  typePath: string;
  count: number;
}

/** Per-level rollup of parsed objects. */
export interface LevelSummary {
  name: string;
  objectCount: number;
  collectableCount: number;
}

/** Lightweight, IPC-friendly summary of a parsed save. The full parsed save
 *  stays in the main process; the renderer only receives this digest for now. */
export interface SaveSummary {
  /** Absolute path the save was loaded from. */
  filePath: string;
  fileName: string;
  fileSizeBytes: number;

  // Header fields
  saveName: string;
  sessionName: string;
  mapName: string;
  buildVersion: number;
  saveVersion: number;
  saveHeaderType: number;
  playDurationSeconds: number;
  saveDateTime: string;
  isModded: boolean;
  creativeModeEnabled: boolean;

  // Body rollups
  levelCount: number;
  totalObjectCount: number;
  totalEntityCount: number;
  totalComponentCount: number;
  levels: LevelSummary[];
  /** Top-N most frequent object type paths across all levels. */
  topTypes: TypeCount[];

  /** How long parsing took, milliseconds. */
  parseDurationMs: number;
}

/** A save file discovered in the bundled `saves/` folder. */
export interface BundledSave {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
}

/** Uniform result wrapper so the renderer can handle failures without try/catch on IPC. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Shape of the API exposed on `window.satisfactory` by the preload script. */
export interface SatisfactoryBridge {
  openSaveDialog(): Promise<IpcResult<SaveSummary | null>>;
  parseSavePath(filePath: string): Promise<IpcResult<SaveSummary>>;
  listBundledSaves(): Promise<IpcResult<BundledSave[]>>;
  /** Extract positioned world features from the currently loaded save. */
  getMapFeatures(): Promise<IpcResult<MapFeatureSet>>;
}
