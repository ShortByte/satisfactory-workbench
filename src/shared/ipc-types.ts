/**
 * Shared IPC contract between the Electron main process and the Angular renderer.
 * Keep this file free of any Node- or browser-specific imports so both sides can use it.
 */
import type { EncodedFeatures } from './feature-codec';

/** IPC channel names, centralised to avoid string drift between main and renderer. */
export const IpcChannels = {
  OpenSaveDialog: 'save:open-dialog',
  ParseSavePath: 'save:parse-path',
  ListBundledSaves: 'save:list-bundled',
  DiscoverSaves: 'save:discover',
  SftpList: 'sftp:list',
  SftpAdd: 'sftp:add',
  SftpRemove: 'sftp:remove',
  SftpTest: 'sftp:test',
  SftpPickKey: 'sftp:pick-key',
  SftpListSaves: 'sftp:list-saves',
  SftpOpen: 'sftp:open',
  AppVersion: 'app:version',
  GetReleases: 'update:releases',
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateInstall: 'update:install',
  UpdateStatus: 'update:status',
  GetMapFeatures: 'map:get-features',
  WindowMinimize: 'window:minimize',
  WindowMaximizeToggle: 'window:maximize-toggle',
  WindowClose: 'window:close',
  WindowIsMaximized: 'window:is-maximized',
  WindowMaximizedChanged: 'window:maximized-changed',
  LogError: 'log:error',
  OpenLogFolder: 'log:open-folder',
} as const;

/** An error record forwarded from the renderer to the main-process file logger. */
export interface LogEntry {
  /** Where it came from, e.g. "renderer" or "renderer:unhandledrejection". */
  source: string;
  message: string;
  stack?: string;
}

/**
 * Stable, locale-free error codes thrown by the main process. The renderer maps
 * these to translated messages (the main process has no access to the UI
 * language, which lives in the renderer's localStorage).
 */
export const IpcErrorCode = {
  NoSaveLoaded: 'ERR_NO_SAVE_LOADED',
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
  | 'foundation'
  | 'wall'
  | 'ramp'
  | 'support'
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
  /** Footprint size in Unreal units (cm), for structures drawn to scale (e.g. foundations). */
  sizeX?: number;
  sizeY?: number;
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

/** Which storefront/account a discovered save folder belongs to. */
export type SavePlatform = 'steam' | 'epic' | 'common' | 'other';

/** A save file discovered in a local Satisfactory save folder. */
export interface DiscoveredSave {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  /** Last-modified time, epoch milliseconds (for sorting/display). */
  modifiedAtMs: number;
}

/** A local save-games folder (one account) with the saves it contains. */
export interface SaveLocation {
  platform: SavePlatform;
  /** Account-id folder name (Steam ID64 / Epic account id); '' for the root. */
  accountId: string;
  /** Absolute path of the folder. */
  dirPath: string;
  /** Saves in this folder, most-recently-modified first. */
  saves: DiscoveredSave[];
}

/** SFTP authentication method for a dedicated-server connection. */
export type SftpAuthType = 'password' | 'key';

/** Stored SFTP connection metadata (never carries the secret to the renderer). */
export interface SftpConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  /** Remote directory that holds the server's `.sav` files. */
  remoteDir: string;
  authType: SftpAuthType;
}

/** Secret material for a connection — encrypted at rest via the OS keychain. */
export interface SftpSecret {
  password?: string;
  /** Absolute path to a private key file (read by the main process on connect). */
  privateKeyPath?: string;
  passphrase?: string;
}

/** Payload for creating a connection (metadata without id + its secret). */
export interface SftpConnectionInput {
  name: string;
  host: string;
  port?: number;
  username: string;
  remoteDir: string;
  authType: SftpAuthType;
  secret: SftpSecret;
}

/** A `.sav` file found on a remote server via SFTP. */
export interface RemoteSave {
  fileName: string;
  remotePath: string;
  fileSizeBytes: number;
  modifiedAtMs: number;
}

/** Auto-update lifecycle state (GitHub-releases updater). */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/** A published GitHub release (for the changelog page). */
export interface ReleaseInfo {
  /** Tag name, e.g. "v0.1.1". */
  version: string;
  /** Release title (falls back to the tag). */
  name: string;
  /** Release body in Markdown. */
  notes: string;
  /** ISO publish date. */
  date: string;
  /** URL of the release on GitHub. */
  url: string;
  prerelease: boolean;
}

/** Auto-update status pushed from the main process to the renderer. */
export interface UpdateStatus {
  state: UpdateState;
  /** Version of the available/downloaded update. */
  version?: string;
  /** Download progress 0–100 while state is 'downloading'. */
  progressPercent?: number;
  error?: string;
}

/** Uniform result wrapper so the renderer can handle failures without try/catch on IPC. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Shape of the API exposed on `window.satisfactory` by the preload script. */
export interface SatisfactoryBridge {
  /** @param title Localized title for the native open dialog (from the renderer). */
  openSaveDialog(title?: string): Promise<IpcResult<SaveSummary | null>>;
  parseSavePath(filePath: string): Promise<IpcResult<SaveSummary>>;
  listBundledSaves(): Promise<IpcResult<BundledSave[]>>;
  /** Auto-discover local Satisfactory save folders (Steam/Epic accounts). */
  discoverSaves(): Promise<IpcResult<SaveLocation[]>>;

  // SFTP dedicated-server connections.
  sftpList(): Promise<IpcResult<SftpConnection[]>>;
  sftpAdd(input: SftpConnectionInput): Promise<IpcResult<SftpConnection>>;
  sftpRemove(id: string): Promise<IpcResult<null>>;
  /** Try to connect + list the remote dir without saving; throws on failure. */
  sftpTest(input: SftpConnectionInput): Promise<IpcResult<RemoteSave[]>>;
  /** Open a native dialog to pick a private-key file; returns its path or null. */
  sftpPickKey(): Promise<IpcResult<string | null>>;
  /** List `.sav` files on a saved connection's remote dir. */
  sftpListSaves(id: string): Promise<IpcResult<RemoteSave[]>>;
  /** Download (cached) + parse a remote save; becomes the loaded save. */
  sftpOpen(id: string, remotePath: string, modifiedAtMs: number): Promise<IpcResult<SaveSummary>>;

  /** The running app version (from package.json / the installed build). */
  appVersion(): Promise<string>;
  /** Fetch published GitHub releases for the changelog. */
  getReleases(): Promise<IpcResult<ReleaseInfo[]>>;

  // Auto-update (GitHub releases).
  /** Check GitHub releases for a newer version. */
  updateCheck(): Promise<IpcResult<null>>;
  /** Start downloading the available update. */
  updateDownload(): Promise<IpcResult<null>>;
  /** Quit and install a downloaded update. */
  updateInstall(): void;
  /** Subscribe to update-status pushes; returns an unsubscribe function. */
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
  /**
   * Extract positioned world features from the currently loaded save, returned in
   * the columnar {@link EncodedFeatures} wire format. Typed arrays clone across
   * the contextBridge as fast memcpys (no per-object cloning, no JSON parse),
   * which keeps very large bases (100k+ objects) responsive. Decode in the renderer.
   */
  getMapFeatures(): Promise<IpcResult<EncodedFeatures>>;

  // Custom title-bar window controls (the window is frameless).
  /** Write a renderer-side error to the main-process log file. */
  logError(entry: LogEntry): void;
  /** Open the folder that holds the log file in the OS file manager. */
  openLogFolder(): void;

  windowMinimize(): void;
  windowMaximizeToggle(): void;
  windowClose(): void;
  windowIsMaximized(): Promise<boolean>;
  /** Subscribe to maximize/unmaximize; returns an unsubscribe function. */
  onWindowMaximizedChanged(cb: (maximized: boolean) => void): () => void;
}
